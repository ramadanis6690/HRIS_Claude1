# Rangkuman Final Brainstorming HRIS Dana Pensiun Jasa Marga (DPJM)

## 1. Arsitektur Utama & Prinsip Keamanan (Core Architecture)

* **Standalone Web Application**: Sistem HRIS dibangun sebagai aplikasi web mandiri berbasis Google Apps Script Engine dengan **Google Sheets sebagai Single Source of Truth** (database terpusat, andal, dan tanpa biaya infrastruktur).
* **Isolasi & Keamanan Data**: Seluruh interaksi data diisolasi total. Pengguna tidak memiliki akses langsung ke file Google Sheets backend (*Execute as Me* / RLS-like abstraction), sehingga keamanan data pegawai terkunci penuh di tingkat server web app.
* **Role-Based Access Control (RBAC)**: Pengelompokan hak akses secara terstruktur berdasarkan peranan pengguna (Staff, Manager, Admin HRD, Admin Payroll, Admin Finance, Direksi/Dirut, dan Auditor).
* **Audit Trail Imutabel**: Log pencatatan riwayat perubahan data sensitif (gaji, presensi, sanksi, persetujuan) bersifat *Append-Only* (tidak dapat diubah atau dihapus), terkunci rapat, dan khusus diakses oleh **Auditor (View-Only)** demi kepatuhan tata kelola.
* **Bebas Kode Program**: Seluruh dokumentasi operasional dan spesifikasi disajikan secara bersih tanpa menampilkan kode program (.gs / skrip).

---

## 2. Struktur Organisasi & Level Hirarki Pengawasan

Sistem mengelola 20 pegawai yang terbagi dalam **5 Unit Organisasi** dan **4 Level Hirarki**:

### A. 5 Unit Organisasi
1. **KMR** (Kepatuhan & Manajemen Risiko)
2. **Internal Audit**
3. **Kepesertaan, SDM & Umum**
4. **Keuangan & Akuntansi**
5. **Investasi**

### B. 4 Level Hirarki Akses
1. **Direktur Utama (Dirut)**: Membawahi secara langsung unit **KMR** dan **Internal Audit**. Berwenang menginisiasi Workblock Induk top-level, memberikan pengesahan *payroll* eksekutif, serta memberikan penilaian akhir kinerja (Skala A–E) untuk Manager di unitnya.
2. **Direksi**: Membawahi unit **Kepesertaan/SDM/Umum**, **Keuangan/Akuntansi**, dan **Investasi**. Berwenang menginisiasi Workblock Induk top-level, memberikan pengesahan *payroll* eksekutif, serta memberikan penilaian akhir kinerja (Skala A–E) untuk Manager di unitnya.
3. **Manager Unit**: Kepala dari masing-masing 5 unit kerja. Berwenang menginisiasi Workblock unit, mengaktifkan *cascading milestone* (toggle `Show Milestones`), serta memberikan rekomendasi penilaian tim.
4. **Staff**: Pelaksana operasional unit. Berwenang menginput laporan *progress* harian (*On-Going Report*), melakukan presensi GPS, mengajukan reimbursement, cuti/SPPD, serta mengakses slip gaji digital.

---

## 3. Modul KPI & Workblock Management (JMPD)

Siklus manajemen kinerja mengadopsi prinsip Workblock JMPD dengan alur dua arah (*Top-Down* dan *Bottom-Up*):

### A. Alur Top-Down (Inisiasi & Cascading)
* **Inisiasi Strategis**: Dirut (unit KMR & Audit) dan Direksi (unit SDM, Keuangan, Investasi) membuat Workblock Induk.
* **Cascading Milestone**: Manager Unit menerima inisiatif tersebut, mengaktifkan toggle **`Show Milestones`**, lalu membagikan *milestone* dan *sub-bobot (%)* kepada Staff di unitnya.

### B. Alur Bottom-Up (Realisasi & Approval)
* **On-Going Report**: Staff melaporkan persentase *progress (%)* harian/mingguan.
* **Auto-Calculated Progress**: Angka *progress* yang diisi Staff pada *sub-milestone* secara **otomatis mengalkulasi (*auto-calculate*)** persentase pencapaian Workblock utama milik Manager.
* **Siklus Status Workblock**: `Draft` → `Waiting for Approval` → `Approved` → `On Progress` → `Finished` → `Completed`.
* **Penilaian Akhir Kinerja**: Pimpinan memberikan penilaian kuantitatif dan kualitatif dengan **Skala Penilaian A, B, C, D, E**.

---

## 4. Modul Unified Reimbursement (Kesejahteraan & Operasional)

