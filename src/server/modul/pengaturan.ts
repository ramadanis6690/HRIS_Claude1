// Master data dan pengaturan (SRS SET-01 – SET-03, LOC-01 – LOC-03, WRK-01 – WRK-02).
// Master yang sudah dipakai transaksi tidak dihapus, hanya dinonaktifkan (SET-02).
import type { BarisGradeData, HariLibur, Jabatan, JamKerja, MasterData, TitikKantorData, Unit } from '../../bersama/aksi.js';
import { radiusSah } from '../../core/jarak.js';
import {
  GalatMasukan, angkaOpsional, angkaWajib, boolOpsional, jamWajib, objek, pilihanWajib, tanggalWajib, teksOpsional,
  teksWajib, uuidOpsional,
} from '../../core/validasi.js';
import { menitDariJam } from '../../core/tanggal.js';
import { baca, bacaSatu } from '../db.js';
import { galat } from '../galat.js';
import type { Pengguna } from '../izin.js';
import { tulis } from '../repo.js';

export async function master(): Promise<MasterData> {
  const [unit, jabatan, titik, libur, jam, grade, komponen, pengaturan, direksi] = await Promise.all([
    baca<{ id: string; kode: string; nama: string; direktur_pembina_id: string | null; pembina: string | null; aktif: boolean }>(
      'SELECT u.id, u.kode, u.nama, u.direktur_pembina_id, p.nama_lengkap AS pembina, u.aktif FROM unit u LEFT JOIN pegawai p ON p.id = u.direktur_pembina_id ORDER BY u.kode',
    ),
    baca<{ id: string; nama: string; posisi_struktural: Jabatan['posisiStruktural']; kelompok_jabatan: string | null; cara_bayar_lembur: Jabatan['caraBayarLembur']; aktif: boolean }>(
      'SELECT id, nama, posisi_struktural, kelompok_jabatan, cara_bayar_lembur, aktif FROM jabatan ORDER BY nama',
    ),
    baca<{ id: string; nama: string; alamat: string | null; lat: number; lng: number; radius_m: number; aktif: boolean }>(
      'SELECT id, nama, alamat, lat, lng, radius_m, aktif FROM titik_kantor ORDER BY nama',
    ),
    baca<{ tanggal: string; keterangan: string; sumber: HariLibur['sumber']; aktif: boolean }>(
      `SELECT tanggal, keterangan, sumber, aktif FROM hari_libur WHERE tanggal >= date_trunc('year', CURRENT_DATE) - interval '1 year' ORDER BY tanggal`,
    ),
    baca<{ id: string; jam_masuk: string; jam_pulang: string; toleransi_menit: number; hari_kerja: number[]; batas_susulan_hari: number; berlaku_mulai: string }>(
      'SELECT id, jam_masuk, jam_pulang, toleransi_menit, hari_kerja, batas_susulan_hari, berlaku_mulai FROM jam_kerja ORDER BY berlaku_mulai DESC',
    ),
    baca<{ id: string; grade: string; sub_grade: string; nama_jabatan: string | null; pendidikan_min: string | null; masa_kerja_min_thn: number | null; masa_kerja_max_thn: number | null; tunjangan_jabatan: number | null; gapok_min: number | null; gapok_med: number | null; gapok_max: number | null; berlaku_mulai: string }>(
      'SELECT * FROM tabel_grade ORDER BY berlaku_mulai DESC, grade, sub_grade',
    ),
    baca<{ kode: string; nama: string; tipe: 'pendapatan' | 'potongan' | 'informasi'; kena_pajak: boolean; aktif: boolean }>(
      'SELECT kode, nama, tipe, kena_pajak, aktif FROM komponen_gaji ORDER BY kode',
    ),
    baca<{ kunci: string; nilai: string; keterangan: string | null }>('SELECT kunci, nilai, keterangan FROM pengaturan ORDER BY kunci'),
    baca<{ id: string; nama: string; jabatan: string }>(
      `SELECT p.id, p.nama_lengkap AS nama, j.nama AS jabatan FROM pegawai p JOIN jabatan j ON j.id = p.jabatan_id
        WHERE p.aktif AND j.posisi_struktural IN ('Direksi','Dirut') ORDER BY j.posisi_struktural DESC, p.nama_lengkap`,
    ),
  ]);
  return {
    unit: unit.map((u): Unit => ({ id: u.id, kode: u.kode, nama: u.nama, direkturPembinaId: u.direktur_pembina_id, direkturPembina: u.pembina, aktif: u.aktif })),
    jabatan: jabatan.map((j): Jabatan => ({ id: j.id, nama: j.nama, posisiStruktural: j.posisi_struktural, kelompokJabatan: j.kelompok_jabatan, caraBayarLembur: j.cara_bayar_lembur, aktif: j.aktif })),
    titikKantor: titik.map((t): TitikKantorData => ({ id: t.id, nama: t.nama, alamat: t.alamat, lat: t.lat, lng: t.lng, radiusM: t.radius_m, aktif: t.aktif })),
    hariLibur: libur.map((h): HariLibur => ({ tanggal: h.tanggal, keterangan: h.keterangan, sumber: h.sumber, aktif: h.aktif })),
    jamKerja: jam.map((j): JamKerja => ({
      id: j.id, jamMasuk: j.jam_masuk.slice(0, 5), jamPulang: j.jam_pulang.slice(0, 5), toleransiMenit: j.toleransi_menit,
      hariKerja: j.hari_kerja, batasSusulanHari: j.batas_susulan_hari, berlakuMulai: j.berlaku_mulai,
    })),
    tabelGrade: grade.map((g): BarisGradeData => ({
      id: g.id, grade: g.grade, subGrade: g.sub_grade, namaJabatan: g.nama_jabatan, pendidikanMin: g.pendidikan_min,
      masaKerjaMinThn: g.masa_kerja_min_thn, masaKerjaMaxThn: g.masa_kerja_max_thn, tunjanganJabatan: g.tunjangan_jabatan,
      gapokMin: g.gapok_min, gapokMed: g.gapok_med, gapokMax: g.gapok_max, berlakuMulai: g.berlaku_mulai,
    })),
    komponenGaji: komponen.map((k) => ({ kode: k.kode, nama: k.nama, tipe: k.tipe, kenaPajak: k.kena_pajak, aktif: k.aktif })),
    pengaturan,
    direksi,
  };
}

