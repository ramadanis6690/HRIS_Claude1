// Beranda per peran (PRD §6.12, SRS DSH-01, DSH-07, DSH-08, DSH-15).
// Bagian yang bukan hak pengguna tidak dimuat dari server sama sekali.
import type { Beranda, ItemTindakan, StatusPekerjaan } from '../../bersama/aksi.js';
import { awalBulan, daftarTanggal, hariKerja, tambahHari, tanggalWIB } from '../../core/tanggal.js';
import * as audit from '../audit.js';
import { baca, bacaSatu } from '../db.js';
import { punya, punyaSalahSatu, unitDiawasi, type Pengguna } from '../izin.js';
import { daftarKonflik } from './pengguna.js';
import { hariIni, jamKerjaPada, liburAntara } from './presensi.js';

export async function ringkasan(u: Pengguna): Promise<Beranda> {
  const sekarang = new Date();
  const hari = tanggalWIB(sekarang);
  const presensiHariIni = await hariIni(u, sekarang);

  const awal = awalBulan(hari);
  const [jk, libur, saya] = await Promise.all([
    jamKerjaPada(hari),
    liburAntara(awal, hari),
    baca<{ tanggal: string; menit_terlambat: number; sumber: string; pulang_pada: Date | null }>(
      'SELECT tanggal, menit_terlambat, sumber, pulang_pada FROM presensi WHERE pegawai_id = $1 AND tanggal BETWEEN $2 AND $3',
      [u.pegawaiId, awal, hari],
    ),
  ]);
  const per = new Map(saya.map((s) => [s.tanggal, s]));
  const kehadiranBulanIni: Beranda['kehadiranBulanIni'] = daftarTanggal(awal, hari).map((t) => {
    const s = per.get(t);
    if (s) return { tanggal: t, status: s.sumber === 'dinas_luar' ? 'dinas' : s.menit_terlambat > 0 ? 'terlambat' : 'hadir' };
    if (!hariKerja(t, jk.hariKerja, libur)) return { tanggal: t, status: 'libur' };
    return { tanggal: t, status: t === hari || !presensiHariIni.wajibPresensi ? 'belum' : 'mangkir' };
  });
  const hasil: Beranda = {
    presensiHariIni,
    kehadiranBulanIni,
    ringkasBulanIni: {
      hadir: saya.length,
      terlambat: saya.filter((s) => s.menit_terlambat > 0).length,
      menitTerlambat: saya.reduce((n, s) => n + s.menit_terlambat, 0),
      tanpaCheckOut: saya.filter((s) => !s.pulang_pada && s.sumber !== 'dinas_luar' && s.tanggal !== hari).length,
    },
  };

  if (punyaSalahSatu(u, ['manager', 'direksi', 'dirut'])) {
    const unit = await unitDiawasi(u);
    if (unit.length > 0) {
      const tim = await baca<{ nama: string; masuk: Date | null; pulang: Date | null; wajib: boolean }>(
        `SELECT p.nama_lengkap AS nama, pr.masuk_pada AS masuk, pr.pulang_pada AS pulang, p.wajib_presensi AS wajib
           FROM pegawai p LEFT JOIN presensi pr ON pr.pegawai_id = p.id AND pr.tanggal = $2
          WHERE p.aktif AND p.unit_id = ANY($1::uuid[]) AND p.id <> $3 ORDER BY p.nama_lengkap`,
        [unit, hari, u.pegawaiId],
      );
      hasil.tim = {
        hadir: tim.filter((t) => t.masuk).length,
        belum: tim.filter((t) => !t.masuk && t.wajib).length,
        total: tim.length,
        nama: tim.map((t) => ({ nama: t.nama, keadaan: t.masuk ? (t.pulang ? 'Lengkap' : 'Hadir') : t.wajib ? 'Belum check-in' : 'Tidak wajib presensi' })),
      };
    }
  }

  if (punya(u, 'admin_hrd')) hasil.hrd = await blokHrd(hari);
  if (punya(u, 'auditor')) hasil.auditor = await blokAuditor();
  if (punya(u, 'super_admin')) {
    hasil.superAdmin = { konflikPeran: await daftarKonflik(), pekerjaan: await statusPekerjaan(), akunTerkunci: await akunTerkunci() };
  }
  return hasil;
}

