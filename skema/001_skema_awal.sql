-- =============================================================================
-- HRIS Dana Pensiun Jasa Marga — skema awal PostgreSQL 16
-- Migrasi 001. Menggantikan satu Google Spreadsheet (design_final.md §4).
--
-- Dijalankan sekali pada basis data kosong, sebagai pemilik basis data.
-- Dibaca bersama design_final.md §4 (inventaris tabel) dan §7 (jalur tulis).
--
-- ATURAN YANG DITEGAKKAN DI SINI, BUKAN DI KODE:
--   EMP-02   NPP unik, email unik, NIK tepat 16 digit
--   EMP-07   gaji berversi tidak boleh tumpang tindih periodenya
--   PAY-02   hanya satu run `bulanan` per periode
--   PAY-06a  satu orang tidak boleh menyetujui dua tahap pada run yang sama
--   PAY-08   run final terkunci permanen, termasuk untuk super_admin
--   PAY-11   uang = bilangan bulat rupiah
--   AUD-*    Audit Log append-only
-- Di Sheets ketujuh aturan itu hanya prosa di dokumen. Di sini basis data
-- yang menolak, jadi tidak ada jalan melewatinya — termasuk lewat psql.
-- =============================================================================

\set ON_ERROR_STOP on

-- btree_gist diperlukan oleh EXCLUDE pada tabel `gaji` (uuid = + daterange &&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Domain
-- -----------------------------------------------------------------------------
-- Uang: bilangan bulat rupiah (PAY-11). Bukan numeric, bukan float.
-- Boleh negatif: run `penyesuaian` memuat koreksi bernilai minus.
CREATE DOMAIN rupiah AS bigint;

-- Persentase progres dan bobot JMPD.
CREATE DOMAIN persen AS numeric(5,2) CHECK (VALUE >= 0 AND VALUE <= 100);

-- Periode payroll, `yyyy-MM`.
CREATE DOMAIN periode_bulan AS text CHECK (VALUE ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- =============================================================================
-- A. IDENTITAS PEGAWAI
-- Dibuat lebih dulu supaya setiap tabel lain bisa punya kunci asing jejak
-- (`dibuat_oleh`, `diubah_oleh`) yang sungguhan. Tiga kunci asing miliknya
-- sendiri ditambahkan di bagian C, setelah tabel tujuannya ada.
-- =============================================================================

CREATE TABLE pegawai (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  npp                     text NOT NULL,
  nik                     text,
  npwp                    text,
  nama_lengkap            text NOT NULL,
  gelar_depan             text,
  gelar_belakang          text,
  jenis_kelamin           text CHECK (jenis_kelamin IN ('L','P')),
  tempat_lahir            text,
  tanggal_lahir           date,
  agama                   text,
  kewarganegaraan         text,
  status_pernikahan       text,
  ptkp                    text,
  alamat_ktp              text,
  alamat_domisili         text,
  no_hp                   text,
  email                   text NOT NULL,

  -- PRD §4.3 / EMP-03: dua kolom terpisah, dan keduanya wajib.
  jenis_kepegawaian       text NOT NULL CHECK (jenis_kepegawaian IN
                            ('PKWTT','PKWT','Penugasan','Outsource','Direksi','Dewan Pengawas')),
  status_pegawai          text NOT NULL CHECK (status_pegawai IN
                            ('probation','aktif','bebas_tugas_sakit_panjang','bebas_tugas_pendidikan',
                             'bebas_tugas_skorsing','bebas_tugas_ditahan','berhenti','meninggal')),

  unit_id                 uuid,
  jabatan_id              uuid,
  kelompok_jabatan        text,
  grade                   text,
  sub_grade               text,

  tgl_masuk               date,
  tgl_masa_kerja_diakui   date,
  tgl_pengangkatan        date,
  tgl_akhir_probation     date,
  no_sk                   text,
  tgl_sk                  date,
  tgl_mulai_kontrak       date,
  tgl_akhir_kontrak       date,
  vendor_instansi         text,
  no_surat_penugasan      text,

  pendidikan_terakhir     text,
  jurusan                 text,

  bank_nama               text,
  bank_rekening           text,
  bank_atas_nama          text,

  no_bpjs_kes             text,
  faskes                  text,
  no_bpjs_tk              text,
  no_dplk                 text,

  -- EMP-20: delapan sakelar per orang.
  wajib_presensi          boolean NOT NULL DEFAULT true,
  bypass_gps              boolean NOT NULL DEFAULT false,
  potongan_terlambat      boolean NOT NULL DEFAULT true,
  ikut_bpjs_kes           boolean NOT NULL DEFAULT true,
  ikut_bpjs_tk            boolean NOT NULL DEFAULT true,
  dplk_aktif              boolean NOT NULL DEFAULT false,
  dpjm_pemotong_pajak     boolean NOT NULL DEFAULT true,
  ikut_payroll            boolean NOT NULL DEFAULT true,

  titik_kantor_id         uuid,
  foto_file_id            uuid,

  tgl_berhenti            date,
  alasan_berhenti         text,
  aktif                   boolean NOT NULL DEFAULT true,

  dibuat_pada             timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh             uuid REFERENCES pegawai(id),
  diubah_pada             timestamptz,
  diubah_oleh             uuid REFERENCES pegawai(id),

  -- EMP-02. NIK boleh kosong saat impor awal, tetapi bila ada wajib 16 digit.
  CONSTRAINT pegawai_nik_16_digit CHECK (nik IS NULL OR nik ~ '^\d{16}$'),
  CONSTRAINT pegawai_berhenti_wajib_tanggal
    CHECK (status_pegawai <> 'berhenti' OR tgl_berhenti IS NOT NULL)
);

-- EMP-02: NPP dan email unik. Case-insensitive untuk email.
CREATE UNIQUE INDEX pegawai_npp_unik   ON pegawai (npp);
CREATE UNIQUE INDEX pegawai_email_unik ON pegawai (lower(email));
CREATE INDEX pegawai_unit_idx          ON pegawai (unit_id) WHERE aktif;

COMMENT ON COLUMN pegawai.nik IS 'Tetap text: 16 digit, nol di depan berarti. Jangan pernah numeric.';
COMMENT ON COLUMN pegawai.bank_rekening IS 'Tetap text: nol di depan berarti.';

-- EMP-04: perubahan status disimpan sebagai riwayat, baris lama tidak ditimpa.
CREATE TABLE riwayat_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id    uuid NOT NULL REFERENCES pegawai(id),
  status        text NOT NULL,
  tgl_mulai     date NOT NULL,
  tgl_selesai   date,
  keterangan    text,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id),
  CONSTRAINT riwayat_status_urut CHECK (tgl_selesai IS NULL OR tgl_selesai >= tgl_mulai)
);
CREATE INDEX riwayat_status_pegawai_idx ON riwayat_status (pegawai_id, tgl_mulai DESC);

CREATE TABLE keluarga (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  nama              text NOT NULL,
  hubungan          text NOT NULL,
  nik               text,
  tgl_lahir         date,
  jenis_kelamin     text CHECK (jenis_kelamin IN ('L','P')),
  no_hp             text,
  alamat            text,
  kontak_darurat    boolean NOT NULL DEFAULT false,
  ditanggung        boolean NOT NULL DEFAULT false,
  ahli_waris        boolean NOT NULL DEFAULT false,
  bank_ahli_waris   text,
  rek_ahli_waris    text,
  aktif             boolean NOT NULL DEFAULT true,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz,
  diubah_oleh       uuid REFERENCES pegawai(id),
  CONSTRAINT keluarga_nik_16_digit CHECK (nik IS NULL OR nik ~ '^\d{16}$'),
  -- EMP-09: kontak darurat tanpa nomor HP tidak ada gunanya.
  CONSTRAINT keluarga_kontak_darurat_perlu_hp
    CHECK (NOT kontak_darurat OR (no_hp IS NOT NULL AND no_hp <> ''))
);
CREATE INDEX keluarga_pegawai_idx ON keluarga (pegawai_id) WHERE aktif;
-- EMP-05: jumlah tanggungan dihitung dari sini, tidak pernah diketik.
CREATE INDEX keluarga_ditanggung_idx ON keluarga (pegawai_id) WHERE aktif AND ditanggung;

CREATE TABLE pendidikan (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id    uuid NOT NULL REFERENCES pegawai(id),
  jenjang       text NOT NULL,
  institusi     text,
  jurusan       text,
  tahun_masuk   smallint,
  tahun_lulus   smallint,
  no_ijazah     text,
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);
CREATE INDEX pendidikan_pegawai_idx ON pendidikan (pegawai_id) WHERE aktif;

