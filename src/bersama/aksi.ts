// Satu tipe yang dipakai klien dan server (design_final.md §2.1).
// Tabel AKSI di server wajib punya handler untuk SETIAP kunci di sini, dan
// tipe kembaliannya harus cocok — kelas galat "klien mengirim `tanggal`,
// server menunggu `tgl`" tertangkap saat tsc, bukan saat pegawai mengklik.

export type Tanggal = string; // yyyy-MM-dd
export type WaktuIso = string; // ISO 8601

export type PeranStruktural = 'employee' | 'manager' | 'direksi' | 'dirut';
export type PeranAdmin = 'admin_hrd' | 'admin_payroll' | 'admin_finance' | 'auditor' | 'super_admin';
export type Peran = PeranStruktural | PeranAdmin;
export const PERAN_ADMIN: readonly PeranAdmin[] = ['super_admin', 'admin_hrd', 'admin_payroll', 'admin_finance', 'auditor'];

export const JENIS_KEPEGAWAIAN = ['PKWTT', 'PKWT', 'Penugasan', 'Outsource', 'Direksi', 'Dewan Pengawas'] as const;
export type JenisKepegawaian = (typeof JENIS_KEPEGAWAIAN)[number];

export const STATUS_PEGAWAI = [
  'probation', 'aktif', 'bebas_tugas_sakit_panjang', 'bebas_tugas_pendidikan',
  'bebas_tugas_skorsing', 'bebas_tugas_ditahan', 'berhenti', 'meninggal',
] as const;
export type StatusPegawai = (typeof STATUS_PEGAWAI)[number];

export const LABEL_STATUS_PEGAWAI: Record<StatusPegawai, string> = {
  probation: 'Calon Pegawai (Probation)',
  aktif: 'Aktif',
  bebas_tugas_sakit_panjang: 'Bebas Tugas – Cuti Sakit Panjang',
  bebas_tugas_pendidikan: 'Bebas Tugas – Tugas Pendidikan',
  bebas_tugas_skorsing: 'Bebas Tugas – Skorsing / Non-aktif',
  bebas_tugas_ditahan: 'Bebas Tugas – Ditahan',
  berhenti: 'Berhenti',
  meninggal: 'Meninggal Dunia',
};

export const JENIS_DOKUMEN = ['KTP', 'KK', 'NPWP', 'Ijazah', 'BukuTabungan', 'SK', 'Lainnya'] as const;
export type JenisDokumen = (typeof JENIS_DOKUMEN)[number];

export const JENIS_RIWAYAT = ['keluarga', 'pendidikan', 'riwayat_pekerjaan', 'sertifikasi', 'riwayat_diklat'] as const;
export type JenisRiwayat = (typeof JENIS_RIWAYAT)[number];

/** Kunci menu (design_final.md §10.3). Hanya modul yang sudah dibangun. */
export type KunciMenu =
  | 'beranda' | 'presensi' | 'rekap_kehadiran'
  | 'profil' | 'ubah_sandi'
  | 'data_pegawai' | 'gaji_pokok'
  | 'audit_log'
  | 'user_management' | 'pengaturan' | 'status_sistem';

export interface Galat {
  kode: string;
  pesan: string;
  kolom?: string;
}

export type Respons<T> = { ok: true; data: T } | { ok: false; galat: Galat };

// ---------------------------------------------------------------------------
// Sesi
// ---------------------------------------------------------------------------

export interface InfoSesi {
  pegawaiId: string;
  nama: string;
  npp: string;
  email: string;
  jabatan: string | null;
  unit: string | null;
  adaFoto: boolean;
  peranStruktural: PeranStruktural;
  peranAdmin: PeranAdmin[];
  wajibGantiSandi: boolean;
  menu: KunciMenu[];
}

// ---------------------------------------------------------------------------
// Presensi
// ---------------------------------------------------------------------------

export interface PresensiRingkas {
  id: string;
  tanggal: Tanggal;
  masukPada: WaktuIso | null;
  pulangPada: WaktuIso | null;
  sumber: 'check_in' | 'dinas_luar' | 'susulan' | 'tinjauan_radius' | 'koreksi_hr';
  namaKantor: string | null;
  jarakM: number | null;
  dalamRadius: boolean | null;
  bypass: boolean | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  adaFoto: boolean;
  fotoBerkasId: string | null;
  alasanKoreksi: string | null;
}