async function akunTerkunci(): Promise<number> {
  const r = await bacaSatu<{ n: number }>('SELECT count(*)::int AS n FROM pengguna WHERE terkunci_sampai > now()');
  return r?.n ?? 0;
}

async function blokHrd(hari: string): Promise<NonNullable<Beranda['hrd']>> {
  const pengaturan = new Map(
    (await baca<{ kunci: string; nilai: string }>('SELECT kunci, nilai FROM pengaturan')).map((p) => [p.kunci, Number(p.nilai)]),
  );
  const hariKontrak = pengaturan.get('pengingat_kontrak_hari') ?? 30;
  const hariSertifikat = pengaturan.get('pengingat_sertifikat_hari') ?? 60;
  const kemarin = tambahHari(hari, -1);
  const [tanpaAkun, tanpaKontak, kontrak, sertifikat, luarRadius, tanpaCheckOut, hadir] = await Promise.all([
    baca<{ id: string; nama: string }>(
      'SELECT p.id, p.nama_lengkap AS nama FROM pegawai p WHERE p.aktif AND NOT EXISTS (SELECT 1 FROM pengguna g WHERE g.pegawai_id = p.id) ORDER BY p.nama_lengkap',
    ),
    baca<{ id: string; nama: string }>(
      `SELECT p.id, p.nama_lengkap AS nama FROM pegawai p
        WHERE p.aktif AND NOT EXISTS (SELECT 1 FROM keluarga k WHERE k.pegawai_id = p.id AND k.aktif AND k.kontak_darurat)
        ORDER BY p.nama_lengkap`,
    ),
    baca<{ id: string; nama: string; tgl: string }>(
      `SELECT id, nama_lengkap AS nama, tgl_akhir_kontrak AS tgl FROM pegawai
        WHERE aktif AND tgl_akhir_kontrak BETWEEN $1::date AND $1::date + $2::int ORDER BY tgl_akhir_kontrak`,
      [hari, hariKontrak],
    ),
    baca<{ pegawai_id: string; nama: string; sertifikat: string; tgl: string }>(
      `SELECT s.pegawai_id, p.nama_lengkap AS nama, s.nama AS sertifikat, s.berlaku_sampai AS tgl
         FROM sertifikasi s JOIN pegawai p ON p.id = s.pegawai_id
        WHERE s.aktif AND p.aktif AND s.berlaku_sampai BETWEEN $1::date AND $1::date + $2::int ORDER BY s.berlaku_sampai`,
      [hari, hariSertifikat],
    ),
    baca<{ n: number }>(
      `SELECT count(*)::int AS n FROM percobaan_check_in WHERE status = 'ditolak' AND (waktu AT TIME ZONE 'Asia/Jakarta')::date >= $1::date - 7`,
      [hari],
    ),
    baca<{ nama: string }>(
      `SELECT p.nama_lengkap AS nama FROM presensi pr JOIN pegawai p ON p.id = pr.pegawai_id
        WHERE pr.tanggal = $1 AND pr.masuk_pada IS NOT NULL AND pr.pulang_pada IS NULL AND pr.sumber <> 'dinas_luar'`,
      [kemarin],
    ),
    baca<{ wajib: boolean; hadir: boolean }>(
      `SELECT p.wajib_presensi AS wajib, pr.id IS NOT NULL AS hadir
         FROM pegawai p LEFT JOIN presensi pr ON pr.pegawai_id = p.id AND pr.tanggal = $1 WHERE p.aktif`,
      [hari],
    ),
  ]);
  const t: ItemTindakan[] = [];
  if (tanpaAkun.length) t.push({ jenis: 'tanpa_akun', judul: `${tanpaAkun.length} pegawai belum punya akun`, rincian: tanpaAkun.slice(0, 5).map((x) => x.nama).join(', '), menu: 'user_management' });
  if (tanpaKontak.length) t.push({ jenis: 'tanpa_kontak_darurat', judul: `${tanpaKontak.length} pegawai tanpa kontak darurat`, rincian: tanpaKontak.slice(0, 5).map((x) => x.nama).join(', '), menu: 'data_pegawai' });
  for (const k of kontrak) t.push({ jenis: 'kontrak', judul: `Kontrak ${k.nama} berakhir ${k.tgl}`, rincian: 'Perpanjang atau siapkan pemberhentian.', menu: 'data_pegawai', pegawaiId: k.id });
  for (const s of sertifikat) t.push({ jenis: 'sertifikat', judul: `Sertifikat ${s.sertifikat} (${s.nama}) habis ${s.tgl}`, rincian: 'Minta sertifikat terbaru.', menu: 'data_pegawai', pegawaiId: s.pegawai_id });
  if (luarRadius[0]?.n) t.push({ jenis: 'luar_radius', judul: `${luarRadius[0].n} percobaan check-in di luar radius (7 hari)`, rincian: 'Periksa di Rekap Kehadiran.', menu: 'rekap_kehadiran' });
  if (tanpaCheckOut.length) t.push({ jenis: 'tanpa_check_out', judul: `${tanpaCheckOut.length} pegawai tanpa check-out kemarin`, rincian: tanpaCheckOut.map((x) => x.nama).join(', '), menu: 'rekap_kehadiran' });
  return {
    tindakan: t,
    kehadiranHariIni: {
      hadir: hadir.filter((h) => h.hadir).length,
      belum: hadir.filter((h) => !h.hadir && h.wajib).length,
      tidakWajib: hadir.filter((h) => !h.hadir && !h.wajib).length,
      total: hadir.length,
    },
  };
}