* **Formulir Umum Terpadu**: Menggunakan **satu bentuk formulir sederhana** untuk seluruh jenis pengajuan klaim (Kacamata, Pengobatan/Kesehatan, Alat Bantu Kesehatan, hingga SPPD). Staff cukup mengisi deskripsi klaim, nominal, tanggal nota, dan melampirkan kuitansi sah.
* **Validasi Otomatis Masa Kerja (`tgl_mulai_kerja`)**: Sistem membaca masa kerja pegawai secara real-time dari database untuk memvalidasi syarat kelayakan (misalnya Kacamata minimal 12 bulan, Alat Bantu minimal 36 bulan).
* **Approval & Pencairan Ringkas**: Didelegasikan penuh ke **Admin Finance** untuk verifikasi kuitansi dan ketersediaan anggaran. Klaim yang disetujui otomatis terserap dan **dicairkan bersamaan dengan Payroll Run bulanan**.

---

## 5. Modul Payroll Engine & Pemetaan Komponen Data

### A. Pemisahan Komponen Data Database vs Input Admin
1. **Master Data Database (Profil Pegawai / Versioned Salary)**:
   * Gaji Pokok (P1), Tunjangan Jabatan (P2), Grade, Sub-Grade.
   * Status Kepegawaian, No. Rekening Bank, dan Data Keluarga.
   * *Versioned Salary*: Rekam jejak gaji historis tersimpan rapi tanpa mengubah laporan slip gaji periode lalu saat terjadi kenaikan gaji.
2. **Input Transaksional Admin per Periode**:
   * Rekapan jam hadir, keterlambatan, dan mangkir.
   * Jam lembur & insentif lumpsum.
   * Insentif/bonus triwulan dan klaim reimbursement yang disetujui.

### B. Pemetaan 4 Status Kepegawaian
1. **PKWTT (Pegawai Tetap)**: Full Gaji Pokok + Tunjangan Jabatan *(Probation 3–12 bulan dibayar 80%)*, PhDP 85%, DPLK (5% pegawai / 10% perusahaan), BPJS Ketenagakerjaan & Kesehatan, PPh 21 TER Gross-up.
2. **Penugasan (Perbantuan Induk)**: Murni mencatat nominal tunjangan/penghasilan yang **faktual dibayarkan oleh DPJM saja**. Terisolasi total dari data gaji PT Jasa Marga (Persero) Tbk / Instansi Induk.
3. **PKWT (Pegawai Kontrak)**: Gaji Kontrak sesuai KKWT (default tanpa DPLK/PhDP, dilengkapi toggle fleksibel).
4. **Outsource & Vendor**: Tidak masuk *Payroll Engine* internal. Pembayaran berupa tagihan *invoice* vendor yang diverifikasi oleh Admin Finance.

### C. 5-Stage Payroll Pipeline
1. **Tahap 1 (Admin HRD)**: Merekap data presensi, keterlambatan, lembur, dan cuti.
2. **Tahap 2 (Admin Payroll)**: Menjalankan *payroll engine* untuk mengkalkulasi Gaji, Tunjangan, Potongan, BPJS, PPh 21 TER, dan Reimbursement.
3. **Tahap 3 (Manager KSU & Manager Keuangan)**: Memverifikasi keabsahan data kepegawaian dan kesesuaian pos anggaran.
4. **Tahap 4 (Direksi)**: Mengesahkan draf payroll (*Executive Approval*).
5. **Tahap 5 (Admin Finance / Disbursment)**: Mengunduh rekap *batch transfer* bank, mengeksekusi pencairan gaji, dan menerbitkan Slip Gaji Digital.

### D. Formula Dinamis (`Settings CONFIG`)
* **Upah Lembur per Jam**: `(1 / 173) x (Gaji Pokok + Tunjangan Jabatan)`. *(Lumpsum Manager/Asman: Rp100.000/hari min. 2 jam)*.
* **Potongan Keterlambatan**: `(30% x Gaji Pokok / 10.380) x Menit Terlambat`. *(Dikenakan pada payroll bulan berikutnya, pecahan < Rp100 dibuang)*.

---

## 6. Fitur Fleksibilitas (Toggle Switch ON/OFF) & Penunjang

* **Bypass Radius GPS (`is_gps_bypass: ON/OFF`)**: Sakelar di profil pegawai yang dikelola Admin HRD. Jika **ON** (untuk Direksi, Manager, atau petugas lapangan), pembatasan radius 100m diabaikan, namun koordinat GPS asli tetap dicatat secara akurat.
* **DPLK / PhDP Toggle (`is_dplk_active: ON/OFF`)**: Sakelar di profil pegawai untuk mengaktifkan atau mengecualikan potongan iuran DPLK 5% PhDP secara fleksibel per individu.
* **Late Deduct Toggle (`is_late_deduct_active: ON/OFF`)**: Sakelar untuk mengaktifkan atau mengecualikan potongan keterlambatan.
* **Manual HRD Override**: Hak akses khusus Admin HRD untuk mengoreksi jam presensi dengan syarat wajib mengisi alasan/justifikasi tertulis yang terekam pada Audit Log.