export interface PresensiHariIni {
  tanggal: Tanggal;
  waktuServer: WaktuIso;
  hariKerja: boolean;
  wajibPresensi: boolean;
  jamMasuk: string;
  jamPulang: string;
  presensi: PresensiRingkas | null;
  tombol: 'check_in' | 'check_out' | null;
}

export interface BarisPresensiPegawai {
  pegawaiId: string;
  nama: string;
  npp: string;
  unit: string | null;
  wajibPresensi: boolean;
  presensi: PresensiRingkas | null;
  /** tanpa_check_in | tanpa_check_out | lengkap | libur */
  keadaan: 'belum_masuk' | 'tanpa_check_out' | 'lengkap' | 'tidak_wajib' | 'libur';
}

export interface PercobaanLuarRadius {
  id: string;
  pegawaiId: string;
  nama: string;
  npp: string;
  waktu: WaktuIso;
  lat: number;
  lng: number;
  akurasi: number | null;
  namaKantor: string | null;
  jarakM: number | null;
  radius: number | null;
  fotoBerkasId: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Pegawai
// ---------------------------------------------------------------------------

export interface RingkasPegawai {
  id: string;
  npp: string;
  nama: string;
  email: string;
  jabatan: string | null;
  unit: string | null;
  jenisKepegawaian: JenisKepegawaian;
  statusPegawai: StatusPegawai;
  aktif: boolean;
  punyaAkun: boolean;
}

/** Kolom pegawai persis seperti di tabel (EMP-19: tidak ada field tanpa kolom). */
export interface DataPegawai {
  id?: string;
  npp: string;
  nik: string | null;
  npwp: string | null;
  nama_lengkap: string;
  gelar_depan: string | null;
  gelar_belakang: string | null;
  jenis_kelamin: 'L' | 'P' | null;
  tempat_lahir: string | null;
  tanggal_lahir: Tanggal | null;
  agama: string | null;
  kewarganegaraan: string | null;
  status_pernikahan: string | null;
  ptkp: string | null;
  alamat_ktp: string | null;
  alamat_domisili: string | null;
  no_hp: string | null;
  email: string;
  jenis_kepegawaian: JenisKepegawaian;
  status_pegawai: StatusPegawai;
  unit_id: string | null;
  jabatan_id: string | null;
  kelompok_jabatan: string | null;
  grade: string | null;
  sub_grade: string | null;
  tgl_masuk: Tanggal | null;
  tgl_masa_kerja_diakui: Tanggal | null;
  tgl_pengangkatan: Tanggal | null;
  tgl_akhir_probation: Tanggal | null;
  no_sk: string | null;
  tgl_sk: Tanggal | null;
  tgl_mulai_kontrak: Tanggal | null;
  tgl_akhir_kontrak: Tanggal | null;
  vendor_instansi: string | null;
  no_surat_penugasan: string | null;
  pendidikan_terakhir: string | null;
  jurusan: string | null;
  bank_nama: string | null;
  bank_rekening: string | null;
  bank_atas_nama: string | null;
  no_bpjs_kes: string | null;
  faskes: string | null;
  no_bpjs_tk: string | null;
  no_dplk: string | null;
  wajib_presensi: boolean;
  bypass_gps: boolean;
  potongan_terlambat: boolean;
  ikut_bpjs_kes: boolean;
  ikut_bpjs_tk: boolean;
  dplk_aktif: boolean;
  dpjm_pemotong_pajak: boolean;
  ikut_payroll: boolean;
  titik_kantor_id: string | null;
  tgl_berhenti: Tanggal | null;
  alasan_berhenti: string | null;
}

export interface BarisRiwayat {
  id: string;
  [kolom: string]: string | number | boolean | null;
}

export interface DokumenPegawai {
  id: string;
  jenis: JenisDokumen;
  berkasId: string;
  namaBerkas: string;
  ukuranByte: number;
  diunggahPada: WaktuIso;
}

export interface RiwayatStatus {
  id: string;
  status: StatusPegawai;
  tglMulai: Tanggal;
  tglSelesai: Tanggal | null;
  keterangan: string | null;
}

export interface VersiGaji {
  id: string;
  komponenKode: string;
  komponenNama: string;
  nominal: number;
  berlakuMulai: Tanggal;
  berlakuSampai: Tanggal | null;
  noSk: string | null;
}

export interface DetailPegawai {
  /** 'penuh' untuk HRD/Super Admin/diri sendiri; 'dasar' untuk atasan. */
  cakupan: 'penuh' | 'dasar';
  pegawai: Partial<DataPegawai> & { id: string; npp: string; nama_lengkap: string };
  jabatan: string | null;
  unit: string | null;
  masaKerja: string;
  adaFoto: boolean;
  bolehUbah: boolean;
  riwayatStatus: RiwayatStatus[];
  keluarga: BarisRiwayat[];
  pendidikan: BarisRiwayat[];
  riwayat_pekerjaan: BarisRiwayat[];
  sertifikasi: BarisRiwayat[];
  riwayat_diklat: BarisRiwayat[];
  dokumen: DokumenPegawai[];
  /** null bila tidak berhak membaca gaji (OTZ-03/04). */
  gaji: VersiGaji[] | null;
}

export interface GalatImpor {
  baris: number;
  kolom: string;
  pesan: string;
}

export interface PratinjauImpor {
  sah: boolean;
  jumlahBaris: number;
  diabaikan: number;
  pratinjau: { baris: number; npp: string; nama: string; jenisKepegawaian: string; unit: string | null }[];
  galat: GalatImpor[];
}

// ---------------------------------------------------------------------------
// Pengguna dan peran
// ---------------------------------------------------------------------------

export interface BarisAkun {
  penggunaId: string;
  pegawaiId: string;
  npp: string;
  nama: string;
  email: string;
  jabatan: string | null;
  unit: string | null;
  peranStruktural: PeranStruktural;
  peranAdmin: PeranAdmin[];
  aktif: boolean;
  wajibGantiSandi: boolean;
  terkunciSampai: WaktuIso | null;
  loginTerakhir: WaktuIso | null;
}

export interface KonflikPeran {
  pegawaiId: string;
  nama: string;
  kombinasi: string;
  alasan: string | null;
  akibat: string;
}

export interface AkunBaru {
  pegawaiId: string;
  nama: string;
  npp: string;
  sandiSementara: string;
}

// ---------------------------------------------------------------------------
// Pengaturan
// ---------------------------------------------------------------------------

export interface Unit {
  id: string;
  kode: string;
  nama: string;
  direkturPembinaId: string | null;
  direkturPembina: string | null;
  aktif: boolean;
}

export interface Jabatan {
  id: string;
  nama: string;
  posisiStruktural: 'Staff' | 'Manager' | 'Direksi' | 'Dirut' | 'Dewas';
  kelompokJabatan: string | null;
  caraBayarLembur: 'upah_per_jam' | 'lumpsum' | 'tidak_ada';
  aktif: boolean;
}

export interface TitikKantorData {
  id: string;
  nama: string;
  alamat: string | null;
  lat: number;
  lng: number;
  radiusM: number;
  aktif: boolean;
}

export interface HariLibur {
  tanggal: Tanggal;
  keterangan: string;
  sumber: 'nasional' | 'ditetapkan_hr';
  aktif: boolean;
}

export interface JamKerja {
  id: string;
  jamMasuk: string;
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: number[];
  batasSusulanHari: number;
  berlakuMulai: Tanggal;
}

export interface BarisGradeData {
  id: string;
  grade: string;
  subGrade: string;
  namaJabatan: string | null;
  pendidikanMin: string | null;
  masaKerjaMinThn: number | null;
  masaKerjaMaxThn: number | null;
  tunjanganJabatan: number | null;
  gapokMin: number | null;
  gapokMed: number | null;
  gapokMax: number | null;
  berlakuMulai: Tanggal;
}

export interface KomponenGaji {
  kode: string;
  nama: string;
  tipe: 'pendapatan' | 'potongan' | 'informasi';
  kenaPajak: boolean;
  aktif: boolean;
}

export interface NilaiPengaturan {
  kunci: string;
  nilai: string;
  keterangan: string | null;
}

export interface MasterData {
  unit: Unit[];
  jabatan: Jabatan[];
  titikKantor: TitikKantorData[];
  hariLibur: HariLibur[];
  jamKerja: JamKerja[];
  tabelGrade: BarisGradeData[];
  komponenGaji: KomponenGaji[];
  pengaturan: NilaiPengaturan[];
  /** Untuk pilihan direktur pembina unit. */
  direksi: { id: string; nama: string; jabatan: string }[];
}

// ---------------------------------------------------------------------------
// Audit Log, Beranda, Sistem
// ---------------------------------------------------------------------------

export interface BarisAudit {
  no: number;
  waktu: WaktuIso;
  pelaku: string | null;
  pelakuNpp: string | null;
  aksi: string;
  tabel: string;
  barisId: string | null;
  sebelum: Record<string, unknown> | null;
  sesudah: Record<string, unknown> | null;
  alasan: string | null;
}

export interface HasilPeriksaRantai {
  utuh: boolean;
  jumlahBaris: number;
  barisRusak: number | null;
  pesan: string;
}

export interface ItemTindakan {
  jenis: string;
  judul: string;
  rincian: string;
  menu: KunciMenu;
  pegawaiId?: string;
}

export interface Beranda {
  presensiHariIni: PresensiHariIni;
  /** Kehadiran saya bulan berjalan per hari kerja (tanpa nominal potongan, DSH-08). */
  kehadiranBulanIni: { tanggal: Tanggal; status: 'hadir' | 'terlambat' | 'belum' | 'mangkir' | 'libur' | 'dinas' }[];
  ringkasBulanIni: { hadir: number; terlambat: number; menitTerlambat: number; tanpaCheckOut: number };
  tim?: { hadir: number; belum: number; total: number; nama: { nama: string; keadaan: string }[] };
  hrd?: { tindakan: ItemTindakan[]; kehadiranHariIni: { hadir: number; belum: number; tidakWajib: number; total: number } };
  auditor?: { rantai: HasilPeriksaRantai; perubahanSensitif7Hari: number; resetSandi30Hari: number; akunTerkunci: number };
  superAdmin?: { konflikPeran: KonflikPeran[]; pekerjaan: StatusPekerjaan[]; akunTerkunci: number };
}

export interface StatusPekerjaan {
  pekerjaan: string;
  terakhir: WaktuIso | null;
  berhasil: boolean | null;
  galat: string | null;
  terlambat: boolean;
}

export interface StatusSistem {
  lingkungan: string;
  versiNode: string;
  versiPostgres: string;
  versiSkema: number;
  ukuranDbByte: number;
  ukuranBerkasByte: number;
  cakramSisaByte: number | null;
  cakramTotalByte: number | null;
  pekerjaan: StatusPekerjaan[];
  konflikPeran: KonflikPeran[];
}

// ---------------------------------------------------------------------------
// Daftar aksi: apa yang dikirim, apa yang diterima
// ---------------------------------------------------------------------------

type A<K, T> = { kirim: K; terima: T };
type Kosong = Record<string, never>;

export interface Aksi {
  'auth.login': A<{ username: string; sandi: string; ingat: boolean }, InfoSesi>;
  'auth.keluar': A<Kosong, null>;
  'auth.saya': A<Kosong, InfoSesi>;
  'auth.gantiSandi': A<{ sandiLama: string; sandiBaru: string }, null>;