export async function simpanUnit(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const id = uuidOpsional(d, 'id');
  const kode = teksWajib(d, 'kode', { maks: 10, pola: /^[A-Z0-9]{2,10}$/, pesanPola: '2–10 huruf kapital/angka' });
  const nama = teksWajib(d, 'nama', { maks: 100 });
  const pembina = uuidOpsional(d, 'direkturPembinaId');
  const aktif = boolOpsional(d, 'aktif', true);
  if (pembina) {
    const ok = await bacaSatu(
      `SELECT 1 FROM pegawai p JOIN jabatan j ON j.id = p.jabatan_id WHERE p.id = $1 AND p.aktif AND j.posisi_struktural IN ('Direksi','Dirut')`,
      [pembina],
    );
    if (!ok) throw new GalatMasukan('direkturPembinaId', 'Direktur pembina harus pegawai aktif berjabatan Direktur/Direktur Utama');
  }
  const baris = { kode, nama, direktur_pembina_id: pembina, aktif };
  const r = id
    ? await tulis<{ id: string }>('unit', 'ubah', { id, ...baris }, { pelaku: u.pegawaiId })
    : await tulis<{ id: string }>('unit', 'tambah', baris, { pelaku: u.pegawaiId });
  return { id: r.id };
}

export async function simpanJabatan(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const id = uuidOpsional(d, 'id');
  const baris = {
    nama: teksWajib(d, 'nama', { maks: 100 }),
    // SET-03: jabatan selalu menunjuk posisi struktural.
    posisi_struktural: pilihanWajib(d, 'posisiStruktural', ['Staff', 'Manager', 'Direksi', 'Dirut', 'Dewas'] as const),
    kelompok_jabatan: teksOpsional(d, 'kelompokJabatan', { maks: 50 }),
    cara_bayar_lembur: pilihanWajib(d, 'caraBayarLembur', ['upah_per_jam', 'lumpsum', 'tidak_ada'] as const),
    aktif: boolOpsional(d, 'aktif', true),
  };
  const r = id
    ? await tulis<{ id: string }>('jabatan', 'ubah', { id, ...baris }, { pelaku: u.pegawaiId })
    : await tulis<{ id: string }>('jabatan', 'tambah', baris, { pelaku: u.pegawaiId });
  return { id: r.id };
}

/** LOC-02: radius hanya 50/100/200/300 m — ditolak server, bukan hanya dropdown. LOC-10: baris presensi lama tidak berubah. */
export async function simpanTitikKantor(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const id = uuidOpsional(d, 'id');
  const radius = angkaWajib(d, 'radiusM', { bulat: true });
  if (!radiusSah(radius)) throw new GalatMasukan('radiusM', 'Radius hanya 50, 100, 200, atau 300 m');
  const baris = {
    nama: teksWajib(d, 'nama', { maks: 100 }),
    alamat: teksOpsional(d, 'alamat', { maks: 300 }),
    lat: angkaWajib(d, 'lat', { min: -90, maks: 90 }),
    lng: angkaWajib(d, 'lng', { min: -180, maks: 180 }),
    radius_m: radius,
    aktif: boolOpsional(d, 'aktif', true),
  };
  const r = id
    ? await tulis<{ id: string }>('titik_kantor', 'ubah', { id, ...baris }, { pelaku: u.pegawaiId })
    : await tulis<{ id: string }>('titik_kantor', 'tambah', baris, { pelaku: u.pegawaiId });
  return { id: r.id };
}