CREATE TABLE riwayat_pekerjaan (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id      uuid NOT NULL REFERENCES pegawai(id),
  instansi        text NOT NULL,
  jabatan         text,
  tahun_mulai     smallint,
  tahun_selesai   smallint,
  keterangan      text,
  aktif           boolean NOT NULL DEFAULT true,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh     uuid REFERENCES pegawai(id),
  diubah_pada     timestamptz,
  diubah_oleh     uuid REFERENCES pegawai(id)
);
CREATE INDEX riwayat_pekerjaan_pegawai_idx ON riwayat_pekerjaan (pegawai_id) WHERE aktif;

-- =============================================================================
-- B. BERKAS
-- Pengganti Google Drive (design_final.md §4.8). Basis data memegang
-- katalognya, cakram memegang isinya. sha256 membuat berkas kembar
-- terdeteksi, dan membuat kerusakan cakram bisa dibuktikan.
-- =============================================================================

CREATE TABLE berkas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jalur_relatif   text NOT NULL,          -- relatif terhadap /var/lib/hris
  nama_asli       text NOT NULL,
  media_type      text NOT NULL,
  ukuran_byte     bigint NOT NULL CHECK (ukuran_byte >= 0),
  sha256          bytea NOT NULL CHECK (octet_length(sha256) = 32),
  golongan        text NOT NULL CHECK (golongan IN
                    ('presensi','lampiran','dokumen','foto_profil','surat','ekspor','bukti_bayar','sertifikat')),
  dihapus_pada    timestamptz,            -- retensi: foto presensi 365 hari, ekspor 7 hari
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh     uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX berkas_jalur_unik ON berkas (jalur_relatif);
CREATE INDEX berkas_sha_idx           ON berkas (sha256);
CREATE INDEX berkas_retensi_idx       ON berkas (golongan, dibuat_pada) WHERE dihapus_pada IS NULL;

COMMENT ON TABLE berkas IS
  'Berkas tidak pernah dilayani lewat tautan. Server memeriksa izin, membaca dari cakram, lalu mengirim isinya.';

CREATE TABLE dokumen (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id    uuid NOT NULL REFERENCES pegawai(id),
  jenis         text NOT NULL CHECK (jenis IN
                  ('KTP','KK','NPWP','Ijazah','BukuTabungan','SK','Lainnya')),
  berkas_id     uuid NOT NULL REFERENCES berkas(id),
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);
CREATE INDEX dokumen_pegawai_idx ON dokumen (pegawai_id) WHERE aktif;

CREATE TABLE sertifikasi (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  nama              text NOT NULL,
  lembaga           text,
  no_sertifikat     text,
  tgl_terbit        date,
  berlaku_sampai    date,
  berkas_id         uuid REFERENCES berkas(id),
  aktif             boolean NOT NULL DEFAULT true,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz,
  diubah_oleh       uuid REFERENCES pegawai(id)
);
-- EMP-16: pengingat 60 hari sebelum kedaluwarsa dibaca dari indeks ini.
CREATE INDEX sertifikasi_kedaluwarsa_idx ON sertifikasi (berlaku_sampai)
  WHERE aktif AND berlaku_sampai IS NOT NULL;

-- =============================================================================
-- C. PENGATURAN DAN MASTER
-- =============================================================================

CREATE TABLE titik_kantor (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama          text NOT NULL,
  alamat        text,
  lat           numeric(9,6)  NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           numeric(10,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m      integer NOT NULL CHECK (radius_m IN (50,100,200,300)),
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);

CREATE TABLE jabatan (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama                text NOT NULL,
  posisi_struktural   text NOT NULL CHECK (posisi_struktural IN
                        ('Staff','Manager','Direksi','Dirut','Dewas')),
  kelompok_jabatan    text,
  cara_bayar_lembur   text NOT NULL DEFAULT 'upah_per_jam'
                        CHECK (cara_bayar_lembur IN ('upah_per_jam','lumpsum','tidak_ada')),
  aktif               boolean NOT NULL DEFAULT true,
  dibuat_pada         timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh         uuid REFERENCES pegawai(id),
  diubah_pada         timestamptz,
  diubah_oleh         uuid REFERENCES pegawai(id)
);

CREATE TABLE unit (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode                    text NOT NULL,
  nama                    text NOT NULL,
  direktur_pembina_id     uuid,            -- kunci asing ditambahkan di bawah
  aktif                   boolean NOT NULL DEFAULT true,
  dibuat_pada             timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh             uuid REFERENCES pegawai(id),
  diubah_pada             timestamptz,
  diubah_oleh             uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX unit_kode_unik ON unit (kode);

-- Lingkaran kunci asing pegawai ↔ unit ditutup di sini.
ALTER TABLE pegawai
  ADD CONSTRAINT pegawai_unit_fk         FOREIGN KEY (unit_id)         REFERENCES unit(id),
  ADD CONSTRAINT pegawai_jabatan_fk      FOREIGN KEY (jabatan_id)      REFERENCES jabatan(id),
  ADD CONSTRAINT pegawai_titik_kantor_fk FOREIGN KEY (titik_kantor_id) REFERENCES titik_kantor(id),
  ADD CONSTRAINT pegawai_foto_fk         FOREIGN KEY (foto_file_id)    REFERENCES berkas(id);

ALTER TABLE unit
  ADD CONSTRAINT unit_direktur_pembina_fk FOREIGN KEY (direktur_pembina_id) REFERENCES pegawai(id);

CREATE TABLE tabel_grade (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade                 text NOT NULL,
  sub_grade             text NOT NULL,
  nama_jabatan          text,
  pendidikan_min        text,
  masa_kerja_min_thn    numeric(4,1),
  masa_kerja_max_thn    numeric(4,1),
  tunjangan_jabatan     rupiah,
  gapok_min             rupiah,
  gapok_med             rupiah,
  gapok_max             rupiah,
  berlaku_mulai         date NOT NULL,
  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh           uuid REFERENCES pegawai(id),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id),
  -- EMP-08: rentang gapok harus masuk akal sebelum dipakai memperingatkan HRD.
  CONSTRAINT tabel_grade_rentang CHECK (
    gapok_min IS NULL OR gapok_max IS NULL OR gapok_min <= gapok_max)
);
CREATE UNIQUE INDEX tabel_grade_unik ON tabel_grade (grade, sub_grade, berlaku_mulai);

-- PAY-34: katalog komponen payroll. Katalog awal di design_final.md §8.13.
CREATE TABLE komponen_gaji (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE inline, bukan hanya indeks: tarif_komponen dan komponen_pegawai
  -- memakai `kode` sebagai sasaran kunci asing.
  kode          text NOT NULL UNIQUE,
  nama          text NOT NULL,
  tipe          text NOT NULL CHECK (tipe IN ('pendapatan','potongan','informasi')),
  kena_pajak    boolean NOT NULL DEFAULT true,
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);
CREATE TABLE tarif_komponen (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode                  text NOT NULL REFERENCES komponen_gaji(kode),
  grade_atau_kelompok   text NOT NULL,
  nominal               rupiah NOT NULL,
  satuan                text NOT NULL,       -- 'per hari hadir' | 'per bulan' | …
  berlaku_mulai         date NOT NULL,
  aktif                 boolean NOT NULL DEFAULT true,
  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh           uuid REFERENCES pegawai(id),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX tarif_komponen_unik ON tarif_komponen (kode, grade_atau_kelompok, berlaku_mulai);

CREATE TABLE komponen_pegawai (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  kode              text NOT NULL REFERENCES komponen_gaji(kode),
  aktif             boolean NOT NULL DEFAULT true,
  nominal_khusus    rupiah,
  alasan            text NOT NULL,           -- PAY-34: alasan wajib
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz,
  diubah_oleh       uuid REFERENCES pegawai(id),
  CONSTRAINT komponen_pegawai_alasan_terisi CHECK (btrim(alasan) <> '')
);
CREATE UNIQUE INDEX komponen_pegawai_unik ON komponen_pegawai (pegawai_id, kode);

-- Tidak bisa disunting lewat layar (design_final.md §4.3). Diisi lewat migrasi
-- atau psql oleh Super Admin, dengan kolom `sumber` menyebut dasar hukumnya.
-- KOSONG SAAT PEMASANGAN: batas upah JP dan kelas JKK 2026 belum tersedia.
CREATE TABLE tarif_statutori (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode              text NOT NULL CHECK (kode IN ('bpjs_kes','jht','jp','jkk','jkm','ump')),
  pihak             text NOT NULL CHECK (pihak IN ('pegawai','perusahaan','-')),
  persen            numeric(6,4),
  batas_upah        rupiah,
  nominal           rupiah,
  berlaku_mulai     date NOT NULL,
  berlaku_sampai    date,
  sumber            text NOT NULL,
  CONSTRAINT tarif_statutori_sumber_terisi CHECK (btrim(sumber) <> ''),
  CONSTRAINT tarif_statutori_urut CHECK (berlaku_sampai IS NULL OR berlaku_sampai >= berlaku_mulai)
);
CREATE INDEX tarif_statutori_cari_idx ON tarif_statutori (kode, pihak, berlaku_mulai DESC);

-- KOSONG SAAT PEMASANGAN: menunggu fixture hitungan manual Keuangan.
CREATE TABLE tarif_pajak (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis               text NOT NULL CHECK (jenis IN ('ter_a','ter_b','ter_c','pasal17','ptkp')),
  batas_bawah         rupiah,
  batas_atas          rupiah,
  tarif_atau_nilai    numeric(12,4) NOT NULL,
  kode_ptkp           text,
  berlaku_mulai       date NOT NULL,
  berlaku_sampai      date,
  sumber              text NOT NULL,
  CONSTRAINT tarif_pajak_sumber_terisi CHECK (btrim(sumber) <> ''),
  CONSTRAINT tarif_pajak_urut CHECK (batas_atas IS NULL OR batas_bawah IS NULL OR batas_atas >= batas_bawah)
);
CREATE INDEX tarif_pajak_cari_idx ON tarif_pajak (jenis, berlaku_mulai DESC);

-- KOSONG SAAT PEMASANGAN: menunggu Peraturan Perusahaan.
CREATE TABLE jenis_cuti (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama                      text NOT NULL,
  jatah_per_tahun           smallint,
  potong_saldo              boolean NOT NULL DEFAULT true,
  wajib_lampiran            boolean NOT NULL DEFAULT false,
  syarat_masa_kerja_bulan   smallint NOT NULL DEFAULT 0,
  bisa_dibawa               boolean NOT NULL DEFAULT false,
  maks_dibawa               smallint,
  aktif                     boolean NOT NULL DEFAULT true,
  dibuat_pada               timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh               uuid REFERENCES pegawai(id),
  diubah_pada               timestamptz,
  diubah_oleh               uuid REFERENCES pegawai(id)
);

CREATE TABLE kategori_reimburse (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama          text NOT NULL,
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);

-- KOSONG SAAT PEMASANGAN: menunggu Peraturan Perusahaan.
CREATE TABLE aturan_reimburse (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kategori_id           uuid NOT NULL REFERENCES kategori_reimburse(id),
  kelompok              text NOT NULL CHECK (kelompok IN ('Pegawai','Direksi','Dewas')),
  min_masa_kerja_bulan  smallint NOT NULL DEFAULT 0,
  plafon                rupiah,
  periode_bulan         smallint,
  persen_ganti          numeric(5,2) CHECK (persen_ganti IS NULL OR persen_ganti BETWEEN 0 AND 100),
  kena_pajak            boolean NOT NULL DEFAULT false,
  aktif                 boolean NOT NULL DEFAULT true,
  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh           uuid REFERENCES pegawai(id),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id)
);
CREATE INDEX aturan_reimburse_cari_idx ON aturan_reimburse (kategori_id, kelompok) WHERE aktif;

CREATE TABLE kategori_diklat (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama          text NOT NULL,
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id)
);