const TABEL_SENSITIF = ['gaji', 'pegawai', 'peran_admin', 'pengguna', 'presensi', 'tabel_grade', 'jam_kerja', 'titik_kantor'];

async function blokAuditor(): Promise<NonNullable<Beranda['auditor']>> {
  const [rantai, sensitif, reset] = await Promise.all([
    audit.periksaRantai(),
    bacaSatu<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE tabel = ANY($1::text[]) AND aksi <> 'tambah' AND waktu > now() - interval '7 days'`,
      [TABEL_SENSITIF],
    ),
    bacaSatu<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log WHERE tabel = 'pengguna' AND alasan = 'Reset kata sandi oleh admin' AND waktu > now() - interval '30 days'`,
    ),
  ]);
  return { rantai, perubahanSensitif7Hari: sensitif?.n ?? 0, resetSandi30Hari: reset?.n ?? 0, akunTerkunci: await akunTerkunci() };
}

/** Pekerjaan terjadwal dan batas jedanya (design §9). Lebih dari batas = ditandai merah. */
export const JADWAL_PEKERJAAN: Record<string, number> = {
  backup: 26,
  'hapus-foto': 26,
  'nonaktifkan-berhenti': 26,
  bersihkan: 26,
  pengingat: 26,
  sesi: 2,
};

export async function statusPekerjaan(): Promise<StatusPekerjaan[]> {
  const rows = await baca<{ pekerjaan: string; waktu: Date; berhasil: boolean; galat: string | null }>(
    `SELECT DISTINCT ON (pekerjaan) pekerjaan, waktu, berhasil, galat FROM log_pemicu ORDER BY pekerjaan, waktu DESC`,
  );
  const per = new Map(rows.map((r) => [r.pekerjaan, r]));
  return Object.entries(JADWAL_PEKERJAAN).map(([nama, jam]) => {
    const r = per.get(nama);
    return {
      pekerjaan: nama,
      terakhir: r?.waktu.toISOString() ?? null,
      berhasil: r?.berhasil ?? null,
      galat: r?.galat ?? null,
      terlambat: !r || !r.berhasil || Date.now() - r.waktu.getTime() > jam * 3600_000,
    };
  });
}
