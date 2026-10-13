// Definisi kolom formulir pegawai dan riwayatnya. Satu sumber untuk layar,
// validasi server, dan templat impor — sehingga tidak ada field di layar yang
// tidak punya kolom di basis data (SRS EMP-19; diuji test/integrasi/kolom).
import { JENIS_KEPEGAWAIAN, STATUS_PEGAWAI, type JenisKepegawaian, type JenisRiwayat } from './aksi.js';

export type JenisKolom = 'teks' | 'tanggal' | 'pilihan' | 'ya_tidak' | 'unit' | 'jabatan' | 'titik_kantor' | 'angka';

export interface DefKolom {
  kolom: string;
  label: string;
  jenis: JenisKolom;
  wajib?: boolean;
  maks?: number;
  pola?: string; // RegExp source
  pesanPola?: string;
  opsi?: readonly string[];
  bagian: string;
  /** Tidak bisa diubah lewat Simpan; punya aksinya sendiri. */
  hanyaSaatBaru?: boolean;
}

export const PTKP = ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'] as const;

export const KOLOM_PEGAWAI: readonly DefKolom[] = [
  { kolom: 'npp', label: 'NPP', jenis: 'teks', wajib: true, maks: 30, pola: '^[A-Za-z0-9.\\-/]{1,30}$', pesanPola: 'Huruf, angka, titik, garis', bagian: 'Identitas' },
  { kolom: 'nama_lengkap', label: 'Nama lengkap', jenis: 'teks', wajib: true, maks: 150, bagian: 'Identitas' },
  { kolom: 'gelar_depan', label: 'Gelar depan', jenis: 'teks', maks: 30, bagian: 'Identitas' },
  { kolom: 'gelar_belakang', label: 'Gelar belakang', jenis: 'teks', maks: 50, bagian: 'Identitas' },
  { kolom: 'nik', label: 'NIK', jenis: 'teks', maks: 16, pola: '^\\d{16}$', pesanPola: 'Tepat 16 digit angka', bagian: 'Identitas' },
  { kolom: 'npwp', label: 'NPWP', jenis: 'teks', maks: 25, bagian: 'Identitas' },
  { kolom: 'jenis_kelamin', label: 'Jenis kelamin', jenis: 'pilihan', opsi: ['L', 'P'], bagian: 'Identitas' },
  { kolom: 'tempat_lahir', label: 'Tempat lahir', jenis: 'teks', maks: 100, bagian: 'Identitas' },
  { kolom: 'tanggal_lahir', label: 'Tanggal lahir', jenis: 'tanggal', bagian: 'Identitas' },
  { kolom: 'agama', label: 'Agama', jenis: 'teks', maks: 30, bagian: 'Identitas' },
  { kolom: 'kewarganegaraan', label: 'Kewarganegaraan', jenis: 'teks', maks: 50, bagian: 'Identitas' },
  { kolom: 'status_pernikahan', label: 'Status pernikahan', jenis: 'teks', maks: 30, bagian: 'Identitas' },
  { kolom: 'ptkp', label: 'PTKP', jenis: 'pilihan', opsi: PTKP, bagian: 'Identitas' },
  { kolom: 'alamat_ktp', label: 'Alamat KTP', jenis: 'teks', maks: 300, bagian: 'Identitas' },
  { kolom: 'alamat_domisili', label: 'Alamat domisili', jenis: 'teks', maks: 300, bagian: 'Identitas' },
  { kolom: 'no_hp', label: 'No. HP', jenis: 'teks', maks: 20, pola: '^\\+?[0-9 -]{8,20}$', pesanPola: 'Nomor HP tidak sah', bagian: 'Identitas' },
  { kolom: 'email', label: 'Email', jenis: 'teks', wajib: true, maks: 150, pola: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', pesanPola: 'Email tidak sah', bagian: 'Identitas' },

  { kolom: 'jenis_kepegawaian', label: 'Jenis kepegawaian', jenis: 'pilihan', wajib: true, opsi: JENIS_KEPEGAWAIAN, bagian: 'Kepegawaian' },
  { kolom: 'status_pegawai', label: 'Status pegawai', jenis: 'pilihan', wajib: true, opsi: STATUS_PEGAWAI, bagian: 'Kepegawaian', hanyaSaatBaru: true },
  { kolom: 'unit_id', label: 'Unit', jenis: 'unit', bagian: 'Kepegawaian' },
  { kolom: 'jabatan_id', label: 'Jabatan', jenis: 'jabatan', bagian: 'Kepegawaian' },
  { kolom: 'kelompok_jabatan', label: 'Kelompok jabatan', jenis: 'teks', maks: 50, bagian: 'Kepegawaian' },
  { kolom: 'grade', label: 'Grade', jenis: 'teks', maks: 10, bagian: 'Kepegawaian' },
  { kolom: 'sub_grade', label: 'Sub grade', jenis: 'teks', maks: 10, bagian: 'Kepegawaian' },
  { kolom: 'tgl_masuk', label: 'Tanggal masuk', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'tgl_masa_kerja_diakui', label: 'Tanggal masa kerja diakui', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'tgl_pengangkatan', label: 'Tanggal pengangkatan', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'tgl_akhir_probation', label: 'Akhir probation', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'no_sk', label: 'No. SK', jenis: 'teks', maks: 100, bagian: 'Kepegawaian' },
  { kolom: 'tgl_sk', label: 'Tanggal SK', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'tgl_mulai_kontrak', label: 'Mulai kontrak', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'tgl_akhir_kontrak', label: 'Akhir kontrak', jenis: 'tanggal', bagian: 'Kepegawaian' },
  { kolom: 'vendor_instansi', label: 'Vendor / instansi induk', jenis: 'teks', maks: 150, bagian: 'Kepegawaian' },
  { kolom: 'no_surat_penugasan', label: 'No. surat penugasan', jenis: 'teks', maks: 100, bagian: 'Kepegawaian' },
  { kolom: 'pendidikan_terakhir', label: 'Pendidikan terakhir', jenis: 'teks', maks: 30, bagian: 'Kepegawaian' },
  { kolom: 'jurusan', label: 'Jurusan', jenis: 'teks', maks: 100, bagian: 'Kepegawaian' },
  { kolom: 'tgl_berhenti', label: 'Tanggal berhenti', jenis: 'tanggal', bagian: 'Kepegawaian', hanyaSaatBaru: true },
  { kolom: 'alasan_berhenti', label: 'Alasan berhenti', jenis: 'teks', maks: 300, bagian: 'Kepegawaian', hanyaSaatBaru: true },

  { kolom: 'bank_nama', label: 'Nama bank', jenis: 'teks', maks: 50, bagian: 'Bank & BPJS' },
  { kolom: 'bank_rekening', label: 'No. rekening', jenis: 'teks', maks: 30, pola: '^[0-9]{5,30}$', pesanPola: 'Hanya angka', bagian: 'Bank & BPJS' },
  { kolom: 'bank_atas_nama', label: 'Atas nama rekening', jenis: 'teks', maks: 150, bagian: 'Bank & BPJS' },
  { kolom: 'no_bpjs_kes', label: 'No. BPJS Kesehatan', jenis: 'teks', maks: 30, bagian: 'Bank & BPJS' },
  { kolom: 'faskes', label: 'Faskes', jenis: 'teks', maks: 150, bagian: 'Bank & BPJS' },
  { kolom: 'no_bpjs_tk', label: 'No. BPJS Ketenagakerjaan', jenis: 'teks', maks: 30, bagian: 'Bank & BPJS' },
  { kolom: 'no_dplk', label: 'No. DPLK', jenis: 'teks', maks: 30, bagian: 'Bank & BPJS' },

  { kolom: 'wajib_presensi', label: 'Wajib presensi', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'bypass_gps', label: 'Bypass GPS', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'potongan_terlambat', label: 'Potongan terlambat', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'ikut_bpjs_kes', label: 'BPJS Kesehatan', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'ikut_bpjs_tk', label: 'BPJS Ketenagakerjaan', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'dplk_aktif', label: 'DPLK', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'dpjm_pemotong_pajak', label: 'DPJM pemotong pajak', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'ikut_payroll', label: 'Ikut payroll', jenis: 'ya_tidak', bagian: 'Pengaturan' },
  { kolom: 'titik_kantor_id', label: 'Dikunci ke titik kantor', jenis: 'titik_kantor', bagian: 'Pengaturan' },
];

export type Sakelar =
  | 'wajib_presensi' | 'bypass_gps' | 'potongan_terlambat' | 'ikut_bpjs_kes'
  | 'ikut_bpjs_tk' | 'dplk_aktif' | 'dpjm_pemotong_pajak' | 'ikut_payroll';

/** Nilai awal sakelar menurut jenis kepegawaian (PRD §4.3, SRS EMP-20). */
export function sakelarBawaan(jenis: JenisKepegawaian): Record<Sakelar, boolean> {
  const dasar: Record<Sakelar, boolean> = {
    wajib_presensi: true, bypass_gps: false, potongan_terlambat: true, ikut_bpjs_kes: true,
    ikut_bpjs_tk: true, dplk_aktif: true, dpjm_pemotong_pajak: true, ikut_payroll: true,
  };
  switch (jenis) {
    case 'PKWT':
      return { ...dasar, dplk_aktif: false };
    // Hanya yang disebut PRD §4.3; sisanya mengikuti nilai dasar dan bisa diubah HRD.
    case 'Penugasan':
      return { ...dasar, ikut_bpjs_kes: false, ikut_bpjs_tk: false };
    case 'Outsource': // dihitung seperti PKWT; PPh biasanya dipotong vendor
      return { ...dasar, dplk_aktif: false, dpjm_pemotong_pajak: false, ikut_payroll: false };
    case 'Direksi':
      return { ...dasar, bypass_gps: true, potongan_terlambat: false };
    case 'Dewan Pengawas':
      return { ...dasar, ikut_bpjs_kes: false, ikut_bpjs_tk: false };
    default:
      return dasar;
  }
}

export const KOLOM_RIWAYAT: Record<JenisRiwayat, { judul: string; kolom: readonly DefKolom[] }> = {
  keluarga: {
    judul: 'Keluarga',
    kolom: [
      { kolom: 'nama', label: 'Nama', jenis: 'teks', wajib: true, maks: 150, bagian: '' },
      { kolom: 'hubungan', label: 'Hubungan', jenis: 'pilihan', wajib: true, opsi: ['Suami', 'Istri', 'Anak', 'Ayah', 'Ibu', 'Saudara', 'Lainnya'], bagian: '' },
      { kolom: 'nik', label: 'NIK', jenis: 'teks', maks: 16, pola: '^\\d{16}$', pesanPola: 'Tepat 16 digit angka', bagian: '' },
      { kolom: 'tgl_lahir', label: 'Tanggal lahir', jenis: 'tanggal', bagian: '' },
      { kolom: 'jenis_kelamin', label: 'Jenis kelamin', jenis: 'pilihan', opsi: ['L', 'P'], bagian: '' },
      { kolom: 'no_hp', label: 'No. HP', jenis: 'teks', maks: 20, pola: '^\\+?[0-9 -]{8,20}$', pesanPola: 'Nomor HP tidak sah', bagian: '' },
      { kolom: 'alamat', label: 'Alamat', jenis: 'teks', maks: 300, bagian: '' },
      { kolom: 'kontak_darurat', label: 'Kontak darurat', jenis: 'ya_tidak', bagian: '' },
      { kolom: 'ditanggung', label: 'Ditanggung', jenis: 'ya_tidak', bagian: '' },
      { kolom: 'ahli_waris', label: 'Ahli waris', jenis: 'ya_tidak', bagian: '' },
      { kolom: 'bank_ahli_waris', label: 'Bank ahli waris', jenis: 'teks', maks: 50, bagian: '' },
      { kolom: 'rek_ahli_waris', label: 'Rekening ahli waris', jenis: 'teks', maks: 30, pola: '^[0-9]{5,30}$', pesanPola: 'Hanya angka', bagian: '' },
    ],
  },
  pendidikan: {
    judul: 'Pendidikan',
    kolom: [
      { kolom: 'jenjang', label: 'Jenjang', jenis: 'pilihan', wajib: true, opsi: ['SD', 'SMP', 'SMA/SMK', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3'], bagian: '' },
      { kolom: 'institusi', label: 'Institusi', jenis: 'teks', maks: 150, bagian: '' },
      { kolom: 'jurusan', label: 'Jurusan', jenis: 'teks', maks: 100, bagian: '' },
      { kolom: 'tahun_masuk', label: 'Tahun masuk', jenis: 'angka', bagian: '' },
      { kolom: 'tahun_lulus', label: 'Tahun lulus', jenis: 'angka', bagian: '' },
      { kolom: 'no_ijazah', label: 'No. ijazah', jenis: 'teks', maks: 100, bagian: '' },
    ],
  },
  riwayat_pekerjaan: {
    judul: 'Riwayat pekerjaan',
    kolom: [
      { kolom: 'instansi', label: 'Instansi', jenis: 'teks', wajib: true, maks: 150, bagian: '' },
      { kolom: 'jabatan', label: 'Jabatan', jenis: 'teks', maks: 100, bagian: '' },
      { kolom: 'tahun_mulai', label: 'Tahun mulai', jenis: 'angka', bagian: '' },
      { kolom: 'tahun_selesai', label: 'Tahun selesai', jenis: 'angka', bagian: '' },
      { kolom: 'keterangan', label: 'Keterangan', jenis: 'teks', maks: 300, bagian: '' },
    ],
  },
  sertifikasi: {
    judul: 'Sertifikasi',
    kolom: [
      { kolom: 'nama', label: 'Nama sertifikasi', jenis: 'teks', wajib: true, maks: 150, bagian: '' },
      { kolom: 'lembaga', label: 'Lembaga', jenis: 'teks', maks: 150, bagian: '' },
      { kolom: 'no_sertifikat', label: 'No. sertifikat', jenis: 'teks', maks: 100, bagian: '' },
      { kolom: 'tgl_terbit', label: 'Tanggal terbit', jenis: 'tanggal', bagian: '' },
      { kolom: 'berlaku_sampai', label: 'Berlaku sampai', jenis: 'tanggal', bagian: '' },
    ],
  },
  riwayat_diklat: {
    judul: 'Riwayat diklat',
    kolom: [
      { kolom: 'nama', label: 'Nama diklat', jenis: 'teks', wajib: true, maks: 150, bagian: '' },
      { kolom: 'penyelenggara', label: 'Penyelenggara', jenis: 'teks', maks: 150, bagian: '' },
      { kolom: 'tgl_mulai', label: 'Tanggal mulai', jenis: 'tanggal', bagian: '' },
      { kolom: 'tgl_selesai', label: 'Tanggal selesai', jenis: 'tanggal', bagian: '' },
      { kolom: 'jumlah_jam', label: 'Jumlah jam', jenis: 'angka', bagian: '' },
      { kolom: 'no_sertifikat', label: 'No. sertifikat', jenis: 'teks', maks: 100, bagian: '' },
    ],
  },
};
