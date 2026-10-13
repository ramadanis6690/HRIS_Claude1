// Pekerjaan terjadwal (design_final.md §9). Dijalankan systemd timer, bukan daemon:
//   node dist/server/server/pekerjaan/jalankan.js <nama>
// Setiap pekerjaan menulis satu baris ringkas ke log_pemicu, supaya yang gagal
// tidak diam: Beranda Super Admin menandai merah pekerjaan yang terlambat.
import { pathToFileURL } from 'node:url';
import { tambahHari, tanggalWIB } from '../../core/tanggal.js';
import * as berkas from '../berkas.js';
import { baca, bacaSatu, sambung, transaksi, tutup } from '../db.js';
import { bacaKonfig, muatBerkasEnv } from '../konfig.js';
import { log } from '../log.js';
import { nonaktifkanPegawai } from '../modul/pegawai.js';
import { operasional, tulis } from '../repo.js';

type Pekerjaan = (argumen: string[]) => Promise<number>;

async function angkaPengaturan(kunci: string, bawaan: number): Promise<number> {
  const r = await bacaSatu<{ nilai: string }>('SELECT nilai FROM pengaturan WHERE kunci = $1', [kunci]);
  const n = Number(r?.nilai);
  return Number.isFinite(n) && n > 0 ? n : bawaan;
}

/** 02.00 — ATT-13: foto presensi > 365 hari dihapus; barisnya tetap, `foto_dihapus_pada` terisi. */
const hapusFoto: Pekerjaan = async () => {
  const hari = await angkaPengaturan('retensi_foto_hari', 365);
  const batas = tambahHari(tanggalWIB(new Date()), -hari);
  const foto = await baca<{ berkas_id: string; jalur: string; presensi_id: string | null }>(
    `SELECT b.id AS berkas_id, b.jalur_relatif AS jalur, pr.id AS presensi_id
       FROM berkas b LEFT JOIN presensi pr ON pr.foto_file_id = b.id
      WHERE b.golongan = 'presensi' AND b.dihapus_pada IS NULL AND (b.dibuat_pada AT TIME ZONE 'Asia/Jakarta')::date < $1
      LIMIT 5000`,
    [batas],
  );
  const alasan = `Retensi foto presensi ${hari} hari`;
  for (const f of foto) {
    await transaksi(async (tx) => {
      const sekarang = new Date();
      await tulis('berkas', 'ubah', { id: f.berkas_id, dihapus_pada: sekarang }, { pelaku: null, alasan }, tx);
      if (f.presensi_id) await tulis('presensi', 'ubah', { id: f.presensi_id, foto_dihapus_pada: sekarang }, { pelaku: null, alasan }, tx);
    });
    await berkas.hapusIsi(f.jalur);
  }
  return foto.length;
};

/** 02.30 — USR-09: pegawai Berhenti/Meninggal nonaktif pada hari setelah tanggal berhentinya. */
const nonaktifkanBerhenti: Pekerjaan = async () => {
  const hariIni = tanggalWIB(new Date());
  const p = await baca<{ id: string }>(
    `SELECT id FROM pegawai WHERE aktif AND status_pegawai IN ('berhenti','meninggal') AND tgl_berhenti < $1`,
    [hariIni],
  );
  for (const x of p) await transaksi((tx) => nonaktifkanPegawai(tx, x.id, null, 'Tanggal berhenti sudah lewat (USR-09)'));
  return p.length;
};

/** 03.00 — berkas ekspor > 7 hari dan sesi kedaluwarsa > 7 hari. */
const bersihkan: Pekerjaan = async () => {
  const ekspor = await baca<{ id: string; jalur: string }>(
    `SELECT id, jalur_relatif AS jalur FROM berkas WHERE golongan = 'ekspor' AND dihapus_pada IS NULL AND dibuat_pada < now() - interval '7 days'`,
  );
  for (const e of ekspor) {
    await tulis('berkas', 'ubah', { id: e.id, dihapus_pada: new Date() }, { pelaku: null, alasan: 'Ekspor lebih dari 7 hari' });
    await berkas.hapusIsi(e.jalur);
  }
  const sesi = await operasional.sesiBuang(new Date(Date.now() - 7 * 86_400_000));
  return ekspor.length + sesi;
};

/** Tiap jam — sesi yang kedaluwarsa atau dicabut lebih dari 7 hari lalu. */
const sesi: Pekerjaan = async () => operasional.sesiBuang(new Date(Date.now() - 7 * 86_400_000));

