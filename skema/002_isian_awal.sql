-- =============================================================================
-- HRIS DPJM — migrasi 002: isian awal master data (SRS SET-04)
--
-- Hanya data yang sumbernya sudah pasti di dokumen. Yang masih menunggu
-- masukan sengaja TIDAK diisi di sini (design_final.md §14):
--   tabel_grade        lampiran SK 17/KPTS/VIII/2025 belum diterima dalam bentuk data
--   jenis_cuti         Peraturan Perusahaan
--   aturan_reimburse   Peraturan Perusahaan
--   tarif_*            Keuangan / regulasi
--   hari_libur         ditetapkan HR lewat layar Pengaturan
-- Mesin hitung menolak berjalan dengan tabel tarif kosong, bukan menebak.
-- =============================================================================

\set ON_ERROR_STOP on

-- Unit dan direktur pembina (PRD §4.1). Direktur pembina diisi setelah
-- pegawai Direksi/Dirut ada, lewat layar Pengaturan.
INSERT INTO unit (kode, nama) VALUES
  ('KMR', 'Kepatuhan & Manajemen Risiko'),
  ('IA',  'Internal Audit'),
  ('KSU', 'Kepesertaan, SDM & Umum'),
  ('KEU', 'Keuangan & Akuntansi'),
  ('INV', 'Investasi');

-- Jabatan (PRD §4.1–4.2). Cara bayar lembur sesuai design_final.md §8.13:
-- lumpsum untuk Manager, Specialist, dan Assistant Manager.
INSERT INTO jabatan (nama, posisi_struktural, kelompok_jabatan, cara_bayar_lembur) VALUES
  ('Direktur Utama',    'Dirut',   'Direksi',            'tidak_ada'),
  ('Direktur',          'Direksi', 'Direksi',            'tidak_ada'),
  ('Dewan Pengawas',    'Dewas',   'Dewan Pengawas',     'tidak_ada'),
  ('Manager',           'Manager', 'Manager',            'lumpsum'),
  ('Assistant Manager', 'Staff',   'Assistant Manager',  'lumpsum'),
  ('Specialist',        'Staff',   'Specialist',         'lumpsum'),
  ('Bendahara',         'Staff',   'Bendahara',          'upah_per_jam'),
  ('Senior Officer',    'Staff',   'Senior Officer',     'upah_per_jam'),
  ('Officer',           'Staff',   'Officer',            'upah_per_jam'),
  ('Caraka',            'Staff',   'Caraka',             'upah_per_jam'),
  ('Staf',              'Staff',   'Staf',               'upah_per_jam');

-- Katalog komponen payroll (design_final.md §8.13, PAY-34).
INSERT INTO komponen_gaji (kode, nama, tipe, kena_pajak) VALUES
  ('GAJI_POKOK',           'Gaji Pokok',                                   'pendapatan', true),
  ('TUNJ_JABATAN',         'Tunjangan Jabatan',                            'pendapatan', true),
  ('UANG_MAKAN',           'Uang Makan',                                   'pendapatan', true),
  ('UANG_TRANSPORT',       'Uang Transport',                               'pendapatan', true),
  ('UANG_TELEKOM',         'Uang Telekomunikasi',                          'pendapatan', true),
  ('TUNJ_PERUMAHAN',       'Tunjangan Perumahan & Utilitas',               'pendapatan', true),
  ('TUNJ_TRANSPORT_DEWAS', 'Tunjangan Transportasi Dewan Pengawas',        'pendapatan', true),
  ('THR',                  'Tunjangan Hari Raya',                          'pendapatan', true),
  ('ONGKOS_CUTI_TAHUNAN',  'Ongkos Cuti Tahunan',                          'pendapatan', true),
  ('ONGKOS_CUTI_BESAR',    'Ongkos Cuti Besar / Istirahat Panjang',        'pendapatan', true),
  ('LEMBUR',               'Upah/Insentif Lembur',                         'pendapatan', true),
  ('UANG_PIKET',           'Uang Kompensasi Piket',                        'pendapatan', true),
  ('INSENTIF_KINERJA',     'Insentif Kinerja/Bonus/Jasa Produksi',         'pendapatan', true),
  ('BANTUAN_DUKA',         'Bantuan Sumbangan Duka Cita',                  'pendapatan', false),
  ('BANTUAN_DITAHAN',      'Bantuan Keuangan Keluarga (pegawai ditahan)',  'pendapatan', true),
  ('PURNA_KARYA',          'Tambahan Uang Purna Karya',                    'pendapatan', true),
  ('TUNJANGAN_PAJAK',      'Tunjangan Pajak (gross-up)',                   'pendapatan', true);

-- Jam kerja bawaan (SRS WRK-01): 08.00–17.00, toleransi 0, Senin–Jumat, susulan 7 hari.
INSERT INTO jam_kerja (jam_masuk, jam_pulang, toleransi_menit, hari_kerja, batas_susulan_hari, berlaku_mulai)
VALUES ('08:00', '17:00', 0, ARRAY[1,2,3,4,5]::smallint[], 7, DATE '2026-01-01');

-- Pengaturan kunci-nilai (design_final.md §4.3).
INSERT INTO pengaturan (kunci, nilai, keterangan) VALUES
  ('payroll_unit_tahap3',       'KSU,KEU', 'Unit yang Manager-nya memverifikasi Tahap 3 payroll & biaya'),
  ('retensi_foto_hari',         '365',     'Foto presensi dihapus setelah sekian hari (ATT-13)'),
  ('pengingat_kontrak_hari',    '30',      'Pengingat kontrak berakhir ke Admin HRD (EMP-16)'),
  ('pengingat_sertifikat_hari', '60',      'Pengingat sertifikat kedaluwarsa ke Admin HRD (EMP-16)'),
  ('tenggat_pj_hari_kerja',     '14',      'Tenggat pertanggungjawaban uang muka (BIA-06)');

-- Kebijakan approval bawaan (design_final.md §4.3). Dipakai mulai Fase 2.
INSERT INTO kebijakan_approval (jenis, langkah) VALUES
  ('cuti',               ARRAY['ATASAN','DIREKSI']),
  ('lembur',             ARRAY['ATASAN','DIREKSI']),
  ('dinas',              ARRAY['ATASAN','HRD']),
  ('susulan',            ARRAY['HRD']),
  ('tinjauan_radius',    ARRAY['HRD']),
  ('perubahan_profil',   ARRAY['HRD']),
  ('reimburse',          ARRAY['FINANCE']),
  ('komponen_peristiwa', ARRAY['ATASAN','DIREKSI']);

INSERT INTO skema_versi (versi, nama) VALUES (2, '002_isian_awal');