CREATE TABLE hari_libur (
  tanggal       date PRIMARY KEY,
  keterangan    text NOT NULL,
  sumber        text NOT NULL CHECK (sumber IN ('nasional','ditetapkan_hr')),
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);

CREATE TABLE jam_kerja (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jam_masuk           time NOT NULL,
  jam_pulang          time NOT NULL,
  toleransi_menit     smallint NOT NULL DEFAULT 0 CHECK (toleransi_menit >= 0),
  hari_kerja          smallint[] NOT NULL,       -- ISO: 1=Senin … 7=Minggu
  batas_susulan_hari  smallint NOT NULL DEFAULT 7,
  berlaku_mulai       date NOT NULL,
  dibuat_pada         timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh         uuid REFERENCES pegawai(id),
  diubah_pada         timestamptz,
  diubah_oleh         uuid REFERENCES pegawai(id),
  CONSTRAINT jam_kerja_hari_sah CHECK (
    hari_kerja <@ ARRAY[1,2,3,4,5,6,7]::smallint[] AND array_length(hari_kerja,1) >= 1)
);
CREATE UNIQUE INDEX jam_kerja_berlaku_unik ON jam_kerja (berlaku_mulai);

CREATE TABLE kebijakan_approval (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis             text NOT NULL,
  syarat_min_hari   smallint NOT NULL DEFAULT 0,
  langkah           text[] NOT NULL,             -- mis. ARRAY['ATASAN','DIREKSI']
  aktif             boolean NOT NULL DEFAULT true,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz,
  diubah_oleh       uuid REFERENCES pegawai(id),
  CONSTRAINT kebijakan_approval_langkah_ada CHECK (array_length(langkah,1) >= 1)
);

CREATE TABLE pengaturan (
  kunci         text PRIMARY KEY,
  nilai         text NOT NULL,
  keterangan    text,
  diubah_pada   timestamptz NOT NULL DEFAULT now(),
  diubah_oleh   uuid REFERENCES pegawai(id)
);

-- KOSONG DI AWAL menurut design_final.md §4.3.
CREATE TABLE tarif_dinas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  komponen              text NOT NULL CHECK (komponen IN ('uang_harian','transport','penginapan')),
  grade_atau_jabatan    text NOT NULL,
  zona_kota             text,
  nominal               rupiah NOT NULL,
  satuan                text NOT NULL CHECK (satuan IN ('per hari','per perjalanan','per malam')),
  berlaku_mulai         date NOT NULL,
  berlaku_sampai        date,
  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh           uuid REFERENCES pegawai(id),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id)
);