/** 06.00 — EMP-16: pengingat kontrak, sertifikat, dan kontak darurat ke Admin HRD (sekali sehari). */
const pengingat: Pekerjaan = async () => {
  const hariIni = tanggalWIB(new Date());
  const [hk, hs] = await Promise.all([angkaPengaturan('pengingat_kontrak_hari', 30), angkaPengaturan('pengingat_sertifikat_hari', 60)]);
  const hrd = await baca<{ id: string }>(
    `SELECT DISTINCT pa.pegawai_id AS id FROM peran_admin pa JOIN pegawai p ON p.id = pa.pegawai_id AND p.aktif
      WHERE pa.peran = 'admin_hrd' AND pa.aktif`,
  );
  const pesan: { jenis: string; judul: string; isi: string }[] = [];
  for (const k of await baca<{ nama: string; tgl: string }>(
    `SELECT nama_lengkap AS nama, tgl_akhir_kontrak AS tgl FROM pegawai WHERE aktif AND tgl_akhir_kontrak BETWEEN $1::date AND $1::date + $2::int`,
    [hariIni, hk],
  )) pesan.push({ jenis: 'pengingat_kontrak', judul: `Kontrak ${k.nama} berakhir ${k.tgl}`, isi: 'Perpanjang atau siapkan pemberhentian.' });
  for (const s of await baca<{ nama: string; sertifikat: string; tgl: string }>(
    `SELECT p.nama_lengkap AS nama, s.nama AS sertifikat, s.berlaku_sampai AS tgl FROM sertifikasi s JOIN pegawai p ON p.id = s.pegawai_id
      WHERE s.aktif AND p.aktif AND s.berlaku_sampai BETWEEN $1::date AND $1::date + $2::int`,
    [hariIni, hs],
  )) pesan.push({ jenis: 'pengingat_sertifikat', judul: `Sertifikat ${s.sertifikat} (${s.nama}) habis ${s.tgl}`, isi: 'Minta sertifikat terbaru.' });

  let n = 0;
  for (const h of hrd) {
    for (const m of pesan) {
      const sudah = await bacaSatu(
        `SELECT 1 FROM notifikasi WHERE penerima_id = $1 AND judul = $2 AND (dibuat_pada AT TIME ZONE 'Asia/Jakarta')::date = $3`,
        [h.id, m.judul, hariIni],
      );
      if (sudah) continue;
      await tulis('notifikasi', 'tambah', { penerima_id: h.id, jenis: m.jenis, judul: m.judul, isi: m.isi, tautan: '/pegawai' }, { pelaku: null });
      n++;
    }
  }
  return n;
};

/** Dipanggil deploy/backup.sh setelah selesai, supaya hasil backup tampil di Beranda Super Admin. */
const catatBackup: Pekerjaan = async ([status, ...pesan]) => {
  const berhasil = status === 'berhasil';
  await operasional.catatPekerjaan({ pekerjaan: 'backup', jumlahDiproses: berhasil ? 1 : 0, berhasil, galat: berhasil ? null : pesan.join(' ') || 'gagal' });
  return berhasil ? 1 : 0;
};

const DAFTAR: Record<string, Pekerjaan> = {
  'hapus-foto': hapusFoto,
  'nonaktifkan-berhenti': nonaktifkanBerhenti,
  bersihkan,
  sesi,
  pengingat,
};

export async function jalankanPekerjaan(nama: string, argumen: string[] = []): Promise<number> {
  if (nama === 'catat-backup') return catatBackup(argumen);
  const p = DAFTAR[nama];
  if (!p) throw new Error(`Pekerjaan tidak dikenal: ${nama}. Pilihan: ${Object.keys(DAFTAR).join(', ')}, catat-backup`);
  try {
    const n = await p(argumen);
    await operasional.catatPekerjaan({ pekerjaan: nama, jumlahDiproses: n, berhasil: true, galat: null });
    return n;
  } catch (e) {
    await operasional.catatPekerjaan({ pekerjaan: nama, jumlahDiproses: 0, berhasil: false, galat: e instanceof Error ? e.message.slice(0, 500) : String(e) });
    throw e;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  muatBerkasEnv();
  const konfig = bacaKonfig();
  sambung(konfig.databaseUrl);
  berkas.aturAkar(konfig.dirBerkas);
  const [nama = '', ...argumen] = process.argv.slice(2);
  jalankanPekerjaan(nama, argumen)
    .then((n) => log.info('Pekerjaan selesai', { pekerjaan: nama, diproses: n }))
    .catch((e) => {
      log.galat('Pekerjaan gagal', e, { pekerjaan: nama });
      process.exitCode = 1;
    })
    .finally(() => void tutup());
}
