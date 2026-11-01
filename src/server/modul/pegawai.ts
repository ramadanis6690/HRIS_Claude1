// Data pegawai, riwayat, dokumen, foto profil, dan gaji berversi
// (PRD §6.2, SRS EMP-*, OTZ-02 – OTZ-07).
import type {
  BarisRiwayat, DataPegawai, DetailPegawai, DokumenPegawai, JenisRiwayat, RingkasPegawai, RiwayatStatus,
  StatusPegawai, VersiGaji,
} from '../../bersama/aksi.js';
import { JENIS_DOKUMEN, JENIS_RIWAYAT, STATUS_PEGAWAI } from '../../bersama/aksi.js';
import { KOLOM_PEGAWAI, KOLOM_RIWAYAT, type DefKolom } from '../../bersama/pegawai.js';
import { formatMasaKerja, masaKerja, tambahHari, tanggalSah, tanggalWIB } from '../../core/tanggal.js';
import {
  GalatMasukan, angkaWajib, boolOpsional, objek, periksaGapok, pilihanWajib, tanggalWajib, teksOpsional, teksWajib,
  uuidWajib, type BarisGrade,
} from '../../core/validasi.js';
import * as berkas from '../berkas.js';
import { baca, bacaSatu, transaksi, type Tx } from '../db.js';
import { ditolak, galat } from '../galat.js';
import {
  atasanDari, bisaBacaDokumen, bisaBacaGaji, bisaBacaProfilPenuh, bisaKelolaPegawai, punya, type Pengguna,
} from '../izin.js';
import { operasional, tulis } from '../repo.js';

// ---------------------------------------------------------------------------
// Membaca masukan menurut definisi kolom
// ---------------------------------------------------------------------------

/** Nilai satu kolom dari masukan, divalidasi menurut definisinya. undefined = tidak dikirim. */
export function nilaiKolom(def: DefKolom, d: Record<string, unknown>): unknown {
  if (!(def.kolom in d)) return undefined;
  switch (def.jenis) {
    case 'ya_tidak':
      return boolOpsional(d, def.kolom, false);
    case 'tanggal': {
      const v = teksOpsional(d, def.kolom, { maks: 10 });
      if (v === null) {
        if (def.wajib) throw new GalatMasukan(def.kolom, 'Wajib diisi');
        return null;
      }
      if (!tanggalSah(v)) throw new GalatMasukan(def.kolom, 'Tanggal tidak sah');
      return v;
    }
    case 'angka': {
      const v = d[def.kolom];
      if (v === null || v === '' || v === undefined) return null;
      return angkaWajib(d, def.kolom, { bulat: def.kolom.startsWith('tahun_'), min: 0, maks: def.kolom.startsWith('tahun_') ? 2100 : 100000 });
    }
    case 'unit':
    case 'jabatan':
    case 'titik_kantor': {
      const v = d[def.kolom];
      if (v === null || v === '' || v === undefined) {
        if (def.wajib) throw new GalatMasukan(def.kolom, 'Wajib diisi');
        return null;
      }
      return uuidWajib(d, def.kolom);
    }
    case 'pilihan': {
      const v = d[def.kolom];
      if (v === null || v === '' || v === undefined) {
        if (def.wajib) throw new GalatMasukan(def.kolom, 'Wajib diisi');
        return null;
      }
      return pilihanWajib(d, def.kolom, def.opsi ?? []);
    }
    default: {
      const opsi = { maks: def.maks ?? 300, ...(def.pola ? { pola: new RegExp(def.pola), pesanPola: def.pesanPola } : {}) };
      return def.wajib ? teksWajib(d, def.kolom, opsi) : teksOpsional(d, def.kolom, opsi);
    }
  }
}

function bacaBaris(defs: readonly DefKolom[], d: Record<string, unknown>, baru: boolean): Record<string, unknown> {
  const hasil: Record<string, unknown> = {};
  for (const def of defs) {
    if (!baru && def.hanyaSaatBaru) continue;
    const v = nilaiKolom(def, d);
    if (v === undefined) {
      if (baru && def.wajib) throw new GalatMasukan(def.kolom, 'Wajib diisi');
      continue;
    }
    hasil[def.kolom] = v;
  }
  return hasil;
}