CREATE TABLE anggaran_diklat (
  tahun             smallint PRIMARY KEY,
  nominal           rupiah NOT NULL,
  ditetapkan_oleh   uuid REFERENCES pegawai(id),
  ditetapkan_pada   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE anggaran (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun         smallint NOT NULL,
  kategori      text NOT NULL,
  unit_id       uuid REFERENCES unit(id),
  pagu          rupiah NOT NULL,
  keterangan    text,
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX anggaran_unik ON anggaran (tahun, kategori, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE serapan_anggaran (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anggaran_id   uuid NOT NULL REFERENCES anggaran(id),
  bulan         smallint NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  nominal       rupiah NOT NULL,
  sumber        text NOT NULL CHECK (sumber IN ('otomatis','contoh','koreksi')),
  diubah_oleh   uuid REFERENCES pegawai(id),
  waktu         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX serapan_anggaran_unik ON serapan_anggaran (anggaran_id, bulan, sumber);

-- =============================================================================
-- D. GAJI BERVERSI
-- EMP-07: menambah nominal baru MENUTUP versi lama dan MEMBUKA versi baru.
-- Tidak ada fungsi yang mengubah nominal lama.
--
-- Di Sheets, dua baris gaji dengan periode tumpang tindih bisa masuk tanpa
-- ada yang tahu, dan slip gaji jadi bergantung pada baris mana yang terbaca
-- lebih dulu. Di sini basis data menolaknya.
-- =============================================================================

CREATE TABLE gaji (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  komponen_id       uuid NOT NULL REFERENCES komponen_gaji(id),
  nominal           rupiah NOT NULL,
  berlaku_mulai     date NOT NULL,
  berlaku_sampai    date,
  no_sk             text,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz,
  diubah_oleh       uuid REFERENCES pegawai(id),

  CONSTRAINT gaji_urut CHECK (berlaku_sampai IS NULL OR berlaku_sampai >= berlaku_mulai),

  -- Satu pegawai, satu komponen, tidak boleh dua nominal berlaku bersamaan.
  CONSTRAINT gaji_tanpa_tumpang_tindih EXCLUDE USING gist (
    pegawai_id  WITH =,
    komponen_id WITH =,
    daterange(berlaku_mulai, berlaku_sampai, '[]') WITH &&
  )
);
CREATE INDEX gaji_berlaku_idx ON gaji (pegawai_id, komponen_id, berlaku_mulai DESC);

-- =============================================================================
-- E. AKUN DAN SESI
-- =============================================================================

CREATE TABLE pengguna (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id          uuid NOT NULL REFERENCES pegawai(id),
  hash_sandi          text NOT NULL,          -- argon2id, lengkap dengan parameternya
  wajib_ganti_sandi   boolean NOT NULL DEFAULT true,
  gagal_login         smallint NOT NULL DEFAULT 0 CHECK (gagal_login >= 0),
  terkunci_sampai     timestamptz,
  aktif               boolean NOT NULL DEFAULT true,
  login_terakhir      timestamptz,
  dibuat_pada         timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh         uuid REFERENCES pegawai(id),
  diubah_pada         timestamptz,
  diubah_oleh         uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX pengguna_pegawai_unik ON pengguna (pegawai_id);

COMMENT ON COLUMN pengguna.hash_sandi IS
  'argon2id. Kolom `salt` tidak ada lagi: argon2 menyimpan salt di dalam hash-nya sendiri.';

CREATE TABLE peran_admin (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  peran             text NOT NULL CHECK (peran IN
                      ('admin_hrd','admin_payroll','admin_finance','auditor','super_admin')),
  aktif             boolean NOT NULL DEFAULT true,
  diberikan_oleh    uuid REFERENCES pegawai(id),
  diberikan_pada    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX peran_admin_unik ON peran_admin (pegawai_id, peran);
CREATE INDEX peran_admin_cari_idx ON peran_admin (peran) WHERE aktif;

CREATE TABLE sesi (
  hash_token      bytea PRIMARY KEY CHECK (octet_length(hash_token) = 32),
  pengguna_id     uuid NOT NULL REFERENCES pengguna(id),
  dibuat          timestamptz NOT NULL DEFAULT now(),
  terakhir_aktif  timestamptz NOT NULL DEFAULT now(),
  kedaluwarsa     timestamptz NOT NULL,
  ingat           boolean NOT NULL DEFAULT false,
  perangkat       text,
  dicabut         timestamptz
);
CREATE INDEX sesi_pengguna_idx    ON sesi (pengguna_id) WHERE dicabut IS NULL;
CREATE INDEX sesi_kedaluwarsa_idx ON sesi (kedaluwarsa);

COMMENT ON TABLE sesi IS
  'Token mentah tidak pernah disimpan, hanya SHA-256-nya. Dikirim ke browser sebagai cookie HttpOnly, bukan localStorage.';

-- =============================================================================
-- F. PENGAJUAN DAN APPROVAL
-- =============================================================================

CREATE TABLE pengajuan (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor             text NOT NULL,
  jenis             text NOT NULL CHECK (jenis IN
                      ('cuti','lembur','dinas','susulan','tinjauan_radius','perubahan_profil',
                       'reimburse','komponen_peristiwa')),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  status            text NOT NULL DEFAULT 'menunggu'
                      CHECK (status IN ('menunggu','disetujui','ditolak','dibatalkan')),
  ringkasan         text,
  -- Jalur disalin saat diajukan dan tidak berubah sesudahnya.
  jalur_snapshot    text[] NOT NULL,
  diajukan_pada     timestamptz NOT NULL DEFAULT now(),
  selesai_pada      timestamptz,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz,
  diubah_oleh       uuid REFERENCES pegawai(id),
  CONSTRAINT pengajuan_jalur_ada CHECK (array_length(jalur_snapshot,1) >= 1),
  CONSTRAINT pengajuan_selesai_konsisten CHECK (
    (status = 'menunggu' AND selesai_pada IS NULL) OR
    (status <> 'menunggu' AND selesai_pada IS NOT NULL))
);
CREATE UNIQUE INDEX pengajuan_nomor_unik ON pengajuan (nomor);
CREATE INDEX pengajuan_pegawai_idx ON pengajuan (pegawai_id, diajukan_pada DESC);
CREATE INDEX pengajuan_menunggu_idx ON pengajuan (jenis, diajukan_pada) WHERE status = 'menunggu';

CREATE TABLE langkah_approval (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengajuan_id      uuid NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  urutan            smallint NOT NULL CHECK (urutan >= 1),
  peran_langkah     text NOT NULL,
  penyetuju_id      uuid REFERENCES pegawai(id),
  status            text NOT NULL DEFAULT 'menunggu'
                      CHECK (status IN ('menunggu','disetujui','ditolak','dilewati')),
  alasan            text,
  dialihkan_dari    uuid REFERENCES pegawai(id),
  waktu             timestamptz,
  -- Penolakan tanpa alasan tidak bisa ditindaklanjuti pengaju.
  CONSTRAINT langkah_tolak_wajib_alasan CHECK (
    status <> 'ditolak' OR (alasan IS NOT NULL AND btrim(alasan) <> ''))
);
CREATE UNIQUE INDEX langkah_approval_unik ON langkah_approval (pengajuan_id, urutan);
CREATE INDEX langkah_approval_antrean_idx ON langkah_approval (penyetuju_id) WHERE status = 'menunggu';

CREATE TABLE detail_cuti (
  pengajuan_id    uuid PRIMARY KEY REFERENCES pengajuan(id) ON DELETE CASCADE,
  jenis_cuti_id   uuid NOT NULL REFERENCES jenis_cuti(id),
  tgl_mulai       date NOT NULL,
  tgl_selesai     date NOT NULL,
  jumlah_hari     numeric(5,1) NOT NULL CHECK (jumlah_hari > 0),
  alasan          text,
  CONSTRAINT detail_cuti_urut CHECK (tgl_selesai >= tgl_mulai)
);

CREATE TABLE detail_lembur (
  pengajuan_id    uuid NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  tanggal         date NOT NULL,
  jenis_hari      text NOT NULL CHECK (jenis_hari IN ('kerja','libur')),
  jam_mulai       time NOT NULL,
  jam_selesai     time NOT NULL,
  uraian          text,
  menit_diajukan  integer NOT NULL CHECK (menit_diajukan > 0),
  menit_diakui    integer CHECK (menit_diakui IS NULL OR menit_diakui >= 0),
  PRIMARY KEY (pengajuan_id, tanggal)
);

CREATE TABLE detail_dinas (
  pengajuan_id    uuid PRIMARY KEY REFERENCES pengajuan(id) ON DELETE CASCADE,
  tgl_berangkat   date NOT NULL,
  tgl_kembali     date NOT NULL,
  kota            text NOT NULL,
  keperluan       text,
  moda            text,
  sumber          text NOT NULL CHECK (sumber IN ('ditetapkan_hr','pengajuan')),
  aktif           boolean NOT NULL DEFAULT true,
  CONSTRAINT detail_dinas_urut CHECK (tgl_kembali >= tgl_berangkat)
);

CREATE TABLE detail_susulan (
  pengajuan_id  uuid NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  tanggal       date NOT NULL,
  jam_masuk     time,
  jam_pulang    time,
  alasan        text NOT NULL,
  PRIMARY KEY (pengajuan_id, tanggal),
  CONSTRAINT detail_susulan_alasan_terisi CHECK (btrim(alasan) <> '')
);

CREATE TABLE detail_perubahan_profil (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengajuan_id  uuid NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  tabel         text NOT NULL,
  baris_id      uuid,
  nilai_lama    jsonb,
  nilai_baru    jsonb NOT NULL
);
-- PRIMARY KEY tidak boleh memuat ekspresi, jadi keunikannya ditegakkan lewat
-- indeks. Dua baris untuk kolom yang sama pada satu pengajuan tidak masuk akal.
CREATE UNIQUE INDEX detail_perubahan_profil_unik ON detail_perubahan_profil
  (pengajuan_id, tabel, coalesce(baris_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE detail_reimburse (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengajuan_id          uuid NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  kategori_id           uuid NOT NULL REFERENCES kategori_reimburse(id),
  deskripsi             text NOT NULL,
  nominal_diajukan      rupiah NOT NULL CHECK (nominal_diajukan > 0),
  nominal_disetujui     rupiah CHECK (nominal_disetujui IS NULL OR nominal_disetujui >= 0),
  tgl_nota              date NOT NULL,
  status_bayar          text NOT NULL DEFAULT 'menunggu_pembayaran'
                          CHECK (status_bayar IN ('menunggu_pembayaran','dibayar')),
  slip_id               uuid        -- kunci asing ditambahkan setelah payroll_slip ada
);
CREATE INDEX detail_reimburse_belum_bayar_idx ON detail_reimburse (kategori_id)
  WHERE status_bayar = 'menunggu_pembayaran';

CREATE TABLE lampiran (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengajuan_id    uuid NOT NULL REFERENCES pengajuan(id) ON DELETE CASCADE,
  berkas_id       uuid NOT NULL REFERENCES berkas(id)
);
CREATE INDEX lampiran_pengajuan_idx ON lampiran (pengajuan_id);

CREATE TABLE saldo_cuti_awal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id      uuid NOT NULL REFERENCES pegawai(id),
  jenis_cuti_id   uuid NOT NULL REFERENCES jenis_cuti(id),
  tahun           smallint NOT NULL,
  hari_terpakai   numeric(5,1) NOT NULL DEFAULT 0,
  keterangan      text
);
CREATE UNIQUE INDEX saldo_cuti_awal_unik ON saldo_cuti_awal (pegawai_id, jenis_cuti_id, tahun);

CREATE TABLE klaim_reimburse_awal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id    uuid NOT NULL REFERENCES pegawai(id),
  kategori_id   uuid NOT NULL REFERENCES kategori_reimburse(id),
  tgl_klaim     date NOT NULL,
  nominal       rupiah NOT NULL,
  keterangan    text
);
CREATE INDEX klaim_reimburse_awal_idx ON klaim_reimburse_awal (pegawai_id, kategori_id, tgl_klaim);

-- =============================================================================
-- G. PRESENSI
-- =============================================================================

CREATE TABLE presensi (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id            uuid NOT NULL REFERENCES pegawai(id),
  tanggal               date NOT NULL,

  masuk_pada            timestamptz,
  masuk_lat             numeric(9,6),
  masuk_lng             numeric(10,6),
  masuk_akurasi         numeric(7,2),
  foto_file_id          uuid REFERENCES berkas(id),
  foto_dihapus_pada     timestamptz,

  pulang_pada           timestamptz,
  pulang_lat            numeric(9,6),
  pulang_lng            numeric(10,6),

  titik_kantor_id       uuid REFERENCES titik_kantor(id),
  jarak_m               numeric(10,2),

  -- Potret aturan saat kejadian. Mengubah radius atau jam kerja hari ini
  -- tidak boleh mengubah penilaian presensi bulan lalu.
  radius_saat_itu       integer,
  dalam_radius          boolean,
  bypass_saat_itu       boolean,
  jam_masuk_saat_itu    time,
  jam_pulang_saat_itu   time,
  toleransi_saat_itu    smallint,

  menit_terlambat       integer NOT NULL DEFAULT 0 CHECK (menit_terlambat >= 0),
  menit_pulang_cepat    integer NOT NULL DEFAULT 0 CHECK (menit_pulang_cepat >= 0),

  sumber                text NOT NULL CHECK (sumber IN
                          ('check_in','dinas_luar','susulan','tinjauan_radius','koreksi_hr')),
  pengajuan_id          uuid REFERENCES pengajuan(id),
  alasan_koreksi        text,

  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh           uuid REFERENCES pegawai(id),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id),

  -- Koreksi HRD tanpa justifikasi tertulis tidak boleh masuk.
  CONSTRAINT presensi_koreksi_wajib_alasan CHECK (
    sumber <> 'koreksi_hr' OR (alasan_koreksi IS NOT NULL AND btrim(alasan_koreksi) <> '')),
  CONSTRAINT presensi_pulang_setelah_masuk CHECK (
    masuk_pada IS NULL OR pulang_pada IS NULL OR pulang_pada >= masuk_pada)
);

-- Satu baris presensi per orang per hari. Di Sheets ini hanya harapan.
CREATE UNIQUE INDEX presensi_orang_hari_unik ON presensi (pegawai_id, tanggal);
CREATE INDEX presensi_tanggal_idx ON presensi (tanggal);
CREATE INDEX presensi_foto_retensi_idx ON presensi (tanggal)
  WHERE foto_file_id IS NOT NULL AND foto_dihapus_pada IS NULL;

CREATE TABLE percobaan_check_in (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  waktu             timestamptz NOT NULL DEFAULT now(),
  lat               numeric(9,6)  NOT NULL,
  lng               numeric(10,6) NOT NULL,
  akurasi           numeric(7,2),
  titik_kantor_id   uuid REFERENCES titik_kantor(id),
  jarak_m           numeric(10,2),
  radius            integer,
  foto_file_id      uuid REFERENCES berkas(id),
  status            text NOT NULL CHECK (status IN ('ditolak','diajukan','disetujui','ditolak_hr')),
  pengajuan_id      uuid REFERENCES pengajuan(id)
);
CREATE INDEX percobaan_check_in_pegawai_idx ON percobaan_check_in (pegawai_id, waktu DESC);

CREATE TABLE rekap_kehadiran (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periode               periode_bulan NOT NULL,
  pegawai_id            uuid NOT NULL REFERENCES pegawai(id),
  hari_kerja            smallint NOT NULL DEFAULT 0,
  hadir                 smallint NOT NULL DEFAULT 0,
  dinas                 smallint NOT NULL DEFAULT 0,
  cuti                  smallint NOT NULL DEFAULT 0,
  bebas_tugas           smallint NOT NULL DEFAULT 0,
  mangkir               smallint NOT NULL DEFAULT 0,
  menit_terlambat       integer  NOT NULL DEFAULT 0,
  menit_pulang_cepat    integer  NOT NULL DEFAULT 0,
  tanpa_checkout        smallint NOT NULL DEFAULT 0,
  susulan               smallint NOT NULL DEFAULT 0,
  koreksi               smallint NOT NULL DEFAULT 0,
  potongan_rp           rupiah   NOT NULL DEFAULT 0,
  jam_lembur_diakui     numeric(7,2) NOT NULL DEFAULT 0,
  lembur_rp             rupiah   NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','disahkan')),
  disahkan_oleh         uuid REFERENCES pegawai(id),
  disahkan_pada         timestamptz,
  CONSTRAINT rekap_disahkan_konsisten CHECK (
    (status = 'draf' AND disahkan_pada IS NULL) OR
    (status = 'disahkan' AND disahkan_pada IS NOT NULL AND disahkan_oleh IS NOT NULL))
);
CREATE UNIQUE INDEX rekap_kehadiran_unik ON rekap_kehadiran (periode, pegawai_id);

-- =============================================================================
-- H. PAYROLL
-- Di sini aturan pemisahan tugas berhenti menjadi prosa dan menjadi constraint.
-- =============================================================================

CREATE TABLE payroll_run (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor                 text NOT NULL,
  jenis                 text NOT NULL CHECK (jenis IN
                          ('bulanan','thr','insentif_tw','insentif_tahunan','bonus','penyesuaian')),
  periode               periode_bulan NOT NULL,
  tgl_acuan             date,
  tgl_bayar_rencana     date,
  tgl_bayar             date,
  tahap                 smallint NOT NULL DEFAULT 1 CHECK (tahap BETWEEN 1 AND 6),
  status                text NOT NULL DEFAULT 'draf' CHECK (status IN
                          ('draf','dihitung','menunggu_verifikasi','final','dikembalikan')),
  run_asal_id           uuid REFERENCES payroll_run(id),
  total_bruto           rupiah NOT NULL DEFAULT 0,
  total_potongan        rupiah NOT NULL DEFAULT 0,
  total_neto            rupiah NOT NULL DEFAULT 0,
  dihitung_pada         timestamptz,
  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh           uuid REFERENCES pegawai(id),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id),
  -- PAY-08: run penyesuaian wajib menyebut run asalnya.
  CONSTRAINT payroll_penyesuaian_perlu_asal CHECK (
    jenis <> 'penyesuaian' OR run_asal_id IS NOT NULL)
);
CREATE UNIQUE INDEX payroll_run_nomor_unik ON payroll_run (nomor);

-- PAY-02: hanya boleh ada satu run `bulanan` per periode.
CREATE UNIQUE INDEX payroll_run_bulanan_unik ON payroll_run (periode) WHERE jenis = 'bulanan';

CREATE TABLE payroll_tahap (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES payroll_run(id),
  tahap         smallint NOT NULL CHECK (tahap BETWEEN 1 AND 6),
  pelaku_id     uuid NOT NULL REFERENCES pegawai(id),
  aksi          text NOT NULL CHECK (aksi IN ('setuju','kembalikan','hitung','terbitkan')),
  alasan        text,
  waktu         timestamptz NOT NULL DEFAULT now(),
  -- PAY-06: mengembalikan run wajib beralasan.
  CONSTRAINT payroll_tahap_kembalikan_wajib_alasan CHECK (
    aksi <> 'kembalikan' OR (alasan IS NOT NULL AND btrim(alasan) <> ''))
);

-- PAY-06a: satu orang tidak boleh menyetujui dua tahap pada run yang sama.
-- Manager Keuangan yang juga Admin Finance tertolak di sini, bukan di layar.
CREATE UNIQUE INDEX payroll_tahap_satu_orang_satu_tahap
  ON payroll_tahap (run_id, pelaku_id) WHERE aksi = 'setuju';

CREATE INDEX payroll_tahap_run_idx ON payroll_tahap (run_id, waktu);

CREATE TABLE payroll_slip (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                    uuid NOT NULL REFERENCES payroll_run(id),
  pegawai_id                uuid NOT NULL REFERENCES pegawai(id),

  -- PAY-07 / PAY-09: potret. Tidak pernah dibaca ulang dari master pegawai,
  -- supaya slip Januari tetap identik setelah gaji naik pada Maret.
  snap_nama                 text NOT NULL,
  snap_npp                  text NOT NULL,
  snap_nik                  text,
  snap_jabatan              text,
  snap_unit                 text,
  snap_jenis_kepegawaian    text NOT NULL,
  snap_ptkp                 text,
  snap_bank                 text,
  snap_rekening             text,
  snap_atas_nama            text,
  snap_penerima             text NOT NULL DEFAULT 'pegawai'
                              CHECK (snap_penerima IN ('pegawai','ahli_waris')),
  snap_gapok                rupiah NOT NULL DEFAULT 0,
  snap_tunjangan_jabatan    rupiah NOT NULL DEFAULT 0,
  snap_faktor_status        numeric(5,4) NOT NULL DEFAULT 1,

  total_pendapatan          rupiah NOT NULL DEFAULT 0,
  total_potongan            rupiah NOT NULL DEFAULT 0,
  neto                      rupiah NOT NULL DEFAULT 0,
  pph21_ditanggung          rupiah NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX payroll_slip_unik ON payroll_slip (run_id, pegawai_id);
-- PAY-10: pegawai membuka 12 periode ke belakang.
CREATE INDEX payroll_slip_pegawai_idx ON payroll_slip (pegawai_id);

ALTER TABLE detail_reimburse
  ADD CONSTRAINT detail_reimburse_slip_fk FOREIGN KEY (slip_id) REFERENCES payroll_slip(id);

CREATE TABLE payroll_baris (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id           uuid NOT NULL REFERENCES payroll_slip(id) ON DELETE CASCADE,
  urutan            smallint NOT NULL,
  kode_komponen     text NOT NULL,
  nama_snapshot     text NOT NULL,
  tipe              text NOT NULL CHECK (tipe IN ('pendapatan','potongan','informasi')),
  nominal           rupiah NOT NULL,
  sumber            text NOT NULL CHECK (sumber IN
                      ('gaji','lembur','presensi','reimburse','bpjs','dplk','pph','insentif','thr','penyesuaian')),
  -- Mis. '30 menit × Rp89,31 → dibulatkan'. Slip tanpa rincian tidak bisa dibantah.
  rincian           text
);
CREATE UNIQUE INDEX payroll_baris_unik ON payroll_baris (slip_id, urutan);

CREATE TABLE input_insentif (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES payroll_run(id),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  kode_komponen     text NOT NULL REFERENCES komponen_gaji(kode),
  nominal           rupiah NOT NULL,
  keterangan        text,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX input_insentif_unik ON input_insentif (run_id, pegawai_id, kode_komponen);

-- PAY-01a / PAY-01c: peserta run, beserta sebab pengecualiannya.
-- Orang yang dikecualikan tidak boleh hilang tanpa keterangan.
CREATE TABLE payroll_peserta (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES payroll_run(id),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  ikut              boolean NOT NULL,
  sumber_nilai      text NOT NULL CHECK (sumber_nilai IN ('master','diubah_di_run')),
  alasan_kecuali    text CHECK (alasan_kecuali IS NULL OR alasan_kecuali IN
                      ('toggle_mati','belum_masuk','sudah_berhenti','diubah_admin')),
  diubah_oleh       uuid REFERENCES pegawai(id),
  diubah_pada       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peserta_kecuali_perlu_alasan CHECK (ikut OR alasan_kecuali IS NOT NULL)
);
CREATE UNIQUE INDEX payroll_peserta_unik ON payroll_peserta (run_id, pegawai_id);

CREATE TABLE tagihan_vendor (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor                 text NOT NULL,
  vendor                text NOT NULL,
  periode               periode_bulan NOT NULL,
  jumlah_orang          smallint,
  nominal               rupiah NOT NULL,
  keterangan            text,
  invoice_file_id       uuid REFERENCES berkas(id),
  status                text NOT NULL DEFAULT 'menunggu'
                          CHECK (status IN ('menunggu','diverifikasi','dibayar','dikembalikan')),
  alasan                text,
  dicatat_oleh          uuid REFERENCES pegawai(id),
  diverifikasi_oleh     uuid REFERENCES pegawai(id),
  dibayar_pada          date,
  bukti_bayar_file_id   uuid REFERENCES berkas(id),
  dibuat_pada           timestamptz NOT NULL DEFAULT now(),
  diubah_pada           timestamptz,
  diubah_oleh           uuid REFERENCES pegawai(id),
  CONSTRAINT tagihan_vendor_kembali_wajib_alasan CHECK (
    status <> 'dikembalikan' OR (alasan IS NOT NULL AND btrim(alasan) <> '')),
  -- Pencatat dan pemverifikasi tidak boleh orang yang sama.
  CONSTRAINT tagihan_vendor_pemisahan_tugas CHECK (
    diverifikasi_oleh IS NULL OR diverifikasi_oleh <> dicatat_oleh)
);
CREATE UNIQUE INDEX tagihan_vendor_nomor_unik ON tagihan_vendor (nomor);

-- =============================================================================
-- I. BIAYA DIKLAT DAN PERJALANAN DINAS
-- =============================================================================

CREATE TABLE berkas_biaya (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor                     text NOT NULL,
  jenis                     text NOT NULL CHECK (jenis IN ('dinas','diklat')),
  sumber_id                 uuid,
  fase                      text NOT NULL CHECK (fase IN ('uang_muka','pertanggungjawaban')),
  berkas_uang_muka_id       uuid REFERENCES berkas_biaya(id),
  tahap                     smallint NOT NULL DEFAULT 1 CHECK (tahap BETWEEN 1 AND 5),
  status                    text NOT NULL DEFAULT 'draf' CHECK (status IN
                              ('draf','dihitung','menunggu_verifikasi','final','dikembalikan')),
  total                     rupiah NOT NULL DEFAULT 0,
  tgl_mulai_kegiatan        date,
  tgl_selesai_kegiatan      date,
  tenggat_pj                date,
  dibuat_pada               timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh               uuid REFERENCES pegawai(id),
  diubah_pada               timestamptz,
  diubah_oleh               uuid REFERENCES pegawai(id),
  CONSTRAINT berkas_biaya_pj_perlu_uang_muka CHECK (
    fase <> 'pertanggungjawaban' OR berkas_uang_muka_id IS NOT NULL)
);
CREATE UNIQUE INDEX berkas_biaya_nomor_unik ON berkas_biaya (nomor);
CREATE INDEX berkas_biaya_tenggat_idx ON berkas_biaya (tenggat_pj)
  WHERE status <> 'final' AND tenggat_pj IS NOT NULL;

CREATE TABLE biaya_rincian (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  berkas_id             uuid NOT NULL REFERENCES berkas_biaya(id) ON DELETE CASCADE,
  pegawai_id            uuid NOT NULL REFERENCES pegawai(id),
  komponen              text NOT NULL CHECK (komponen IN
                          ('uang_harian','transport','penginapan','biaya_diklat','lainnya')),
  jumlah                numeric(7,2) NOT NULL DEFAULT 1,
  tarif                 rupiah,
  nominal               rupiah NOT NULL,
  keterangan            text,
  bukti_file_id         uuid REFERENCES berkas(id),
  dibayar_pada          date,
  bukti_bayar_file_id   uuid REFERENCES berkas(id)
);
CREATE INDEX biaya_rincian_berkas_idx ON biaya_rincian (berkas_id);

CREATE TABLE biaya_tahap (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  berkas_id     uuid NOT NULL REFERENCES berkas_biaya(id),
  tahap         smallint NOT NULL CHECK (tahap BETWEEN 1 AND 5),
  pelaku_id     uuid NOT NULL REFERENCES pegawai(id),
  aksi          text NOT NULL CHECK (aksi IN ('setuju','kembalikan','hitung','terbitkan')),
  alasan        text,
  waktu         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biaya_tahap_kembalikan_wajib_alasan CHECK (
    aksi <> 'kembalikan' OR (alasan IS NOT NULL AND btrim(alasan) <> ''))
);
-- Pemisahan tugas yang sama seperti payroll.
CREATE UNIQUE INDEX biaya_tahap_satu_orang_satu_tahap
  ON biaya_tahap (berkas_id, pelaku_id) WHERE aksi = 'setuju';

CREATE TABLE pengembalian_uang_muka (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  berkas_id         uuid NOT NULL REFERENCES berkas_biaya(id),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  nominal           rupiah NOT NULL CHECK (nominal > 0),
  cara              text NOT NULL CHECK (cara IN ('transfer_balik','potong_gaji')),
  bukti_file_id     uuid REFERENCES berkas(id),
  status            text NOT NULL DEFAULT 'menunggu'
                      CHECK (status IN ('menunggu','dikonfirmasi','dipotong')),
  dikonfirmasi_oleh uuid REFERENCES pegawai(id),
  slip_id           uuid REFERENCES payroll_slip(id)
);

-- =============================================================================
-- J. KINERJA JMPD
-- =============================================================================

CREATE TABLE workblock (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor                     text NOT NULL,        -- 'WB-12', 'WB-12.1', 'WB-12.1.1'
  asal                      text NOT NULL CHECK (asal IN ('buat_sendiri','turunan')),
  induk_workblock_id        uuid REFERENCES workblock(id),
  penugasan_id              uuid,                 -- kunci asing ditambahkan di bawah
  pemilik_id                uuid NOT NULL REFERENCES pegawai(id),
  assigned_from_id          uuid REFERENCES pegawai(id),
  penyetuju_id              uuid REFERENCES pegawai(id),
  project_owner             text,
  initiative                text NOT NULL,
  begin_date                date,
  completion_date           date,
  goal                      text,
  key_activities            text,
  dependencies_internal     text,
  dependencies_external     text,
  stakeholders              text,
  budget                    rupiah,
  deliverables              text,
  show_milestones           boolean NOT NULL DEFAULT false,
  bobot                     persen NOT NULL DEFAULT 100,
  status                    text NOT NULL DEFAULT 'Draft' CHECK (status IN
                              ('Draft','Waiting for Approval','Approved','On Progress','Finished','Completed')),
  progress                  persen NOT NULL DEFAULT 0,
  dibuat_pada               timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh               uuid REFERENCES pegawai(id),
  diubah_pada               timestamptz,
  diubah_oleh               uuid REFERENCES pegawai(id),
  CONSTRAINT workblock_turunan_perlu_induk CHECK (
    asal <> 'turunan' OR induk_workblock_id IS NOT NULL),
  CONSTRAINT workblock_tanggal_urut CHECK (
    completion_date IS NULL OR begin_date IS NULL OR completion_date >= begin_date)
);
CREATE UNIQUE INDEX workblock_nomor_unik ON workblock (nomor);
CREATE INDEX workblock_pemilik_idx ON workblock (pemilik_id, status);

CREATE TABLE milestone (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workblock_id    uuid NOT NULL REFERENCES workblock(id) ON DELETE CASCADE,
  urutan          smallint NOT NULL,
  nama            text NOT NULL,
  bobot           persen NOT NULL,
  target          text,
  progress        persen NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX milestone_unik ON milestone (workblock_id, urutan);

CREATE TABLE penugasan (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id            uuid NOT NULL REFERENCES milestone(id) ON DELETE CASCADE,
  pegawai_id              uuid NOT NULL REFERENCES pegawai(id),
  sub_bobot               persen NOT NULL,
  workblock_turunan_id    uuid REFERENCES workblock(id),
  progress                persen NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX penugasan_unik ON penugasan (milestone_id, pegawai_id);

ALTER TABLE workblock
  ADD CONSTRAINT workblock_penugasan_fk FOREIGN KEY (penugasan_id) REFERENCES penugasan(id);

CREATE TABLE on_going_report (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workblock_id    uuid NOT NULL REFERENCES workblock(id) ON DELETE CASCADE,
  milestone_id    uuid REFERENCES milestone(id),
  pegawai_id      uuid NOT NULL REFERENCES pegawai(id),
  progress        persen NOT NULL,
  catatan         text,
  berkas_id       uuid REFERENCES berkas(id),
  status          text NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','disetujui','ditolak')),
  penyetuju_id    uuid REFERENCES pegawai(id),
  alasan          text,
  waktu           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ogr_tolak_wajib_alasan CHECK (
    status <> 'ditolak' OR (alasan IS NOT NULL AND btrim(alasan) <> ''))
);
CREATE INDEX on_going_report_wb_idx ON on_going_report (workblock_id, waktu DESC);

CREATE TABLE penilaian_workblock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workblock_id    uuid NOT NULL REFERENCES workblock(id),
  pegawai_id      uuid NOT NULL REFERENCES pegawai(id),
  penilai_id      uuid NOT NULL REFERENCES pegawai(id),
  nilai           text NOT NULL CHECK (nilai IN ('A','B','C','D','E')),
  catatan         text,
  dinilai_pada    timestamptz NOT NULL DEFAULT now(),
  -- Tidak ada yang menilai dirinya sendiri.
  CONSTRAINT penilaian_wb_bukan_diri CHECK (penilai_id <> pegawai_id)
);
CREATE UNIQUE INDEX penilaian_workblock_unik ON penilaian_workblock (workblock_id, pegawai_id, penilai_id);

CREATE TABLE penilaian_akhir (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id      uuid NOT NULL REFERENCES pegawai(id),
  penilai_id      uuid NOT NULL REFERENCES pegawai(id),
  tahun           smallint NOT NULL,
  triwulan        smallint NOT NULL CHECK (triwulan BETWEEN 1 AND 4),
  jenis           text NOT NULL CHECK (jenis IN ('result','behaviour')),
  nilai           text NOT NULL,
  catatan         text,
  dinilai_pada    timestamptz NOT NULL DEFAULT now(),
  terkunci        boolean NOT NULL DEFAULT false,
  CONSTRAINT penilaian_akhir_nilai_sah CHECK (
    (jenis = 'result'    AND nilai IN ('A','B','C','D','E')) OR
    (jenis = 'behaviour' AND nilai IN ('below_average','average','role_model','guardian'))),
  CONSTRAINT penilaian_akhir_bukan_diri CHECK (penilai_id <> pegawai_id)
);
CREATE UNIQUE INDEX penilaian_akhir_unik ON penilaian_akhir (pegawai_id, tahun, triwulan, jenis);

CREATE TABLE predikat_jmpd (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id    uuid NOT NULL REFERENCES pegawai(id),
  tahun         smallint NOT NULL,
  triwulan      smallint NOT NULL CHECK (triwulan BETWEEN 1 AND 4),
  result        text NOT NULL,
  behaviour     text NOT NULL,
  predikat      text NOT NULL CHECK (predikat IN
                  ('Exceptional','Exceed Expectation','Meet Expectation','Below Expectation','Unsatisfactory')),
  terbit_pada   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX predikat_jmpd_unik ON predikat_jmpd (pegawai_id, tahun, triwulan);

CREATE TABLE feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengirim_id   uuid NOT NULL REFERENCES pegawai(id),
  penerima_id   uuid NOT NULL REFERENCES pegawai(id),
  kategori      text NOT NULL CHECK (kategori IN ('result','behaviour','lainnya')),
  isi           text NOT NULL,
  dikirim_pada  timestamptz NOT NULL DEFAULT now(),
  aktif         boolean NOT NULL DEFAULT true,
  CONSTRAINT feedback_bukan_diri CHECK (pengirim_id <> penerima_id),
  CONSTRAINT feedback_isi_terisi CHECK (btrim(isi) <> '')
);
CREATE INDEX feedback_penerima_idx ON feedback (penerima_id, dikirim_pada DESC) WHERE aktif;

-- =============================================================================
-- K. DIKLAT, KOMUNIKASI, NOTIFIKASI
-- =============================================================================

CREATE TABLE diklat (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama            text NOT NULL,
  kategori_id     uuid REFERENCES kategori_diklat(id),
  penyelenggara   text,
  sasaran         text,
  tgl_mulai       date,
  tgl_selesai     date,
  anggaran        rupiah,
  aktif           boolean NOT NULL DEFAULT true,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh     uuid REFERENCES pegawai(id),
  diubah_pada     timestamptz,
  diubah_oleh     uuid REFERENCES pegawai(id)
);

CREATE TABLE peserta_diklat (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diklat_id             uuid NOT NULL REFERENCES diklat(id) ON DELETE CASCADE,
  pegawai_id            uuid NOT NULL REFERENCES pegawai(id),
  status                text NOT NULL DEFAULT 'diusulkan',
  sertifikat_file_id    uuid REFERENCES berkas(id)
);
CREATE UNIQUE INDEX peserta_diklat_unik ON peserta_diklat (diklat_id, pegawai_id);

CREATE TABLE riwayat_diklat (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        uuid NOT NULL REFERENCES pegawai(id),
  diklat_id         uuid REFERENCES diklat(id),   -- kosong bila dari luar sistem
  nama              text NOT NULL,
  penyelenggara     text,
  tgl_mulai         date,
  tgl_selesai       date,
  jumlah_jam        numeric(6,1),
  no_sertifikat     text,
  berkas_id         uuid REFERENCES berkas(id),
  aktif             boolean NOT NULL DEFAULT true,
  dibuat_pada       timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh       uuid REFERENCES pegawai(id)
);
CREATE INDEX riwayat_diklat_pegawai_idx ON riwayat_diklat (pegawai_id) WHERE aktif;

CREATE TABLE pengumuman (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  judul           text NOT NULL,
  isi             text NOT NULL,
  tayang_mulai    date NOT NULL,
  tayang_sampai   date,
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh     uuid REFERENCES pegawai(id),
  diubah_pada     timestamptz,
  diubah_oleh     uuid REFERENCES pegawai(id),
  CONSTRAINT pengumuman_tayang_urut CHECK (tayang_sampai IS NULL OR tayang_sampai >= tayang_mulai)
);

CREATE TABLE pengumuman_sasaran (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pengumuman_id   uuid NOT NULL REFERENCES pengumuman(id) ON DELETE CASCADE,
  jenis           text NOT NULL CHECK (jenis IN ('semua','unit','jenis_kepegawaian','pegawai')),
  nilai           text,
  CONSTRAINT pengumuman_sasaran_nilai CHECK (jenis = 'semua' OR nilai IS NOT NULL)
);
CREATE INDEX pengumuman_sasaran_idx ON pengumuman_sasaran (pengumuman_id);

CREATE TABLE pengumuman_dibaca (
  pengumuman_id   uuid NOT NULL REFERENCES pengumuman(id) ON DELETE CASCADE,
  pegawai_id      uuid NOT NULL REFERENCES pegawai(id),
  dibaca_pada     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pengumuman_id, pegawai_id)
);

CREATE TABLE template_surat (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama          text NOT NULL,
  isi           text NOT NULL,          -- berkas Docs diganti template teks di basis data
  variabel      text[] NOT NULL DEFAULT '{}',
  aktif         boolean NOT NULL DEFAULT true,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id),
  diubah_pada   timestamptz,
  diubah_oleh   uuid REFERENCES pegawai(id)
);

CREATE TABLE surat (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES template_surat(id),
  pegawai_id    uuid REFERENCES pegawai(id),
  nomor         text NOT NULL,
  berkas_id     uuid REFERENCES berkas(id),
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh   uuid REFERENCES pegawai(id)
);
CREATE UNIQUE INDEX surat_nomor_unik ON surat (nomor);

CREATE TABLE notifikasi (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  penerima_id   uuid NOT NULL REFERENCES pegawai(id),
  jenis         text NOT NULL,
  judul         text NOT NULL,
  isi           text,
  tautan        text,
  dibuat_pada   timestamptz NOT NULL DEFAULT now(),
  dibaca_pada   timestamptz,
  email_status  text NOT NULL DEFAULT 'tidak_perlu'
                  CHECK (email_status IN ('tidak_perlu','terkirim','tertunda','gagal'))
);
CREATE INDEX notifikasi_penerima_idx ON notifikasi (penerima_id, dibuat_pada DESC);
CREATE INDEX notifikasi_belum_dibaca_idx ON notifikasi (penerima_id) WHERE dibaca_pada IS NULL;
CREATE INDEX notifikasi_tertunda_idx ON notifikasi (dibuat_pada) WHERE email_status = 'tertunda';

CREATE TABLE preferensi_notif (
  pegawai_id    uuid NOT NULL REFERENCES pegawai(id),
  jenis         text NOT NULL,
  email_aktif   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (pegawai_id, jenis)
);

-- =============================================================================
-- L. AUDIT LOG
-- Append-only. Di Sheets itu janji; di sini basis data yang menolak, dan
-- penolakannya berlaku juga untuk siapa pun yang masuk lewat psql sebagai
-- role aplikasi.
-- =============================================================================

CREATE TABLE audit_log (
  no                bigserial PRIMARY KEY,
  waktu             timestamptz NOT NULL DEFAULT now(),
  pelaku_id         uuid REFERENCES pegawai(id),
  aksi              text NOT NULL,
  tabel             text NOT NULL,
  baris_id          uuid,
  sebelum           jsonb,
  sesudah           jsonb,
  alasan            text,
  hash_sebelumnya   bytea,
  hash              bytea NOT NULL CHECK (octet_length(hash) = 32)
);
CREATE INDEX audit_log_waktu_idx  ON audit_log (waktu DESC);
CREATE INDEX audit_log_baris_idx  ON audit_log (tabel, baris_id);
CREATE INDEX audit_log_pelaku_idx ON audit_log (pelaku_id, waktu DESC);

COMMENT ON TABLE audit_log IS
  'AUD: append-only. Ditulis dalam transaksi yang sama dengan datanya, jadi data berubah dan lognya hilang tidak mungkin terjadi.';
COMMENT ON COLUMN audit_log.sebelum IS 'hash_sandi dan hash_token dibuang sebelum dicatat (SRS AUD-06).';

-- Rantai hash: satu baris, memegang hash terakhir.
-- Pengganti Script Properties pada design_final.md §7.2.
CREATE TABLE audit_rantai (
  satu_baris    boolean PRIMARY KEY DEFAULT true CHECK (satu_baris),
  no_terakhir   bigint NOT NULL DEFAULT 0,
  hash_terakhir bytea,
  diperbarui    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO audit_rantai (satu_baris) VALUES (true);

CREATE OR REPLACE FUNCTION audit_log_tolak_ubah() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog bersifat append-only: % ditolak', TG_OP
    USING HINT = 'Koreksi dicatat sebagai baris baru, tidak pernah dengan mengubah baris lama.';
END;
$$;

CREATE TRIGGER audit_log_tanpa_update
  BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_tolak_ubah();
CREATE TRIGGER audit_log_tanpa_delete
  BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_tolak_ubah();

CREATE TABLE log_pemicu (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waktu             timestamptz NOT NULL DEFAULT now(),
  pekerjaan         text NOT NULL,
  jumlah_diproses   integer NOT NULL DEFAULT 0,
  berhasil          boolean NOT NULL,
  galat             text
);
CREATE INDEX log_pemicu_pekerjaan_idx ON log_pemicu (pekerjaan, waktu DESC);

-- =============================================================================
-- M. VERSI SKEMA
-- =============================================================================

CREATE TABLE skema_versi (
  versi         integer PRIMARY KEY,
  nama          text NOT NULL,
  diterapkan    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO skema_versi (versi, nama) VALUES (1, '001_skema_awal');

-- =============================================================================
-- N. HAK AKSES
-- Aplikasi tidak pernah tersambung sebagai pemilik basis data. Role `hris_app`
-- tidak bisa mengubah atau menghapus Audit Log sekalipun ada bug di kode, dan
-- tidak bisa mengubah struktur tabel.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
    CREATE ROLE hris_app LOGIN;
  END IF;
END
$$;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hris_app;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO hris_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hris_app;

-- Tidak ada hapus fisik (design_final.md §4.1). Master pakai `aktif`,
-- transaksi pakai `status`. DELETE dicabut dari seluruh tabel.
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM hris_app;

-- Audit Log: hanya boleh ditambah dan dibaca.
REVOKE UPDATE ON audit_log FROM hris_app;

-- Tarif statutori dan tarif pajak tidak bisa disunting lewat aplikasi.
REVOKE INSERT, UPDATE ON tarif_statutori, tarif_pajak FROM hris_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO hris_app;

-- Zona waktu: semua waktu disimpan timestamptz, ditampilkan Asia/Jakarta.
ALTER ROLE hris_app SET timezone TO 'Asia/Jakarta';

-- =============================================================================
-- Catatan penutup
--
-- YANG SENGAJA KOSONG saat pemasangan, menunggu masukan (design_final.md §14):
--   tarif_statutori   batas upah JP & kelas JKK 2026
--   tarif_pajak       TER A/B/C, Pasal 17, PTKP
--   jenis_cuti        Peraturan Perusahaan
--   aturan_reimburse  Peraturan Perusahaan
--   tarif_dinas       belum ditetapkan
-- Kelimanya punya bentuk lengkap. Yang belum ada adalah isinya, dan mesin
-- hitung menolak berjalan dengan tabel tarif yang kosong, bukan menebak.
-- =============================================================================