  'beranda.ringkasan': A<Kosong, Beranda>;

  'presensi.hariIni': A<Kosong, PresensiHariIni>;
  'presensi.checkIn': A<{ lat: number; lng: number; akurasi: number; foto: string }, PresensiRingkas>;
  'presensi.checkOut': A<{ lat: number; lng: number; akurasi: number }, PresensiRingkas>;
  'presensi.riwayatSaya': A<{ bulan: string }, PresensiRingkas[]>;
  'presensi.daftar': A<{ tanggal: Tanggal }, BarisPresensiPegawai[]>;
  'presensi.koreksi': A<
    { pegawaiId: string; tanggal: Tanggal; jamMasuk: string | null; jamPulang: string | null; alasan: string },
    PresensiRingkas
  >;
  'presensi.percobaan': A<{ mulai: Tanggal; akhir: Tanggal }, PercobaanLuarRadius[]>;

  'pegawai.daftar': A<{ cari?: string; termasukNonaktif?: boolean }, RingkasPegawai[]>;
  'pegawai.detail': A<{ id: string }, DetailPegawai>;
  'pegawai.saya': A<Kosong, DetailPegawai>;
  'pegawai.simpan': A<DataPegawai, { id: string; peringatan: string | null }>;
  'pegawai.ubahStatus': A<
    { pegawaiId: string; status: StatusPegawai; tglMulai: Tanggal; keterangan: string | null },
    null
  >;
  'pegawai.simpanRiwayat': A<{ jenis: JenisRiwayat; pegawaiId: string; data: Record<string, unknown> }, { id: string }>;
  'pegawai.nonaktifkanRiwayat': A<{ jenis: JenisRiwayat; id: string }, null>;
  'pegawai.unggahDokumen': A<
    { pegawaiId: string; jenis: JenisDokumen; namaBerkas: string; mediaType: string; isi: string },
    { id: string }
  >;
  'pegawai.nonaktifkanDokumen': A<{ id: string }, null>;
  'pegawai.unggahFoto': A<{ pegawaiId: string; isi: string }, null>;
  'pegawai.imporPratinjau': A<{ isi: string }, PratinjauImpor>;
  'pegawai.imporSimpan': A<{ isi: string }, { jumlah: number }>;