// ---------------------------------------------------------------------------
// Daftar dan detail
// ---------------------------------------------------------------------------

export async function daftar(_u: Pengguna, data: unknown): Promise<RingkasPegawai[]> {
  const d = objek(data);
  const cari = teksOpsional(d, 'cari', { maks: 100 });
  const nonaktif = boolOpsional(d, 'termasukNonaktif', false);
  const rows = await baca<{
    id: string; npp: string; nama: string; email: string; jabatan: string | null; unit: string | null;
    jenis_kepegawaian: RingkasPegawai['jenisKepegawaian']; status_pegawai: StatusPegawai; aktif: boolean; punya_akun: boolean;
  }>(
    `SELECT p.id, p.npp, p.nama_lengkap AS nama, p.email, j.nama AS jabatan, un.nama AS unit, p.jenis_kepegawaian,
            p.status_pegawai, p.aktif, EXISTS (SELECT 1 FROM pengguna g WHERE g.pegawai_id = p.id) AS punya_akun
       FROM pegawai p LEFT JOIN jabatan j ON j.id = p.jabatan_id LEFT JOIN unit un ON un.id = p.unit_id
      WHERE ($1::boolean OR p.aktif)
        AND ($2::text IS NULL OR p.nama_lengkap ILIKE '%' || $2 || '%' OR p.npp ILIKE '%' || $2 || '%' OR p.email ILIKE '%' || $2 || '%')
      ORDER BY p.nama_lengkap`,
    [nonaktif, cari],
  );
  return rows.map((r) => ({
    id: r.id, npp: r.npp, nama: r.nama, email: r.email, jabatan: r.jabatan, unit: r.unit,
    jenisKepegawaian: r.jenis_kepegawaian, statusPegawai: r.status_pegawai, aktif: r.aktif, punyaAkun: r.punya_akun,
  }));
}

const KOLOM_DASAR = ['id', 'npp', 'nama_lengkap', 'gelar_depan', 'gelar_belakang', 'email', 'no_hp', 'jenis_kepegawaian', 'status_pegawai', 'unit_id', 'jabatan_id'];

async function riwayat(jenis: JenisRiwayat, pegawaiId: string): Promise<BarisRiwayat[]> {
  const kolom = ['id', ...KOLOM_RIWAYAT[jenis].kolom.map((k) => k.kolom)].map((k) => `"${k}"`).join(', ');
  const urut = jenis === 'keluarga' ? 'dibuat_pada' : jenis === 'pendidikan' ? 'tahun_lulus DESC NULLS LAST' : 'dibuat_pada DESC';
  return baca<BarisRiwayat>(`SELECT ${kolom} FROM ${jenis} WHERE pegawai_id = $1 AND aktif ORDER BY ${urut}`, [pegawaiId]);
}

export async function detail(u: Pengguna, data: unknown): Promise<DetailPegawai> {
  return detailUntuk(u, uuidWajib(objek(data), 'id'));
}

export async function saya(u: Pengguna): Promise<DetailPegawai> {
  return detailUntuk(u, u.pegawaiId);
}