export async function simpanHariLibur(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const tanggal = tanggalWajib(d, 'tanggal');
  const baris = {
    tanggal,
    keterangan: teksWajib(d, 'keterangan', { maks: 150 }),
    sumber: pilihanWajib(d, 'sumber', ['nasional', 'ditetapkan_hr'] as const),
    aktif: true,
  };
  const ada = await bacaSatu('SELECT 1 FROM hari_libur WHERE tanggal = $1', [tanggal]);
  await tulis('hari_libur', ada ? 'ubah' : 'tambah', baris, { pelaku: u.pegawaiId });
  return null;
}

/** WRK-02: hanya hari libur `ditetapkan_hr` yang bisa dihapus lewat layar. */
export async function nonaktifkanHariLibur(u: Pengguna, data: unknown): Promise<null> {
  const tanggal = tanggalWajib(objek(data), 'tanggal');
  const h = await bacaSatu<{ sumber: string }>('SELECT sumber FROM hari_libur WHERE tanggal = $1', [tanggal]);
  if (!h) throw galat('TIDAK_ADA', 'Hari libur tidak ditemukan.');
  if (h.sumber !== 'ditetapkan_hr') throw galat('ATURAN', 'Libur nasional tidak bisa dihapus lewat layar.');
  await tulis('hari_libur', 'nonaktifkan', { tanggal }, { pelaku: u.pegawaiId });
  return null;
}

/** WRK-01: jam kerja berversi. Versi baru ditambah, versi lama tidak diubah (ATT-10). */
export async function tambahJamKerja(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const jamMasuk = jamWajib(d, 'jamMasuk');
  const jamPulang = jamWajib(d, 'jamPulang');
  if (menitDariJam(jamPulang) <= menitDariJam(jamMasuk)) throw new GalatMasukan('jamPulang', 'Jam pulang harus setelah jam masuk');
  const hari = d.hariKerja;
  if (!Array.isArray(hari) || hari.length === 0 || !hari.every((h) => Number.isInteger(h) && h >= 1 && h <= 7)) {
    throw new GalatMasukan('hariKerja', 'Pilih minimal satu hari kerja');
  }
  const r = await tulis<{ id: string }>('jam_kerja', 'tambah', {
    jam_masuk: jamMasuk,
    jam_pulang: jamPulang,
    toleransi_menit: angkaWajib(d, 'toleransiMenit', { bulat: true, min: 0, maks: 120 }),
    hari_kerja: [...new Set(hari as number[])].sort(),
    batas_susulan_hari: angkaWajib(d, 'batasSusulanHari', { bulat: true, min: 0, maks: 31 }),
    berlaku_mulai: tanggalWajib(d, 'berlakuMulai'),
  }, { pelaku: u.pegawaiId });
  return { id: r.id };
}

const KUNCI_PENGATURAN: Record<string, (v: string) => boolean> = {
  payroll_unit_tahap3: (v) => /^[A-Z0-9]{2,10}(,[A-Z0-9]{2,10})*$/.test(v),
  retensi_foto_hari: (v) => /^\d{2,4}$/.test(v) && Number(v) >= 30,
  pengingat_kontrak_hari: (v) => /^\d{1,3}$/.test(v),
  pengingat_sertifikat_hari: (v) => /^\d{1,3}$/.test(v),
  tenggat_pj_hari_kerja: (v) => /^\d{1,2}$/.test(v),
};

export async function simpanNilai(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const kunci = pilihanWajib(d, 'kunci', Object.keys(KUNCI_PENGATURAN));
  const nilai = teksWajib(d, 'nilai', { maks: 200 });
  if (!KUNCI_PENGATURAN[kunci]!(nilai)) throw new GalatMasukan('nilai', 'Nilai tidak sah untuk pengaturan ini');
  await tulis('pengaturan', 'ubah', { kunci, nilai }, { pelaku: u.pegawaiId });
  return null;
}

export async function simpanGrade(u: Pengguna, data: unknown): Promise<{ id: string }> {
  const d = objek(data);
  const id = uuidOpsional(d, 'id');
  const rp = (k: string) => angkaOpsional(d, k, { bulat: true, min: 0 });
  const baris = {
    grade: teksWajib(d, 'grade', { maks: 10 }),
    sub_grade: teksWajib(d, 'subGrade', { maks: 10 }),
    nama_jabatan: teksOpsional(d, 'namaJabatan', { maks: 100 }),
    pendidikan_min: teksOpsional(d, 'pendidikanMin', { maks: 30 }),
    masa_kerja_min_thn: angkaOpsional(d, 'masaKerjaMinThn', { min: 0, maks: 60 }),
    masa_kerja_max_thn: angkaOpsional(d, 'masaKerjaMaxThn', { min: 0, maks: 60 }),
    tunjangan_jabatan: rp('tunjanganJabatan'),
    gapok_min: rp('gapokMin'),
    gapok_med: rp('gapokMed'),
    gapok_max: rp('gapokMax'),
    berlaku_mulai: tanggalWajib(d, 'berlakuMulai'),
  };
  const r = id
    ? await tulis<{ id: string }>('tabel_grade', 'ubah', { id, ...baris }, { pelaku: u.pegawaiId })
    : await tulis<{ id: string }>('tabel_grade', 'tambah', baris, { pelaku: u.pegawaiId });
  return { id: r.id };
}