  'gaji.daftar': A<{ pegawaiId: string }, VersiGaji[]>;
  'gaji.ringkasan': A<Kosong, { pegawaiId: string; npp: string; nama: string; unit: string | null; gapok: number | null; tunjJabatan: number | null }[]>;
  'gaji.tambah': A<
    { pegawaiId: string; komponenKode: string; nominal: number; berlakuMulai: Tanggal; noSk: string | null },
    { id: string; peringatan: string | null; usulanSubGrade: string | null }
  >;

  'pengguna.daftar': A<Kosong, { akun: BarisAkun[]; tanpaAkun: RingkasPegawai[]; konflik: KonflikPeran[] }>;
  'pengguna.buatAkun': A<{ pegawaiIds: string[] }, AkunBaru[]>;
  'pengguna.resetSandi': A<{ penggunaId: string }, { sandiSementara: string }>;
  'pengguna.aturAktif': A<{ penggunaId: string; aktif: boolean; alasan: string }, null>;
  'pengguna.aturPeran': A<{ pegawaiId: string; peran: PeranAdmin[]; alasan: string | null }, null>;

  'pengaturan.master': A<Kosong, MasterData>;
  'pengaturan.simpanUnit': A<{ id?: string; kode: string; nama: string; direkturPembinaId: string | null; aktif: boolean }, { id: string }>;
  'pengaturan.simpanJabatan': A<
    { id?: string; nama: string; posisiStruktural: Jabatan['posisiStruktural']; kelompokJabatan: string | null; caraBayarLembur: Jabatan['caraBayarLembur']; aktif: boolean },
    { id: string }
  >;
  'pengaturan.simpanTitikKantor': A<
    { id?: string; nama: string; alamat: string | null; lat: number; lng: number; radiusM: number; aktif: boolean },
    { id: string }
  >;
  'pengaturan.simpanHariLibur': A<{ tanggal: Tanggal; keterangan: string; sumber: 'nasional' | 'ditetapkan_hr' }, null>;
  'pengaturan.nonaktifkanHariLibur': A<{ tanggal: Tanggal }, null>;
  'pengaturan.tambahJamKerja': A<
    { jamMasuk: string; jamPulang: string; toleransiMenit: number; hariKerja: number[]; batasSusulanHari: number; berlakuMulai: Tanggal },
    { id: string }
  >;
  'pengaturan.simpanNilai': A<{ kunci: string; nilai: string }, null>;
  'pengaturan.simpanGrade': A<Omit<BarisGradeData, 'id'> & { id?: string }, { id: string }>;

  'audit.baca': A<
    { mulai: Tanggal; akhir: Tanggal; tabel?: string; pelakuId?: string; barisId?: string; pegawaiId?: string; halaman?: number },
    { baris: BarisAudit[]; total: number; perHalaman: number }
  >;
  'audit.periksaRantai': A<Kosong, HasilPeriksaRantai>;

  'sistem.status': A<Kosong, StatusSistem>;
}

export type NamaAksi = keyof Aksi;