async function detailUntuk(u: Pengguna, id: string): Promise<DetailPegawai> {
  const penuh = bisaBacaProfilPenuh(u, id);
  if (!penuh && !(await atasanDari(u, id))) throw ditolak();

  const p = await bacaSatu<Record<string, unknown> & { id: string; npp: string; nama_lengkap: string; foto_file_id: string | null }>(
    'SELECT * FROM pegawai WHERE id = $1',
    [id],
  );
  if (!p) throw galat('TIDAK_ADA', 'Pegawai tidak ditemukan.');
  const ref = await bacaSatu<{ jabatan: string | null; unit: string | null }>(
    'SELECT j.nama AS jabatan, un.nama AS unit FROM pegawai p LEFT JOIN jabatan j ON j.id = p.jabatan_id LEFT JOIN unit un ON un.id = p.unit_id WHERE p.id = $1',
    [id],
  );
  const kosong: BarisRiwayat[] = [];
  const [status, keluarga, pendidikan, pekerjaan, sertifikasi, diklat, dokumen, gaji] = await Promise.all([
    penuh ? riwayatStatus(id) : Promise.resolve([]),
    penuh ? riwayat('keluarga', id) : kosong,
    penuh ? riwayat('pendidikan', id) : kosong,
    penuh ? riwayat('riwayat_pekerjaan', id) : kosong,
    penuh ? riwayat('sertifikasi', id) : kosong,
    penuh ? riwayat('riwayat_diklat', id) : kosong,
    bisaBacaDokumen(u, id) ? daftarDokumen(id) : Promise.resolve([]),
    bisaBacaGaji(u, id) ? versiGaji(id) : Promise.resolve(null),
  ]);

  const pegawai = penuh
    ? (Object.fromEntries(Object.entries(p).filter(([k]) => !['dibuat_pada', 'dibuat_oleh', 'diubah_pada', 'diubah_oleh', 'foto_file_id', 'aktif'].includes(k))) as DetailPegawai['pegawai'])
    : (Object.fromEntries(KOLOM_DASAR.map((k) => [k, p[k]])) as DetailPegawai['pegawai']);

  return {
    cakupan: penuh ? 'penuh' : 'dasar',
    pegawai,
    jabatan: ref?.jabatan ?? null,
    unit: ref?.unit ?? null,
    masaKerja: formatMasaKerja(masaKerja(p.tgl_masuk as string | null, p.tgl_masa_kerja_diakui as string | null, tanggalWIB(new Date()))),
    adaFoto: p.foto_file_id !== null && bisaBacaDokumen(u, id),
    bolehUbah: bisaKelolaPegawai(u),
    riwayatStatus: status,
    keluarga, pendidikan, riwayat_pekerjaan: pekerjaan, sertifikasi, riwayat_diklat: diklat,
    dokumen,
    gaji,
  };
}

async function riwayatStatus(id: string): Promise<RiwayatStatus[]> {
  const rows = await baca<{ id: string; status: StatusPegawai; tgl_mulai: string; tgl_selesai: string | null; keterangan: string | null }>(
    'SELECT id, status, tgl_mulai, tgl_selesai, keterangan FROM riwayat_status WHERE pegawai_id = $1 ORDER BY tgl_mulai DESC, dibuat_pada DESC',
    [id],
  );
  return rows.map((r) => ({ id: r.id, status: r.status, tglMulai: r.tgl_mulai, tglSelesai: r.tgl_selesai, keterangan: r.keterangan }));
}

async function daftarDokumen(id: string): Promise<DokumenPegawai[]> {
  const rows = await baca<{ id: string; jenis: DokumenPegawai['jenis']; berkas_id: string; nama_asli: string; ukuran_byte: number; dibuat_pada: Date }>(
    `SELECT d.id, d.jenis, d.berkas_id, b.nama_asli, b.ukuran_byte, d.dibuat_pada
       FROM dokumen d JOIN berkas b ON b.id = d.berkas_id WHERE d.pegawai_id = $1 AND d.aktif ORDER BY d.jenis, d.dibuat_pada DESC`,
    [id],
  );
  return rows.map((r) => ({
    id: r.id, jenis: r.jenis, berkasId: r.berkas_id, namaBerkas: r.nama_asli, ukuranByte: r.ukuran_byte, diunggahPada: r.dibuat_pada.toISOString(),
  }));
}

async function versiGaji(id: string): Promise<VersiGaji[]> {
  const rows = await baca<{ id: string; kode: string; nama: string; nominal: number; berlaku_mulai: string; berlaku_sampai: string | null; no_sk: string | null }>(
    `SELECT g.id, k.kode, k.nama, g.nominal, g.berlaku_mulai, g.berlaku_sampai, g.no_sk
       FROM gaji g JOIN komponen_gaji k ON k.id = g.komponen_id WHERE g.pegawai_id = $1
      ORDER BY k.kode, g.berlaku_mulai DESC`,
    [id],
  );
  return rows.map((r) => ({
    id: r.id, komponenKode: r.kode, komponenNama: r.nama, nominal: r.nominal, berlakuMulai: r.berlaku_mulai, berlakuSampai: r.berlaku_sampai, noSk: r.no_sk,
  }));
}

// ---------------------------------------------------------------------------
// Simpan pegawai dan ubah status
// ---------------------------------------------------------------------------

async function pastikanReferensi(baris: Record<string, unknown>, tx: Tx): Promise<void> {
  const cek: [string, string, string][] = [['unit_id', 'unit', 'Unit'], ['jabatan_id', 'jabatan', 'Jabatan'], ['titik_kantor_id', 'titik_kantor', 'Titik kantor']];
  for (const [kolom, tabel, nama] of cek) {
    const v = baris[kolom];
    if (typeof v !== 'string') continue;
    const [ada] = await tx.query(`SELECT 1 FROM ${tabel} WHERE id = $1 AND aktif`, [v]);
    if (!ada) throw new GalatMasukan(kolom, `${nama} tidak ditemukan atau sudah nonaktif`);
  }
}

export async function simpan(u: Pengguna, data: unknown): Promise<{ id: string; peringatan: string | null }> {
  const d = objek(data);
  const id = d.id ? uuidWajib(d, 'id') : null;
  const baris = bacaBaris(KOLOM_PEGAWAI, d, id === null);
  if (typeof baris.email === 'string') baris.email = baris.email.toLowerCase();

  return transaksi(async (tx) => {
    await pastikanReferensi(baris, tx);
    if (typeof baris.jabatan_id === 'string' && !baris.kelompok_jabatan) {
      const [j] = await tx.query<{ kelompok_jabatan: string | null }>('SELECT kelompok_jabatan FROM jabatan WHERE id = $1', [baris.jabatan_id]);
      if (j?.kelompok_jabatan) baris.kelompok_jabatan = j.kelompok_jabatan;
    }
    if (id === null) {
      const p = await tulis<{ id: string; status_pegawai: StatusPegawai; tgl_masuk: string | null }>('pegawai', 'tambah', baris, { pelaku: u.pegawaiId }, tx);
      // EMP-04: status awal langsung tercatat sebagai riwayat.
      await tulis('riwayat_status', 'tambah', {
        pegawai_id: p.id, status: p.status_pegawai, tgl_mulai: p.tgl_masuk ?? tanggalWIB(new Date()), keterangan: 'Status awal',
      }, { pelaku: u.pegawaiId }, tx);
      return { id: p.id, peringatan: null };
    }
    const sebelum = await tx.query<{ aktif: boolean }>('SELECT aktif FROM pegawai WHERE id = $1', [id]);
    if (!sebelum[0]) throw galat('TIDAK_ADA', 'Pegawai tidak ditemukan.');
    await tulis('pegawai', 'ubah', { id, ...baris }, { pelaku: u.pegawaiId }, tx);
    return { id, peringatan: null };
  });
}

const STATUS_BERHENTI: readonly StatusPegawai[] = ['berhenti', 'meninggal'];

/** EMP-04: status baru = baris riwayat baru; baris lama ditutup, tidak ditimpa. */
export async function ubahStatus(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const status = pilihanWajib(d, 'status', STATUS_PEGAWAI);
  const tglMulai = tanggalWajib(d, 'tglMulai');
  const keterangan = teksOpsional(d, 'keterangan', { maks: 300 });
  if (STATUS_BERHENTI.includes(status) && !keterangan) {
    throw new GalatMasukan('keterangan', 'Alasan berhenti wajib diisi');
  }
  await transaksi(async (tx) => {
    const [akhir] = await tx.query<{ id: string; tgl_mulai: string }>(
      'SELECT id, tgl_mulai FROM riwayat_status WHERE pegawai_id = $1 AND tgl_selesai IS NULL ORDER BY tgl_mulai DESC LIMIT 1',
      [pegawaiId],
    );
    if (akhir && akhir.tgl_mulai >= tglMulai) {
      throw new GalatMasukan('tglMulai', `Tanggal mulai harus setelah status terakhir (${akhir.tgl_mulai})`);
    }
    if (akhir) await tulis('riwayat_status', 'ubah', { id: akhir.id, tgl_selesai: tambahHari(tglMulai, -1) }, { pelaku: u.pegawaiId }, tx);
    await tulis('riwayat_status', 'tambah', { pegawai_id: pegawaiId, status, tgl_mulai: tglMulai, keterangan }, { pelaku: u.pegawaiId }, tx);
    const ubah: Record<string, unknown> = { id: pegawaiId, status_pegawai: status };
    if (STATUS_BERHENTI.includes(status)) {
      // USR-09: akun dinonaktifkan pekerjaan terjadwal pada hari setelah tanggal berhenti.
      ubah.tgl_berhenti = tglMulai;
      ubah.alasan_berhenti = keterangan;
    }
    await tulis('pegawai', 'ubah', ubah, { pelaku: u.pegawaiId, alasan: keterangan }, tx);
  });
  return null;
}

// ---------------------------------------------------------------------------
// Riwayat (keluarga, pendidikan, pekerjaan, sertifikasi, diklat)
// ---------------------------------------------------------------------------

export async function simpanRiwayat(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const jenis = pilihanWajib(d, 'jenis', JENIS_RIWAYAT);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const isi = objek(d.data, 'data');
  const id = isi.id ? uuidWajib(isi, 'id') : null;
  const baris = bacaBaris(KOLOM_RIWAYAT[jenis].kolom, isi, id === null);
  for (const k of KOLOM_RIWAYAT[jenis].kolom) if (k.jenis === 'ya_tidak' && baris[k.kolom] === undefined) baris[k.kolom] = false;
  const jejak = { pelaku: u.pegawaiId };
  if (id === null) {
    const r = await tulis<{ id: string }>(jenis, 'tambah', { pegawai_id: pegawaiId, ...baris }, jejak);
    return { id: r.id };
  }
  const milik = await bacaSatu<{ pegawai_id: string }>(`SELECT pegawai_id FROM ${jenis} WHERE id = $1`, [id]);
  if (!milik || milik.pegawai_id !== pegawaiId) throw galat('TIDAK_ADA', 'Data tidak ditemukan.');
  await tulis(jenis, 'ubah', { id, ...baris }, jejak);
  return { id };
}

export async function nonaktifkanRiwayat(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const jenis = pilihanWajib(d, 'jenis', JENIS_RIWAYAT);
  await tulis(jenis, 'nonaktifkan', { id: uuidWajib(d, 'id') }, { pelaku: u.pegawaiId });
  return null;
}

// ---------------------------------------------------------------------------
// Dokumen dan foto profil (OTZ-07: hanya pegawai ybs dan Admin HRD)
// ---------------------------------------------------------------------------

export async function unggahDokumen(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const jenis = pilihanWajib(d, 'jenis', JENIS_DOKUMEN);
  const nama = teksWajib(d, 'namaBerkas', { maks: 200 });
  const isi = berkas.bacaBase64(d.isi, 'isi', 'dokumen', ['application/pdf', 'image/jpeg', 'image/png']);
  const dibuat: string[] = [];
  try {
    return await transaksi(async (tx) => {
      const f = await berkas.simpan(tx, { ...isi, golongan: 'dokumen', namaAsli: nama, pelaku: u.pegawaiId, sekarang: new Date() });
      dibuat.push(f.jalur);
      const r = await tulis<{ id: string }>('dokumen', 'tambah', { pegawai_id: pegawaiId, jenis, berkas_id: f.id }, { pelaku: u.pegawaiId }, tx);
      return { id: r.id };
    });
  } catch (e) {
    await berkas.hapusBilaGagal(dibuat);
    throw e;
  }
}

export async function nonaktifkanDokumen(u: Pengguna, data: unknown): Promise<null> {
  await tulis('dokumen', 'nonaktifkan', { id: uuidWajib(objek(data), 'id') }, { pelaku: u.pegawaiId });
  return null;
}

/** EMP-14: foto profil 3:4 (dipotong di browser), maksimal 2 MB, tidak ikut retensi 1 tahun. */
export async function unggahFoto(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const isi = berkas.bacaBase64(d.isi, 'isi', 'foto_profil', ['image/jpeg', 'image/png']);
  const dibuat: string[] = [];
  try {
    await transaksi(async (tx) => {
      const f = await berkas.simpan(tx, { ...isi, golongan: 'foto_profil', namaAsli: `foto-${pegawaiId}.${isi.ext}`, pelaku: u.pegawaiId, sekarang: new Date() });
      dibuat.push(f.jalur);
      await tulis('pegawai', 'ubah', { id: pegawaiId, foto_file_id: f.id }, { pelaku: u.pegawaiId, alasan: 'Ganti foto profil' }, tx);
    });
  } catch (e) {
    await berkas.hapusBilaGagal(dibuat);
    throw e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gaji berversi (EMP-07, EMP-08)
// ---------------------------------------------------------------------------

export async function daftarGaji(u: Pengguna, data: unknown): Promise<VersiGaji[]> {
  const pegawaiId = uuidWajib(objek(data), 'pegawaiId');
  if (!bisaBacaGaji(u, pegawaiId)) throw ditolak();
  return versiGaji(pegawaiId);
}

export async function ringkasanGaji(): Promise<{ pegawaiId: string; npp: string; nama: string; unit: string | null; gapok: number | null; tunjJabatan: number | null }[]> {
  const rows = await baca<{ id: string; npp: string; nama: string; unit: string | null; gapok: number | null; tunj: number | null }>(
    `SELECT p.id, p.npp, p.nama_lengkap AS nama, un.nama AS unit,
            (SELECT g.nominal FROM gaji g JOIN komponen_gaji k ON k.id = g.komponen_id
              WHERE g.pegawai_id = p.id AND k.kode = 'GAJI_POKOK' AND g.berlaku_mulai <= CURRENT_DATE
                AND (g.berlaku_sampai IS NULL OR g.berlaku_sampai >= CURRENT_DATE)) AS gapok,
            (SELECT g.nominal FROM gaji g JOIN komponen_gaji k ON k.id = g.komponen_id
              WHERE g.pegawai_id = p.id AND k.kode = 'TUNJ_JABATAN' AND g.berlaku_mulai <= CURRENT_DATE
                AND (g.berlaku_sampai IS NULL OR g.berlaku_sampai >= CURRENT_DATE)) AS tunj
       FROM pegawai p LEFT JOIN unit un ON un.id = p.unit_id
      WHERE p.aktif ORDER BY p.nama_lengkap`,
  );
  return rows.map((r) => ({ pegawaiId: r.id, npp: r.npp, nama: r.nama, unit: r.unit, gapok: r.gapok, tunjJabatan: r.tunj }));
}

/**
 * EMP-07: menambah nominal baru menutup versi lama dan membuka versi baru.
 * Tidak ada jalur yang mengubah nominal lama.
 */
export async function tambahGaji(u: Pengguna, data: unknown): Promise<{ id: string; peringatan: string | null; usulanSubGrade: string | null }> {
  const d = objek(data);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const kode = teksWajib(d, 'komponenKode', { maks: 50 });
  const nominal = angkaWajib(d, 'nominal', { bulat: true, min: 0, maks: 10_000_000_000 });
  const berlakuMulai = tanggalWajib(d, 'berlakuMulai');
  const noSk = teksOpsional(d, 'noSk', { maks: 100 });

  const komponen = await bacaSatu<{ id: string }>('SELECT id FROM komponen_gaji WHERE kode = $1 AND aktif', [kode]);
  if (!komponen) throw new GalatMasukan('komponenKode', 'Komponen tidak dikenal');
  const p = await bacaSatu<{ jenis_kepegawaian: string; grade: string | null; sub_grade: string | null; tgl_masuk: string | null; tgl_masa_kerja_diakui: string | null }>(
    'SELECT jenis_kepegawaian, grade, sub_grade, tgl_masuk, tgl_masa_kerja_diakui FROM pegawai WHERE id = $1',
    [pegawaiId],
  );
  if (!p) throw galat('TIDAK_ADA', 'Pegawai tidak ditemukan.');

  const id = await transaksi(async (tx) => {
    const [terbuka] = await tx.query<{ id: string; berlaku_mulai: string }>(
      'SELECT id, berlaku_mulai FROM gaji WHERE pegawai_id = $1 AND komponen_id = $2 AND berlaku_sampai IS NULL FOR UPDATE',
      [pegawaiId, komponen.id],
    );
    if (terbuka) {
      if (terbuka.berlaku_mulai >= berlakuMulai) {
        throw new GalatMasukan('berlakuMulai', `Harus setelah versi terakhir (berlaku mulai ${terbuka.berlaku_mulai})`);
      }
      await tulis('gaji', 'ubah', { id: terbuka.id, berlaku_sampai: tambahHari(berlakuMulai, -1) }, { pelaku: u.pegawaiId, alasan: 'Ditutup oleh versi baru' }, tx);
    }
    const r = await tulis<{ id: string }>('gaji', 'tambah', {
      pegawai_id: pegawaiId, komponen_id: komponen.id, nominal, berlaku_mulai: berlakuMulai, no_sk: noSk,
    }, { pelaku: u.pegawaiId }, tx);
    return r.id;
  });

  let peringatan: string | null = null;
  let usulanSubGrade: string | null = null;
  if (kode === 'GAJI_POKOK' && p.jenis_kepegawaian === 'PKWTT') {
    const tabel = await baca<{ grade: string; sub_grade: string; masa_kerja_min_thn: number | null; masa_kerja_max_thn: number | null; gapok_min: number | null; gapok_max: number | null }>(
      `SELECT DISTINCT ON (grade, sub_grade) grade, sub_grade, masa_kerja_min_thn, masa_kerja_max_thn, gapok_min, gapok_max
         FROM tabel_grade WHERE berlaku_mulai <= $1 ORDER BY grade, sub_grade, berlaku_mulai DESC`,
      [berlakuMulai],
    );
    const baris: BarisGrade[] = tabel.map((t) => ({
      grade: t.grade, subGrade: t.sub_grade, masaKerjaMinThn: t.masa_kerja_min_thn, masaKerjaMaxThn: t.masa_kerja_max_thn,
      gapokMin: t.gapok_min, gapokMax: t.gapok_max,
    }));
    const mk = masaKerja(p.tgl_masuk, p.tgl_masa_kerja_diakui, berlakuMulai);
    const h = periksaGapok(baris, p.grade, mk ? mk.tahun + mk.bulan / 12 : 0, nominal, p.sub_grade);
    peringatan = h.peringatan;
    usulanSubGrade = h.usulanSubGrade;
  }
  return { id, peringatan, usulanSubGrade };
}

/** Dipakai pengguna.aturAktif dan pekerjaan nonaktifkan-berhenti. */
export async function nonaktifkanPegawai(tx: Tx, pegawaiId: string, pelaku: string | null, alasan: string): Promise<void> {
  await tulis('pegawai', 'ubah', { id: pegawaiId, aktif: false }, { pelaku, alasan }, tx);
  const akun = await tx.query<{ id: string; aktif: boolean }>('SELECT id, aktif FROM pengguna WHERE pegawai_id = $1', [pegawaiId]);
  for (const a of akun) {
    if (a.aktif) await tulis('pengguna', 'ubah', { id: a.id, aktif: false }, { pelaku, alasan }, tx);
    await operasional.sesiCabutSemua(tx, a.id);
  }
}

export const bolehLihatFotoProfil = (u: Pengguna, pegawaiId: string) => bisaBacaDokumen(u, pegawaiId) || punya(u, 'admin_hrd');
