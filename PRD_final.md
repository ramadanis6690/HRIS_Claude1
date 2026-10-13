# PRD Final — HRIS Dana Pensiun Jasa Marga (DPJM)

**Tanggal:** 19 September 2026
**Status:** Menunggu tinjauan pemilik
**Platform:** PostgreSQL 16 + Node 22 + Nginx, di server milik DPJM
**Dokumen pasangan:** `SRS_final.md` (kebutuhan yang bisa diuji) · `design_final.md` (cara membangun)

---

## 0. Sumber dan urutan acuan

Dokumen ini adalah hasil sesi tanya-jawab dengan pemilik pada 19 September 2026. Ia menggantikan `PRD.md`, `SRS.md`, dan `design.md` versi 1 September 2026, yang ditulis untuk rancangan React + Supabase dan **tidak lagi berlaku** sebagai rancangan teknik.

Bila sumber saling bertentangan, urutan acuannya:

1. **Keputusan pemilik** yang tercatat di §7 dokumen ini
2. **Aturan resmi organisasi:** Keputusan Pengurus No. 17/KPTS/VIII/2025 tentang Kompensasi dan Penggajian (selanjutnya **SK**), Surat Remunerasi Direksi & Dewan Pengawas No. AA.HC.11.688 (selanjutnya **Surat Remunerasi**), dan Peraturan Perusahaan (belum diterima, lihat §9)
3. **`brainstorming_HRIS.md`** untuk aturan bisnis yang tidak diatur dokumen resmi
4. **`Manual_Book_JMPD_2024.md`** untuk bentuk modul Workblock
5. **Prinsip teknik PRD/SRS/design versi 1 September**: potret nilai pada payroll, gaji berversi, audit yang tidak bisa diubah, penolakan wajib beralasan, format Rupiah penuh, dan tema tampilan. Semuanya dipakai setelah disesuaikan ke PostgreSQL + Node.

---

## 1. Latar belakang

DPJM adalah dana pensiun di bawah pengawasan OJK dengan **sekitar 20 orang** (pegawai, Direksi, dan Dewan Pengawas) dalam **5 unit kerja**. Saat ini presensi, cuti, lembur, reimbursement, penggajian, dan penilaian kinerja dikerjakan secara manual.

Aplikasi ini berjalan **di server milik DPJM sendiri**: PostgreSQL sebagai database, folder di server itu sebagai penyimpanan berkas, dan satu proses Node sebagai server. **Data pegawai tidak meninggalkan kantor** — itu syarat kepatuhan, bukan pilihan teknis. Tidak ada layanan Google di jalur mana pun: tidak Sheets, tidak Drive, tidak Gmail. Pegawai tidak punya akses apa pun ke basis data; semua orang bekerja **hanya lewat aplikasi**.

Keputusan ini menggantikan rancangan 19 September yang memakai Google Apps Script. Yang ikut berpindah bersamanya adalah tanggung jawab yang dulu ditanggung Google: HTTPS, patch sistem operasi, backup, dan uptime. Keduanya tercatat sebagai risiko di §8.

Lingkungan **UJI** berjalan di cloud memakai kredit yang sudah dimiliki; lingkungan **ASLI** di server kantor. UJI wajib memakai versi PostgreSQL, Node, dan sistem operasi yang sama dengan ASLI — kalau tidak, "UJI lulus" tidak membuktikan apa pun.

## 2. Tujuan

| Kode | Tujuan |
|---|---|
| T1 | **Satu sumber kebenaran** untuk data pegawai. Modul lain merujuk data itu dan tidak menyimpan salinan yang bisa berbeda |
| T2 | **Presensi harian lewat HP** dengan GPS dan foto, dengan penilaian lokasi yang tidak bisa dipalsukan dari sisi browser |
| T3 | **Semua pengajuan dalam satu layar Approval** dengan jalur yang ditetapkan kebijakan HR, bukan dipilih pengaju |
| T4 | **Payroll yang mengikuti SK dan bisa dibuktikan**: dihitung otomatis dari data yang ada, disetujui berjenjang dengan pemisahan tugas, dan slip lama bisa dicetak ulang **identik** |
| T5 | **Kinerja model JMPD** dengan tampilan JM-Click: Workblock top-down, realisasi bottom-up yang disetujui atasan, nilai A–E, Behaviour, dan Predikat |
| T6 | **Tata kelola**: Audit Log yang tidak bisa diubah dan hanya dibaca Auditor, backup harian, dan lingkungan uji terpisah |
| T7 | **Satu basis data PostgreSQL di server DPJM** sebagai satu-satunya tempat data. Tidak ada salinan di spreadsheet, berkas Excel, atau layanan pihak ketiga |
| T8 | **Data pegawai tidak meninggalkan kantor.** Gaji, NIK, NPWP, scan dokumen, dan foto presensi tinggal di mesin milik DPJM. Satu-satunya yang keluar adalah notifikasi email ke alamat pegawai sendiri, **tanpa lampiran slip** |
| T9 | **Aturan kritis ditegakkan basis data, bukan hanya kode.** Gaji berversi tidak bisa tumpang tindih, satu run bulanan per periode, Audit Log tidak bisa diubah, dan tidak ada hapus fisik — keempatnya ditolak PostgreSQL, sehingga bug di kode tidak cukup untuk melanggarnya |
| T10 | **Dua lingkungan dengan versi identik**: UJI di cloud dengan data contoh, ASLI di server kantor. Tidak ada perubahan masuk ASLI tanpa lewat UJI, dan deploy berhenti bila versinya berbeda |
| T11 | **Rencana Bisnis**: pagu anggaran per tahun, kategori, dan unit, dengan serapan yang terisi otomatis dari payroll, biaya diklat & dinas, serta reimbursement — dan perbandingan pagu vs serapan di Beranda |
| T12 | **Server yang bisa dipelihara orang lain**: runbook yang pernah diikuti orang selain penulisnya, backup yang pernah benar-benar dipulihkan, dan satu nama yang bertanggung jawab menambal mesinnya |

## 3. Non-tujuan

- **Bukan** aplikasi mobile native. Aplikasinya web responsif yang dibuka dari browser HP.
- **Bukan** migrasi data historis. Yang diimpor hanya data awal: data pegawai, cuti terpakai 2026, dan klaim berplafon sebelum sistem.
- **Rencana Bisnis dibatasi pada pagu dan serapan** (K66). Ada: anggaran per tahun/kategori/unit, serapan yang terisi otomatis, dan perbandingan pagu vs serapan di Beranda. **Tidak ada**: pengajuan dan revisi anggaran, approval anggaran berjenjang, dan pemblokiran transaksi yang melampaui pagu — transaksi yang melewati pagu tetap bisa berjalan dan hanya ditandai.
- **Survey NPS 360 ditunda.** Penilaian Behaviour berjalan dulu tanpa skor NPS.
- **Tidak ada** data atau perhitungan pensiun pegawai. Aplikasi hanya mengurus pegawai aktif.
- Bukti potong Coretax **tidak dibuat sebagai XML** oleh aplikasi. Aplikasi mengekspor Excel dengan kolom yang sama persis dengan converter resmi DJP.

---

## 4. Organisasi, pengguna, dan peran

### 4.1 Unit kerja dan rantai atasan

| Unit | Direktur pembina |
|---|---|
| Kepatuhan & Manajemen Risiko (KMR) | Direktur Utama |
| Internal Audit | Direktur Utama |
| Kepesertaan, SDM & Umum (KSU) | Direktur (diatur di master Unit) |
| Keuangan & Akuntansi | Direktur (diatur di master Unit) |
| Investasi | Direktur (diatur di master Unit) |

Rantai atasan **dihitung otomatis** dari unit dan jabatan, bukan diisi manual:

- **Staff**, termasuk Assistant Manager, Specialist, Bendahara, Senior Officer, Officer, Caraka, dan Staf → **Manager unitnya**
- **Manager** → **Direktur pembina unitnya**
- **Direktur** → **Direktur Utama**
- **Direktur Utama** dan **Dewan Pengawas** → tidak punya atasan di sistem. Pengajuan mereka langsung ke Admin HRD.

### 4.2 Sembilan peran

Di layar User Management, **semua peran tampil dalam satu daftar (9 peran)**. Satu orang punya tepat satu peran struktural dan nol atau lebih peran admin.

- **Peran struktural** (4) **terisi otomatis dari jabatan** di Data Pegawai dan tampil di User Management, tetapi tidak bisa diketik di sana. Untuk mengubahnya, Admin HRD mengubah jabatan orangnya. Dewan Pengawas memakai peran `Employee`.
- **Peran admin** (5) **dicentang** di User Management oleh Super Admin. Tugas bendahara (membayar dan menerbitkan slip) termasuk dalam `Admin Finance`.

| # | Peran | Cara didapat | Yang bisa dilihat / dikerjakan |
|---|---|---|---|
| 1 | **Employee** | Otomatis (semua akun) | Menu pribadi: presensi, pengajuan, slip gaji, profil & e-CV, workblock milik sendiri, feedback, pengumuman |
| 2 | **Manager / Atasan** | Otomatis (jabatan Manager) | Employee + approval pengajuan timnya · **rekap presensi & cuti timnya (baca saja)** · membuat, membagi, dan menilai workblock tim · Penilaian Akhir tim · payroll & biaya **Tahap 3** (hanya Manager KSU dan Keuangan) |
| 3 | **Direksi** | Otomatis (jabatan Direktur) | Manager + approval & penilaian Manager binaannya · pengesahan payroll & biaya **Tahap 4** |
| 4 | **Dirut** | Otomatis (jabatan Direktur Utama) | Direksi + Workblock Induk · penilaian Direksi dan Manager KMR/IA |
| 5 | **Admin HRD** | Dicentang | Seluruh data pegawai termasuk gaji · presensi & koreksinya · cuti · perjalanan dinas · diklat · pengaturan · kebijakan approval · User Management (akun & reset sandi) · **Tahap 1** payroll & biaya. **Tidak bisa membaca Audit Log** |
| 6 | **Admin Payroll** | Dicentang | **Tahap 2**: menghitung run payroll, insentif/bonus, serta **biaya diklat & perjalanan dinas** (uang muka dan pertanggungjawaban) |
| 7 | **Admin Finance** | Dicentang | Approval reimbursement · kategori & plafon reimbursement · anggaran diklat · **tagihan vendor** (verifikasi & bayar) · **Tahap 5**: transfer gaji dan biaya, catat pembayaran, terbitkan slip, konfirmasi pengembalian kelebihan uang muka |
| 8 | **Auditor** | Dicentang | **Baca saja**: Audit Log dan semua report |
| 9 | **Super Admin** | Dicentang | Pengaturan sistem, tarif, dan penetapan peran admin. Dipegang pemilik aplikasi |

**Pemisahan tugas yang ditolak sistem:**
- `Admin Payroll` tidak boleh bersamaan dengan `Admin Finance` (yang menghitung tidak boleh juga yang membayar)
- `Auditor` tidak boleh bersamaan dengan peran admin mana pun
- Satu orang tidak boleh menyetujui dua tahap pada run yang sama

### 4.3 Jenis Kepegawaian dan Status Pegawai

Keduanya adalah **dua kolom terpisah**.

**Jenis Kepegawaian** menjawab *apa hubungan kerjanya*: `PKWTT` · `PKWT` · `Penugasan` · `Outsource` · `Direksi` · `Dewan Pengawas`. **Semuanya punya akun, fitur presensi, dan dihitung payroll.**

| Jenis | Dasar gaji | Catatan |
|---|---|---|
| PKWTT | Gapok + Tunjangan Jabatan sesuai tabel Grade/Sub Grade SK | Masa percobaan dibayar 80% (SK Pasal 9 ayat 4) |
| PKWT | Gaji kontrak | DPLK/PhDP bawaan OFF (bisa dinyalakan) |
| Penugasan | Hanya komponen yang **dibayar DPJM**. Gaji dari instansi induk tidak dicatat | BPJS bawaan OFF |
| Outsource | **Dihitung seperti PKWT** | Tanda *DPJM pemotong pajak* bawaan **Tidak**, karena PPh biasanya dipotong vendor |
| Direksi | Gaji + Tunjangan Perumahan & Utilitas (Surat Remunerasi) | Bypass GPS bawaan ON, potongan terlambat bawaan OFF |
| Dewan Pengawas | Honorarium + Tunjangan Transportasi (Surat Remunerasi) | BPJS bawaan OFF |

**Status Pegawai** menjawab *bagaimana keadaannya sekarang*, dan berdampak otomatis ke payroll dan akun:

| Status | Dampak |
|---|---|
| Calon Pegawai (Probation) | Penghasilan 80%, minimal UMP, sampai tanggal akhir probation |
| Aktif | Normal |
| Bebas Tugas – Cuti Sakit Panjang | 4 bulan pertama 100% · 4 bulan kedua 75% · 4 bulan ketiga 50% · seterusnya 25% (SK Pasal 13) |
| Bebas Tugas – Tugas Pendidikan | 100% (SK Pasal 14) |
| Bebas Tugas – Skorsing / Non-aktif | Gaji terakhir (SK Pasal 15 a–b) |
| Bebas Tugas – Ditahan | Gaji tidak dibayar. Bantuan keluarga 25/35/45/50% menurut jumlah tanggungan (SK Pasal 15 c) |
| Berhenti (Resign / PHK / Kontrak Berakhir) | Akun nonaktif otomatis setelah tanggal berhenti. Data lama tetap tersimpan |
| Meninggal Dunia | Kompensasi dibayar **6 bulan** ke ahli waris (SK Pasal 12 ayat 3) |

Pegawai Bebas Tugas **tidak dikenai potongan kehadiran** (SK Pasal 16 ayat 5).

---

## 5. Ruang lingkup modul dan fase

| Fase | Modul | Selesai bila |
|---|---|---|
| **0 — Prototipe** | Prototipe klik (HTML statis, data contoh) semua layar utama dengan tata letak JM-Click dan warna DPJM. Uji GPS & kamera di HP | Pemilik menyetujui tampilan dan alur semua layar utama |
| **1 — Fondasi & harian** | Login & User Management · Master data & Pengaturan · Data Pegawai & Profil (termasuk e-CV, dokumen, impor Excel) · **Presensi GPS + foto** · Audit Log · Dashboard dasar · Backup | 18 dari 20 orang check-in lewat aplikasi tanpa dibantu selama 4 minggu berturut-turut |
| **2 — Pengajuan** | Satu layar Approval untuk cuti, lembur, perjalanan dinas, presensi susulan, tinjauan luar radius, dan perubahan profil · Notifikasi (aplikasi + email) · Rekap kehadiran bulanan | Satu bulan penuh pengajuan berjalan di aplikasi, dan rekap bulanan disahkan HRD dari aplikasi |
| **3 — Uang** | Reimbursement · Payroll (bulanan, THR, insentif, bonus, penyesuaian) · **Biaya diklat & perjalanan dinas** (uang muka + pertanggungjawaban) · **Tagihan vendor** · Slip digital · File transfer bank · Rekap pajak & BPJS · Ekspor Coretax | Satu siklus payroll penuh selesai, dan slipnya bisa dicetak ulang identik setelah gaji salah satu pegawai dinaikkan |
| **4 — Kinerja & pelengkap** | JMPD: Workblock (top-down) · Penilaian Workblock A–E · Penilaian Akhir Result & Behaviour · Predikat JMPD · Feedback · Diklat · Report & ekspor fleksibel · Pengumuman · Template surat → PDF | Semua modul hidup, dan satu triwulan penilaian sampai predikat selesai |

**Presensi dipakai sungguhan selama empat minggu sebelum Fase 2 dimulai.** Presensi lewat HP setiap pagi adalah perubahan kebiasaan 20 orang, bukan sekadar perubahan perangkat lunak. Kalau fase ini gagal, cara kerja manual saat ini tetap menjadi jalan mundur.

---

## 6. Kebutuhan produk per modul

### 6.1 Login dan akun

- Pegawai masuk dengan **NPP atau Email** ditambah **kata sandi**. Tidak ada pendaftaran mandiri: akun dibuat Admin HRD atau Super Admin.
- Kata sandi awal **wajib diganti** saat login pertama. Admin bisa mereset kata sandi, dan setiap reset tercatat di audit (kata sandinya sendiri tidak pernah dicatat).
- Akun dikunci **15 menit setelah 5 kali gagal login** berturut-turut. Pesan gagal login selalu sama: *"Username atau kata sandi salah."*
- Sesi berakhir setelah **8 jam tanpa aktivitas**. Pilihan **"Ingat perangkat ini"** memperpanjangnya menjadi 30 hari.
- User Management menampilkan **pegawai yang belum punya akun**, beserta tombol "Buatkan akun" per orang atau massal. Kolom peran memperlihatkan **9 peran** (§4.2): peran struktural (Employee/Manager/Direksi/Dirut, otomatis dari jabatan) dan peran admin yang dicentang.

### 6.2 Data pegawai dan profil

- Data pegawai dikelola Admin HRD di menu **Data Pegawai**. Isinya identitas, kepegawaian, gaji berversi, keluarga (termasuk kontak darurat dan ahli waris), pendidikan, riwayat pekerjaan, riwayat diklat, sertifikasi, dokumen, dan pengaturan ON/OFF per orang. Daftar kolom lengkapnya ada di `design_final.md` §4.
- **Gaji pokok dan tunjangan diisi Admin HRD sebagai nominal berversi** dengan tanggal berlaku. Kenaikan gaji = baris baru. Baris lama tidak pernah diubah atau dihapus. Sistem **mengusulkan Sub Grade** dari masa kerja dan **memperingatkan** bila gapok berada di luar rentang Minimum–Maksimum tabel SK.
- **Masa kerja dihitung otomatis** dari tanggal masuk, atau dari tanggal masa kerja diakui bila diisi.
- Pegawai mengubah data dirinya lewat **pengajuan perubahan profil** yang disetujui Admin HRD. Perubahan **rekening dan NIK wajib melampirkan bukti**.
- **Scan dokumen** (KTP, KK, NPWP, ijazah, buku tabungan, SK/kontrak) dan **foto profil 3:4** hanya bisa dilihat pegawai ybs dan Admin HRD.
- **e-CV** dicetak sebagai PDF. Pegawai tanpa foto tetap mendapat PDF yang rapi dengan kotak bertanda. Kolom kosong ditulis "Belum diisi".
- **Toggle per orang**: wajib presensi · bypass GPS · potongan terlambat · BPJS Kesehatan · BPJS Ketenagakerjaan · DPLK · DPJM pemotong pajak · **Ikut Payroll**. Nilai awal `Ikut Payroll` mengikuti jenis kepegawaian: **Outsource = Tidak**, lainnya = Ya.
- **Pengingat otomatis** ke Admin HRD: kontrak berakhir (30 hari sebelumnya) dan sertifikat kedaluwarsa (60 hari sebelumnya).
- **Impor Excel** memakai file `Template_Data_Pegawai_DPJM.xlsx`: pratinjau → validasi semua baris → **semua masuk atau tidak sama sekali**, dengan laporan baris yang gagal.

### 6.3 Presensi

- **Check-in**: waktu, koordinat GPS, dan **foto wajib**. **Check-out**: waktu dan koordinat, tanpa foto. Maksimal satu check-in per hari. Tanggal selalu dalam WIB.
- **Titik kantor boleh lebih dari satu**, ditetapkan Admin HRD dengan **mengklik peta** (Leaflet + OpenStreetMap). Radius dipilih dari **50 / 100 / 200 / 300 m**. Pegawai bisa **dikunci ke satu titik** atau **bebas** (sah di titik aktif mana pun).
- **Jarak dihitung di server.** Browser hanya mengirim koordinat mentah.
- **Di luar radius → check-in ditolak**, disertai pesan jaraknya. Dari layar yang sama pegawai bisa **mengajukan tinjauan** dengan alasan ke Admin HRD. Bila disetujui, presensi tercatat dengan **jam dan koordinat asli** saat percobaan check-in.
- **Bypass GPS ON** berarti radius diabaikan, tetapi koordinat asli tetap dicatat.
- **Wajib presensi ON/OFF per orang.** Orang yang OFF tidak dinilai terlambat maupun mangkir.
- **Jam kerja adalah pengaturan**, bawaannya 08.00–17.00, Senin–Jumat, toleransi 0 menit. Setiap baris presensi menyimpan jam kerja yang berlaku **saat itu**, sehingga mengubah pengaturan tidak menilai ulang presensi lama.
- **Hari libur** = libur nasional ditambah hari yang ditetapkan HR, dengan sumber yang tercatat.
- **Aturan hitung** (SK Pasal 16):

| Kejadian | Perlakuan |
|---|---|
| Check-in lewat jam masuk + toleransi | Menit terlambat dipotong `30% × Gapok ÷ 10.380 × menit` |
| Check-out sebelum jam pulang | Menit *meninggalkan pekerjaan*, dengan rumus yang sama |
| Hari kerja tanpa check-in, cuti, dinas, atau susulan yang disetujui | **Mangkir** = 480 menit |
| Lupa check-out | Ditandai **"tanpa check-out"**. **Tidak** dipotong otomatis, dan masuk daftar tinjau HRD |
| Cuti, dinas, Bebas Tugas, atau potongan terlambat OFF | Tidak dipotong |

- Semua angka di atas adalah **usulan sistem** yang **disahkan Admin HRD di rekap bulanan**. Potongannya masuk **payroll bulan berikutnya** (SK Pasal 16 ayat 6), dengan pecahan di bawah Rp100 dibuang.
- **Koreksi presensi oleh Admin HRD** wajib disertai alasan, tercatat di audit, dan **ditandai di rekap kehadiran**.
- Foto presensi **diperkecil di HP** (sisi terpanjang 720 px, JPEG kualitas 0,6, sekitar 40–70 KB) dan **dihapus otomatis setelah 1 tahun**. Data presensinya tetap disimpan.

### 6.4 Perjalanan dinas

- **Admin HRD bisa langsung menetapkan** perjalanan dinas (berlaku seketika), dan **pegawai bisa mengajukan sendiri** lewat jalur approval.
- Selama perjalanan dinas yang berlaku, **setiap hari kerja otomatis tercatat "Hadir – Dinas Luar"**. Pegawai tidak perlu check-in, dan hari itu tidak pernah dihitung terlambat atau mangkir. Bila dinas dibatalkan atau dipersingkat, hari yang tidak lagi tercakup kembali dinilai normal.
- **Biaya perjalanan dinas** (uang muka dan pertanggungjawaban) diproses lewat alur **Biaya Diklat & Perjalanan Dinas** (§6.7a), bukan lewat Reimbursement.
- Pegawai melihat perjalanan dinasnya di Beranda (yang akan datang dan yang sedang berjalan, status uang muka, tenggat pertanggungjawaban) dan mendapat notifikasi saat uang muka ditransfer dan saat tenggat mendekat.

### 6.5 Pengajuan dan approval

Satu layar **Approval** memuat semua jenis pengajuan: cuti, lembur, perjalanan dinas, presensi susulan, tinjauan luar radius, perubahan profil, dan reimbursement.

Jalur persetujuan **dihitung dari rantai atasan** dan diatur **kebijakan per jenis pengajuan** oleh Admin HRD. Pengaju tidak pernah memilih jalurnya.

| Jenis | Jalur bawaan |
|---|---|
| Cuti | Atasan Langsung → Direktur Pembina unit pengaju |
| Lembur | Atasan Langsung → Direktur Pembina unit pengaju |
| Perjalanan dinas (pengajuan pegawai) | Atasan langsung → Admin HRD |
| Presensi susulan · Tinjauan luar radius · Perubahan profil | Admin HRD |
| Reimbursement | Admin Finance |
| Run khusus (THR/Insentif/Bonus/Penyesuaian) | Admin HRD/Admin Payroll → Direksi |

- Khusus **cuti & lembur**: pengaju → **Atasan Langsung** → **Direktur Pembina unit pengaju** (pengajuan oleh Direksi sendiri → Dirut). **Admin HRD bukan langkah**; setelah disetujui, saldo cuti terpotong dan jam lembur diakui **otomatis**, lalu lembur diteruskan ke bendahara (Admin Finance) untuk dibayar pada run payroll.
- **Run khusus** diajukan Admin HRD/Admin Payroll ke **Direksi** dan diproses **3 tahap**: pengajuan → persetujuan Direksi → pembayaran & penerbitan slip oleh Finance. Bila ditolak, pengusul dapat mengajukan ulang. **Run bulanan tetap 5 tahap**.
- Kebijakan boleh **bersyarat**, misalnya cuti lebih dari N hari ditambah Direksi.
- **Penolakan wajib beralasan.** **Tidak bisa menyetujui pengajuan sendiri**: langkah itu dialihkan ke pemegang peran yang sama yang lain, atau ke Super Admin.
- Jalur **dikunci saat diajukan**. Mengubah kebijakan tidak mengubah pengajuan yang sedang berjalan.

**Cuti**
- Jenis cuti adalah **master data** yang diatur Admin HRD. Isian awalnya mengikuti UU Ketenagakerjaan sampai Peraturan Perusahaan diterima (§9).
- **Saldo direset setiap 1 Januari.** Pegawai dengan masa kerja **di bawah 12 bulan belum berhak** cuti tahunan. Begitu genap 12 bulan di tengah tahun, pegawai **langsung mendapat 12 hari penuh** sampai 31 Desember. Sisa cuti hangus 31 Desember (bisa diubah per jenis cuti).
- Saldo **selalu dihitung**: jatah − cuti terpakai sebelum sistem − cuti yang disetujui di sistem. Pengajuan yang melebihi saldo atau bertabrakan tanggal ditolak sebelum sampai ke penyetuju.

**Lembur** (SK Pasal 8)
- Diajukan **setelah dikerjakan** (tanggal, jam mulai–selesai, uraian), lalu disetujui **Atasan Langsung dan Direktur Pembina unit pengaju** (Admin HRD bukan langkah). Persetujuan atasan dianggap sebagai perintah lembur.
- **Jam lembur dicocokkan dengan presensi.** Lembur tidak dihitung melampaui jam check-out, dan lembur di hari libur memerlukan check-in/check-out hari itu.
- **Cara bayar diatur per jabatan**: *upah per jam* atau *insentif lumpsum Rp100.000/hari (minimal 2 jam)*. Nilai awalnya mengikuti Pasal 8 ayat 2: Manager, Specialist, dan Assistant Manager lumpsum; Grade III–V upah per jam.
- Tarif per jam = `(Gapok + Tunjangan Jabatan) ÷ 173`. Pengali hari kerja: 1,5× jam pertama, 2× jam berikutnya. Pengali hari libur: 2× jam ke-1 s.d. 8, 3× jam ke-9, 4× jam ke-10 s.d. 12. Batas: 4 jam/hari dan 18 jam/minggu di hari kerja. Total bulanan dibulatkan ke bawah ke ratusan rupiah.
- Setelah disetujui, jam lembur **diakui otomatis**, lalu diteruskan ke bendahara (Admin Finance) untuk dibayar pada run payroll bulan berikutnya.

**Presensi susulan**
- Untuk **hari kerja yang sudah lewat**, maksimal **7 hari ke belakang** (bisa diatur), disetujui Admin HRD.
- **Tidak bisa** diajukan untuk bulan yang rekapnya sudah disahkan. Setelah itu hanya lewat koreksi HRD.
- Ditandai **"Susulan"** di rekap kehadiran.

### 6.6 Reimbursement

- **Satu formulir untuk semua jenis klaim**: deskripsi, kategori, nominal, tanggal nota, dan **lampiran bukti wajib**. Biaya perjalanan dinas dan diklat **tidak** lewat Reimbursement, melainkan lewat §6.7a.
- **Kategori adalah master data**, dengan aturan **per kelompok** (Pegawai / Direksi / Dewan Pengawas): syarat masa kerja minimal, plafon (opsional) beserta periodenya, persentase penggantian, dan tanda kena pajak. Sistem menghitung sisa plafon dan kelayakan secara otomatis.
- Isian awal: **kacamata ≥ 12 bulan masa kerja** dan **alat bantu ≥ 36 bulan** untuk Pegawai (brainstorming). Plafon Dewan Pengawas mengikuti Surat Remunerasi (kacamata Rp2.500.000 per tahun, alat bantu dengar Rp600.000 per 2 tahun, protesa mata Rp500.000, protesa alat gerak Rp500.000 per 5 tahun, alat bantu lain 100%). Direksi diganti 100%. Plafon Pegawai lainnya menunggu Peraturan Perusahaan.
- **Disetujui Admin Finance saja.**
- Klaim yang disetujui **ikut run payroll bulanan pertama yang dihitung sesudahnya**, lalu muncul di slip. Statusnya: *Menunggu → Disetujui, menunggu pembayaran → Dibayar (periode X)*.
- Klaim berplafon yang sudah dibayar **sebelum sistem** diimpor dari template agar sisa plafonnya benar.

### 6.7 Payroll

**Alur** (berlaku untuk semua jenis run):

| Tahap | Pelaku | Pekerjaan |
|---|---|---|
| 1 | Admin HRD | Mengesahkan rekap kehadiran & lembur bulan sebelumnya |
| 2 | Admin Payroll | Membuat run dan menghitung **semua orang sekaligus**, mengisi insentif/bonus bila ada |
| 3 | Manager yang ditunjuk | Verifikasi data kepegawaian dan anggaran. Unitnya dipilih di Pengaturan (bawaan: KSU dan Keuangan & Akuntansi), dan **semua manager yang ditunjuk harus setuju** |
| 4 | Salah satu Direksi / Dirut | Pengesahan |
| 5 | Admin Finance | Mengunduh file transfer bank (Excel), mencatat tanggal bayar, **menerbitkan slip**. Run lalu **terkunci permanen** |

- Setiap tahap bisa **mengembalikan** run ke Tahap 2 dengan **alasan wajib**. Semuanya tercatat di audit.
- Run yang final tidak bisa diubah siapa pun, termasuk Super Admin. Koreksi dilakukan lewat **run penyesuaian**.
- **Jenis run:** Bulanan · THR · Insentif Triwulan · Insentif Tahunan · Bonus · Penyesuaian
- Setiap run **menyimpan potret** nama, jabatan, rekening, gapok, dan setiap komponen. Slip bisa dibuka untuk **12 periode ke belakang** dan selalu identik.
- Gaji dibayar **paling lambat hari kerja terakhir** setiap bulan (SK Pasal 12).

**Siapa yang ikut dihitung**
- Peserta run = pegawai aktif pada periode itu **yang toggle `Ikut Payroll`-nya menyala**.
- Sebelum menghitung (Tahap 2), Admin Payroll melihat **daftar peserta lengkap dengan toggle per orang** dan bisa menyalakan atau mematikannya **khusus untuk run itu**. Perubahan di sini tidak mengubah data pegawai dan tercatat di Audit Log.
- Toggle hanya bisa diubah selama run di Tahap 2. Setelah diajukan, run harus dikembalikan dulu lalu dihitung ulang.
- Layar run menampilkan ringkasan seperti "20 aktif · 18 dihitung · **2 dikecualikan**" beserta alasannya (Ikut Payroll mati, belum masuk kerja, atau sudah berhenti sebelum periode). Tidak ada orang yang hilang diam-diam.
- Orang yang dikecualikan **tidak** mendapat slip gaji, tidak masuk file transfer bank, dan tidak masuk rekap PPh 21 — **kecuali** bila ia punya reimbursement yang disetujui: ia tetap mendapat baris run berisi **reimbursement saja**, tanpa gaji, BPJS, DPLK, maupun PPh.
- Presensi, cuti, pengajuan, workblock, dan diklat tetap berjalan untuk mereka. Toggle ini hanya soal uang.

**Komponen**

| Komponen | Aturan |
|---|---|
| Gaji Pokok, Tunjangan Jabatan | Dari versi gaji yang berlaku. Tunjangan jabatan hanya untuk kelompok jabatan yang berhak (SK Pasal 4) |
| Faktor status | Probation 80%, cuti sakit panjang, skorsing, ditahan, meninggal (§4.3) |
| Upah/insentif lembur | Dari lembur bulan sebelumnya yang disahkan |
| Potongan kehadiran | Dari rekap bulan sebelumnya yang disahkan |
| Reimbursement | Klaim yang disetujui dan belum dibayar |
| BPJS | Tarif pemerintah (berversi, tidak bisa disunting di layar). **Bagian pegawai dipotong dari gaji**, bagian perusahaan dibayar DPJM |
| DPLK | PhDP = **85% × (Gapok + Tunjangan Jabatan)**. Pegawai 5% dipotong, perusahaan 10%. Bisa ON/OFF per orang |
| PPh 21 | **Gross-up / ditanggung DPJM** (SK Pasal 17; Surat Remunerasi butir 10). PPh diberikan sebagai **tunjangan pajak** yang ditambahkan ke bruto dan dihitung **iteratif** dengan TER bulanan; neto **tidak dipotong** PPh. **Pengecualian:** PPh atas **insentif/remunerasi kinerja Direksi & Dewan Pengawas** menjadi beban pribadi penerima dan **dipotong dari neto**. Dihitung ulang tahunan di Desember. Tampil di slip sebagai tunjangan pajak dan baris informasi |
| THR | Pegawai: 2× penghasilan bila masa kerja ≥ 12 bulan, proporsional bila kurang, **tanpa faktor status**. Direksi: 1× gaji. Dewan Pengawas: 1× honorarium dari **master remunerasi pegawai**. Nilai awal dihitung sistem, dan **Admin Payroll boleh menyesuaikan nominal per pegawai** (penanda Manual + alasan, ada aksi kembalikan ke hitungan aturan). Peserta bisa diaktif/non-aktifkan per run **hanya di Tahap 2**; yang non-aktif tidak masuk slip, rekap pajak, dan file transfer bank. Kelayakan bawaan: masa kerja **≥ 1 bulan**; berhenti **kurang dari 30 hari sebelum hari raya** ditandai tidak berhak (bisa dinyalakan Admin dengan alasan). Jadwal **serentak**, satu tanggal bayar per run, dengan peringatan bila tanggal bayar **kurang dari H-14 (14 hari sebelum hari raya)**. PPh atas THR **ditanggung penuh** perusahaan. Admin HRD/Admin Payroll mengajukan run THR ke **Direksi**; setelah disetujui, Finance membayar dan menerbitkan slip (3 tahap: pengajuan → persetujuan Direksi → pembayaran & slip) |
| Insentif TW, Insentif Tahunan, Bonus | Nominal diisi atau diimpor Admin Payroll per run. Diajukan Admin HRD/Admin Payroll sebagai **run khusus** ke Direksi, lalu dibayar dan diterbitkan slipnya oleh Finance (3 tahap; tahap verifikasi Manager tidak dipakai) |
| Tunjangan operasional (uang makan, transport, telekomunikasi) | Tunjangan operasional: uang makan dan transport **per hari hadir**, telekomunikasi **per bulan**. Tarif per grade diisi HRD lewat tab `TarifKomponen`; sistem memperingatkan bila tarif belum diisi |
| Tunjangan Perumahan & Utilitas Direksi | Rp 22.500.000 per bulan untuk Direksi (Surat Remunerasi) |
| Tunjangan Transportasi Dewan Pengawas | Rp 4.000.000 per bulan untuk Dewan Pengawas (Surat Remunerasi) |
| Ongkos Cuti Tahunan & Cuti Besar | Masing-masing **1× penghasilan**; diajukan lewat pengajuan + approval atasan → direksi dengan bukti wajib, lalu otomatis masuk run payroll berikutnya |
| Uang Kompensasi Piket | Rp 75.000 (hari kerja) · Rp 150.000 (hari libur) · Rp 250.000 (Idul Fitri & Natal) |
| Bantuan Sumbangan Duka Cita | Nominal pengajuan, **tidak kena pajak**; lewat pengajuan + approval atasan → direksi |
| Bantuan Keuangan Keluarga (pegawai ditahan) | 25% (1 tanggungan) · 35% (2) · 45% (3) · 50% (≥4) dari upah, maksimal 6 bulan (SK Pasal 15 c) |
| Tambahan Uang Purna Karya | 5× penghasilan untuk pensiun normal dengan masa kerja ≥ 24 tahun |
| Tunjangan Pajak (gross-up) | Ditambahkan ke bruto sehingga neto tidak dipotong PPh; dihitung iteratif dengan TER (lihat baris PPh 21). Insentif Direksi/Dewas tidak di-gross-up, PPh-nya dipotong dari neto |
| Fasilitas Direksi/Dewas lain | Kendaraan, pakaian dinas, asuransi purna jabatan, dan uji kesehatan **tidak lewat payroll**. Biaya kesehatan lewat Reimbursement |

**Keluaran payroll:** slip digital (bisa dilihat dan dicetak PDF oleh pegawai ybs) · file transfer bank Excel · rekap PPh 21 & BPJS per periode · ekspor Excel berkolom converter Coretax **BPMP** (bulanan pegawai tetap), **BP21** (selain pegawai tetap, misalnya Dewan Pengawas), dan **BPA1** (tahunan).

### 6.7a Biaya diklat dan perjalanan dinas

Biaya diklat dan perjalanan dinas memakai **alur 5 tahap yang sama dengan payroll**, dengan pola **uang muka lalu pertanggungjawaban**.

**Uang muka** (sebelum berangkat / sebelum diklat):

| Tahap | Pelaku | Pekerjaan |
|---|---|---|
| 1 | Admin HRD | Membuat berkas biaya dari perjalanan dinas atau diklat yang sudah disetujui: kegiatan, peserta, tanggal |
| 2 | Admin Payroll | Menghitung uang muka per peserta per komponen (uang harian, transport, penginapan, biaya diklat, lainnya) |
| 3 | Manager KSU + Manager Keuangan | Verifikasi (keduanya harus setuju) |
| 4 | Salah satu Direksi / Dirut | Pengesahan |
| 5 | Admin Finance | Transfer langsung ke rekening peserta, catat bukti bayar |

**Pertanggungjawaban** (setelah kembali / selesai):
- Peserta mengunggah **bukti per komponen** paling lambat **14 hari kerja** setelah tanggal kembali atau tanggal selesai diklat. Batas ini bisa diubah di Pengaturan. Pengingat dikirim 3 hari kerja sebelum tenggat dan saat tenggat terlewati.
- Pertanggungjawaban melewati **5 tahap yang sama**. Admin Payroll menghitung selisih antara biaya sebenarnya dan uang muka.
- **Kekurangan** → dibayar Admin Finance pada Tahap 5.
- **Kelebihan** → **pegawai memilih** saat mengirim pertanggungjawaban: **transfer balik** ke rekening DPJM (unggah bukti, lalu Admin Finance mengonfirmasi) **atau potong gaji** bulan berikutnya (muncul sebagai potongan di slip).
- Uang muka yang lewat tenggat tanpa pertanggungjawaban tampil di dashboard Admin HRD dan Admin Finance.

**Tarif:** master **tarif uang harian, transport, dan penginapan** disiapkan **kosong** dan diisi HR/Finance nanti. Selama kosong, Admin Payroll mengisi nominal manual dengan keterangan dasar perhitungannya.

**Anggaran diklat:** Admin Finance menetapkan anggaran diklat per tahun. Realisasinya = total pertanggungjawaban diklat yang sudah final.

### 6.7b Tagihan vendor outsource

**Bukan menu sendiri.** Tagihan vendor adalah satu bagian di dalam layar Payroll (K67), karena pembayarannya satu urusan dengan pencairan bulanan dan tidak perlu membuat Admin Finance berpindah layar.

Pegawai Outsource dibayar oleh vendornya, bukan lewat payroll. Supaya seluruh biaya SDM tetap terlihat di satu tempat, tagihan vendor dicatat secara sederhana:

- **Isi tagihan**: nomor tagihan, nama vendor, periode, jumlah orang, nominal, keterangan, dan **lampiran invoice**
- Dicatat **Admin HRD atau Admin Finance**, lalu **diverifikasi dan dibayar Admin Finance** (status *menunggu -> diverifikasi -> dibayar*, dengan tanggal bayar dan bukti)
- Penolakan atau pengembalian ke pencatat wajib disertai alasan
- Tagihan yang sudah dibayar ikut terhitung di **laporan biaya SDM** dan di dashboard Admin Finance
- Tagihan vendor **tidak** menghasilkan slip gaji dan tidak masuk rekap PPh 21

### 6.8 JMPD: Workblock, penilaian, predikat, feedback

Tata letak dan alur layar modul ini **mengikuti JM-Click (Jasa Marga) 100%**. Warnanya mengikuti tema DPJM (§6.14), dan skala nilai Result memakai **A–E**, bukan R1–R5.

**Pembuatan workblock (top-down)**
- **Dirut** membuat **Workblock Induk**. **Direktur dan Manager juga boleh membuat workblock sendiri** untuk levelnya. Staff tidak membuat workblock; Staff menerima turunan.
- Workblock baru diajukan (*Waiting for Approval*) ke **atasan pembuat**: Direktur ke Dirut, Manager ke Direktur pembina (Manager KMR/Internal Audit ke Dirut). Workblock Dirut langsung *Approved*.
- Formulir **Create Workblock** persis JM-Click: Initiative, Begin Date, Completion Date, Goal, Key Activities, **Dependencies Internal**, **Dependencies External**, Stakeholder, Budget, Deliverables. **Project Owner** terisi otomatis dari unit pembuat (Dirut/Direktur: "Direksi").
- Toggle **Show Milestones**: tambah milestone (**Bobot Utama %**, total 100%) lalu **Add Karyawan** (**Sub Bobot %**, total 100% per milestone), dengan penanda "Maksimal / Total / Sisa Bobot". Karyawan yang bisa dipilih hanya **bawahan langsung dalam struktur**: Dirut → Direktur dan Manager KMR/IA; Direktur → Manager unit binaannya; Manager → Staff unitnya. Satuan *pts* pada contoh JMPD sama dengan persen.
- Setelah workblock *Approved*, setiap penugasan otomatis menjadi **workblock turunan** di daftar penerimanya. ID-nya berakhiran nomor (mis. `WB-12.1`), kolom **Assigned From** berisi pemberi tugas, dan **Bobot** berisi sub-bobotnya. Penerima boleh memecah turunan itu lagi dengan milestone ke bawahannya (Direktur → Manager → Staff). Turunan tidak perlu disetujui ulang.
- Status: **Draft → Waiting for Approval → Approved → On Progress → Finished → Completed**. Selama *Waiting for Approval*, pembuat bisa **Edit** atau **Cancel Submission** (kembali ke Draft). Detail workblock bisa dicetak (**Print as PDF**).

**Realisasi (bottom-up)**
- Pemegang workblock paling bawah mengisi **On Going Report**: *On going Progress (%)* per milestone, *Important Notes* minimal 15 karakter, dan **bukti opsional**. Layar menampilkan Bobot, Target, Progress, Pencapaian (bobot × progress), *Previous Notes*, *View History*, dan grafik Target vs Progress.
- Progress **baru dihitung setelah disetujui pemberi tugas**. Penolakan wajib beralasan.
- Progress turunan yang disetujui otomatis mengisi progress penugasan di workblock atasannya, lalu naik ke milestone dan ke Workblock Induk. Workblock yang mencapai 100% menjadi *Finished*.

**Penilaian**
- **Penilaian Workblock**: pemberi tugas menilai workblock turunan bawahannya yang berstatus *On Progress* atau *Finished* dengan **A–E** dan notes minimal 15 karakter, lewat *Daftar Team Member → View List → Nilai Form*. Tidak ada usulan otomatis. Workblock *Finished* yang sudah dinilai menjadi *Completed*.
- **Penilaian Akhir Result** (per **triwulan**): atasan langsung memilih **A–E** (radio button) untuk tiap bawahan. Sebagai acuan, layar menampilkan nilai workblock, rata-rata progress, dan feedback triwulan itu. Catatan wajib.
- **Penilaian Akhir Behaviour** (per **triwulan**): atasan yang sama memilih **Below Average / Average / Role Model / Guardian**, dengan catatan wajib.
- **Predikat JMPD** ditentukan otomatis dari grid Result × Behaviour, ditampilkan sebagai grid berwarna seperti JM-Click, beserta daftar *Predikat JMPD Team Member*:

| Result \ Behaviour | Below Average | Average | Role Model | Guardian |
|---|---|---|---|---|
| **A** | Below Expectation | Exceed Expectation | Exceptional | Exceptional |
| **B** | Below Expectation | Meet Expectation | Exceed Expectation | Exceptional |
| **C** | Below Expectation | Meet Expectation | Meet Expectation | Exceed Expectation |
| **D** | Unsatisfactory | Below Expectation | Below Expectation | Meet Expectation |
| **E** | Unsatisfactory | Unsatisfactory | Below Expectation | Below Expectation |

- **Siapa menilai siapa:** Staff dinilai Manager (final). Manager dinilai Direktur pembina (KMR/IA oleh Dirut). Direktur dinilai Dirut. Dirut tidak dinilai di sistem.

**Feedback**
- Semua pengguna bisa mengirim feedback kategori **Result / Behaviour / Lainnya** ke pegawai lain, lewat ikon feedback di bilah atas.
- Yang bisa melihat: **pengirim, penerima, dan rantai atasan penerima dalam struktur**. Nama pengirim tercantum. Tab **User Feedback** berisi yang saya terima, **My Feedback** berisi yang saya kirim. Atasan melihat feedback bawahannya di layar Penilaian Akhir.

**Survey NPS 360 ditunda.** Kartu *Personal NPS Score* belum ditampilkan sampai fitur itu dibangun.

### 6.9 Diklat

Master diklat mencatat nama, kategori, penyelenggara, **untuk siapa** (sasaran peserta), tanggal mulai, **kapan selesai**, dan anggaran dalam Rupiah penuh. Peserta dan statusnya dicatat. Diklat yang selesai otomatis masuk **Riwayat Diklat** pegawai. Biaya diklat (uang muka dan pertanggungjawaban) diproses lewat §6.7a.

### 6.10 Report

Tujuh report inti: **daftar pegawai · rekap kehadiran** (dengan jam datang dan pulang) **· rekap cuti · rekap lembur · rekap payroll · rekap pajak & BPJS · ekspor Audit Log**. Ditambah satu **ekspor fleksibel** (pilih sumber, rentang, filter, kolom) ke XLSX/CSV. Setiap report punya toggle **Sertakan Direksi & Dewan Pengawas**, **mati secara default**. Tidak ada report yang bisa menampilkan data yang tidak boleh dilihat penggunanya di layar.

### 6.11 Pengumuman, surat, notifikasi

- **Pengumuman** dari Admin HRD ke semua orang, unit tertentu, jenis kepegawaian tertentu, atau orang tertentu, dengan masa tayang dan penanda sudah dibaca.
- **Template surat berupa teks di basis data** dengan penanda seperti `{{nama}}` dan `{{npp}}`, disunting Admin HRD lewat layar Template Surat. Aplikasi mengisi data pegawai lalu menghasilkan **PDF**. Tidak ada folder yang dibagikan ke siapa pun.
- **Notifikasi di aplikasi + email**: pengajuan baru yang menunggu saya, hasil pengajuan saya, slip terbit, pengumuman baru, dan pengingat HRD. Email bisa dimatikan per jenis. **Email tidak pernah melampirkan slip gaji**, hanya pemberitahuan dengan tautan ke aplikasi.

### 6.12 Dashboard

**Halaman pertama setelah login adalah Beranda.** Isi Beranda **berbeda per peran**: setiap orang melihat bagian *Employee*, ditambah bagian untuk peran struktural dan peran adminnya. Bagian yang bukan haknya tidak ditampilkan.

**Berlaku di semua Beranda**
- Setiap angka dan grafik **bisa diklik** dan membuka layar rinciannya
- **Filter tanggal 4 mode: Harian · Bulanan · Triwulan · Rentang bebas.** Triwulan mengikuti tahun kalender: **TW I 1 Jan–31 Mar · TW II 1 Apr–30 Jun · TW III 1 Jul–30 Sep · TW IV 1 Okt–31 Des**. Blok JMPD (nilai, predikat, workblock) memakai mode Triwulan secara bawaan
- Blok "hari ini" (presensi, perlu tindakan, kehadiran hari ini) diperbarui otomatis tiap 60 detik
- Keadaan kosong ditulis jelas ("Tidak ada yang menunggu Anda"). Periode tanpa data ditulis "belum ada data" atau "belum dijalankan", bukan nol
- Semua angka berasal dari database. Rincian presensi per pegawai ada di menu **Laporan Presensi**, bukan di Beranda

**1. Employee (semua orang)**
- Presensi hari ini: jam check-in besar, status, sisa waktu ke jam pulang, tombol Check-in/Check-out
- Peringatan presensi bolong ("Kemarin Anda belum check-out"), dengan tombol **Ajukan susulan**
- **Aksi cepat**: ajukan cuti · lembur · reimbursement · perjalanan dinas · isi On Going Report
- Status pengajuan saya: menunggu atasan / HRD, disetujui, ditolak (beserta alasannya)
- Saldo cuti, dan pengingat sisa yang hangus 31 Desember
- Kehadiran bulan ini: hadir, jumlah terlambat, total menit terlambat (tanpa nominal potongan)
- Kartu *Individual Workblock Performance*, tenggat milestone terdekat, laporan yang ditolak dan perlu direvisi
- Nilai dan predikat JMPD triwulan terakhir
- Slip terakhir terbit (tautan, tanpa nominal)
- **Daftar sisa plafon reimbursement** per kategori ("Kacamata: bisa diklaim lagi 10 Mar 2027", "Alat bantu dengar: tersedia")
- **Perjalanan dinas saya**: yang akan datang atau sedang berjalan, status uang muka (menunggu tahap X / sudah ditransfer), dan tenggat pertanggungjawaban
- Uang muka dinas/diklat yang belum dipertanggungjawabkan, diklat yang akan diikuti, sertifikat yang akan kedaluwarsa
- Pengumuman belum dibaca
- **Grafik**: kehadiran saya per hari · Target vs Progress workblock per milestone · nilai workblock per triwulan

**2. Manager / Atasan** (ditambah)
- Perlu tindakan per jenis; yang tertunda **lebih dari 3 hari** ditandai merah
- Kehadiran tim hari ini dengan nama: belum check-in, cuti, dinas
- **Kalender tim** minggu ini (cuti dan dinas)
- Workblock unit: progress per milestone vs tenggat, bawahan yang tidak melapor lebih dari 14 hari
- Progress penilaian triwulan ("3 dari 5 bawahan sudah dinilai")
- Lembur tim bulan ini
- *(Manager KSU & Keuangan)* payroll dan berkas biaya yang menunggu Tahap 3, dengan perbandingan total terhadap bulan lalu
- **Grafik**: kehadiran tim per hari · progress workblock unit vs target · sebaran nilai & predikat tim per triwulan · jam lembur tim per bulan

**3. Direksi / Dirut** (ditambah)
- Ringkasan per unit binaan: persentase kehadiran, progress workblock, sebaran predikat
- Workblock strategis: milestone yang sudah lewat tenggat atau berisiko terlambat
- Perlu tindakan: approval Manager, workblock menunggu persetujuan, payroll dan biaya Tahap 4 dengan perbandingan bulan lalu
- Penilaian Manager triwulan ini
- **Grafik**: perbandingan unit binaan (kehadiran %, progress) · predikat per unit per triwulan · **biaya SDM per bulan** (gaji, lembur, reimbursement, dinas, diklat; total saja, tanpa rincian per orang)

**4. Admin HRD** (ditambah)
- Perlu tindakan: approval, tanpa check-out, percobaan luar radius, perubahan profil, berkas biaya Tahap 1
- Kehadiran semua pegawai hari ini (hadir, terlambat, belum check-in, cuti, dinas luar), dengan tautan ke Laporan Presensi
- **Kalender HR**: cuti, dinas, hari libur
- Tenggat kepegawaian: kontrak (30 hari), sertifikat (60 hari), **akhir masa probation**
- **Kelengkapan data**: tanpa akun, tanpa kontak darurat, dokumen belum diunggah, nomor BPJS kosong
- Rekap bulan lalu belum disahkan, dan hitung mundur ke tanggal gajian
- Progress penilaian triwulan semua unit, diklat berjalan dan akan datang, uang muka lewat tenggat
- **Grafik**: kehadiran semua pegawai per hari · cuti per jenis per bulan · lembur per unit · progress penilaian triwulan per unit

**5. Admin Payroll** (ditambah)
- Status run bulan ini per tahap, dan hitung mundur ke tanggal gajian
- **Checklist sebelum menghitung**: rekap sudah disahkan · insentif sudah diisi · pegawai baru atau berhenti bulan ini · perubahan gaji bulan ini · reimbursement dan potongan kelebihan uang muka yang akan ikut
- Selisih dengan bulan lalu per komponen, dan run yang dikembalikan beserta alasannya
- Berkas biaya diklat & dinas yang perlu dihitung (uang muka dan pertanggungjawaban)
- **Grafik**: total payroll 12 bulan · komponen gaji per bulan · selisih per komponen dengan bulan lalu

**6. Admin Finance** (ditambah)
- Reimbursement menunggu persetujuan (jumlah, total Rp, yang paling lama)
- **Pembayaran menunggu**: payroll dan berkas biaya di Tahap 5, konfirmasi pengembalian kelebihan uang muka
- Pertanggungjawaban uang muka yang lewat tenggat
- Total uang keluar bulan ini, dan anggaran diklat vs realisasinya
- **Grafik**: uang keluar per kategori per bulan · reimbursement per kategori · anggaran diklat vs realisasi

**7. Auditor** (ditambah)
- Status rantai Audit Log dan tanggal pemeriksaan terakhir, dengan tombol **Periksa sekarang**
- Perubahan sensitif: gaji, rekening bank, peran admin, koreksi presensi, tarif
- Reset kata sandi dan akun terkunci, run payroll final dan penyesuaian
- **Grafik**: jumlah perubahan data sensitif per minggu

**Chart di layar modul** (di luar Beranda)

| Chart | Layar | Dilihat |
|---|---|---|
| Kehadiran per hari kerja sepanjang periode | Rekap Kehadiran | Manager (tim), Admin HRD (semua) |
| Target vs progress per milestone | On Going Report | Pemilik workblock dan penyetujunya |
| Progress per milestone | Detail Workblock | Pemilik dan atasannya |
| **Perbandingan total run dengan bulan lalu** | Payroll (dan berkas biaya) | Admin Payroll, **Manager KSU & Keuangan (Tahap 3)**, Direksi/Dirut (Tahap 4), Admin Finance (Tahap 5) |
| Grid predikat 5×4 | Predikat JMPD | Pemilik dan penilainya |

**Aturan chart**
- Semua chart mengikuti filter tanggal layar itu, dan bisa diklik menuju rinciannya
- Satu sumbu nilai per chart; tidak pernah dua skala
- Dua warna seri saja (`#2E9B74` dan `#B5730A`) ditambah abu untuk bagian tak terisi; sama di tema terang dan gelap
- Legenda wajib bila ada dua seri atau lebih
- Angka tidak ditulis di tiap batang, melainkan muncul saat disentuh
- Batang bertumpuk hanya bila periodenya memuat ≥ 10 hari kerja; di bawah itu memakai garis
- Nominal Rupiah pada tooltip ditulis penuh
- Chart digambar sebagai **SVG oleh kode sendiri**, tanpa pustaka luar

**8. Super Admin** (ditambah)
- Kesehatan sistem: pekerjaan terjadwal, **backup terakhir yang berhasil**, sisa ruang cakram, ukuran basis data dan folder berkas, **masa berlaku sertifikat TLS**, akun terkunci, perubahan peran admin terbaru
- **Peringatan pemisahan tugas**: daftar orang yang memegang kombinasi peran admin yang saling bertentangan, beserta alasan yang dicatat saat peran itu diberikan

**9. Renbis & serapan anggaran** (Direksi/Dirut, Manager unitnya termasuk Manager KSU, Admin Finance, Admin HRD/Payroll, Auditor)
- **Pagu per kategori per unit per tahun**, dengan **serapan bulanan otomatis dari transaksi**: payroll run → Penggajian; berkas biaya → Diklat & Perjalanan Dinas; reimbursement; tagihan vendor outsource. Bulan yang belum berjalan bisa dilengkapi angka contoh
- Menampilkan **Pagu · Terserap YTD · Sisa · % serapan**, tabel per kategori, tabel per bulan (bulan ini, kumulatif, sisa), dan grafik kumulatif vs pagu
- **Ekspor CSV per bulan** termasuk bulan-bulan sebelumnya, serta ekspor seluruh periode

### 6.13 Audit Log

Setiap perubahan data pegawai, gaji, presensi, pengajuan, payroll, peran, dan pengaturan tercatat: **siapa, kapan, apa, nilai sebelum dan sesudah, alasan**. Audit Log **tidak bisa diubah atau dihapus** — hak `UPDATE` dan `DELETE` dicabut dari role aplikasi dan trigger menolak keduanya, jadi bug di kode tidak cukup untuk melanggarnya. Ia juga **berantai hash**, sehingga perubahan langsung di basis data oleh pemegang `root` tetap terdeteksi. Hanya **Auditor dan Super Admin** yang bisa membacanya.

### 6.14 Tampilan

- **Tata letak mengikuti JM-Click** untuk seluruh aplikasi, bukan hanya modul JMPD:
  - **Bilah atas**: tombol lipat sidebar, kotak pencarian, ikon Feedback, lonceng notifikasi berangka, **tombol tema terang/gelap**, dan foto profil
  - **Sidebar kiri** bergaya UI DPJM sebelumnya: hijau tua penuh, menu per seksi (HARIAN, SAYA, JMPD, PEGAWAI, KEUANGAN, KOMUNIKASI, LAPORAN, SISTEM) dengan angka badge, dan blok profil ala JM-Click (nama, NPP, foto) di atasnya. **Menu yang tidak menjadi hak pengguna tidak muncul**, dan aksinya tetap ditolak server bila dicoba langsung
  - **Isi halaman**: kartu putih bertajuk di atas latar abu-abu, tabel dengan header abu-abu dan *row per pages*, label status berwarna, kartu ringkasan berwarna lembut, dan tombol utama di kanan atas tabel
- **Warna mengikuti tema DPJM**: hijau institusi, netral abu, dan warna makna (merah, kuning, biru, hijau) untuk status. **Terang adalah bawaan**, dan tema gelap dipilih lewat tombol.
- **Di HP**, sidebar menjadi menu burger, ditambah **menu bawah** seperti JM-Click mobile: Beranda · Presensi · Pengajuan · Feedback · Profil.

---

## 7. Keputusan yang sudah diambil (sesi 19 September 2026)

| # | Keputusan | Alasan singkat |
|---|---|---|
| K1 | Acuan utama: brainstorming + SK + Surat Remunerasi + JMPD. PRD/SRS/design v1 hanya sebagai prinsip teknik | Dokumen brainstorming paling baru dan paling lengkap |
| ~~K2~~ | ~~Apps Script + satu Google Spreadsheet sebagai database + Drive~~ | **Dicabut 12 Oktober 2026 → K64.** Kepatuhan data melarang data pegawai berada di Google, dan "tanpa biaya infrastruktur" tidak lagi menjadi alasan karena server kantor sudah ada |
| K3 | Login **NPP atau Email + kata sandi** buatan admin. Tanpa login Google | Pegawai tidak harus punya akun Google Workspace yang sama |
| ~~K4~~ | ~~Tampilan dilayani Apps Script (HtmlService), cadangannya Cloudflare Pages~~ | **Dicabut 12 Oktober 2026 → K64.** Tampilan kini React statis dari Nginx di domain sendiri, tanpa iframe, jadi GPS dan kamera tidak bergantung pada izin pihak lain dan tidak perlu jalur cadangan |
| K5 | Dibangun **4 fase**. Semua pertanyaan diselesaikan dulu | Presensi adalah perubahan kebiasaan dan harus dipakai lebih dulu |
| K6 | Lingkungan **UJI + ASLI** dengan versi identik, backup harian 30 hari **ke luar mesin**, pengembangan dengan **git + migrasi SQL bernomor** | Ada tempat aman untuk mencoba perubahan, dan backup yang tetap ada saat cakram servernya mati |
| K7 | Hak akses = **posisi struktural + peran admin**, dengan aturan pemisahan tugas | Satu orang di organisasi kecil sering memegang dua peran |
| K8 | Assistant Manager dan Specialist **setara Staff** di rantai atasan | Menjaga 4 tingkat seperti brainstorming |
| K9 | **Semua jenis kepegawaian masuk payroll.** Outsource dihitung seperti PKWT | Keputusan pemilik, walau brainstorming mengecualikan Outsource |
| K10 | Semua orang punya akun dan presensi. **Wajib presensi ON/OFF per orang**, dan presensi bisa dikoreksi admin | Fleksibel untuk Direksi dan Dewan Pengawas |
| K11 | **Manager melihat rekap presensi & cuti timnya** (baca saja) | Keputusan pemilik. Menggantikan PRD v1 D20 |
| K12 | Di luar radius → **ditolak, bisa minta tinjauan** HRD | Batas radius tegas, tapi GPS yang meleset masih punya jalan |
| K13 | Terlambat & pulang cepat dipotong per menit, mangkir 480 menit, lupa check-out ditinjau HRD, semuanya disahkan di rekap bulanan | SK Pasal 16 |
| K14 | Titik kantor jamak, dipilih di peta, radius 50/100/200/300 m. Foto hanya saat check-in | — |
| K15 | Foto presensi **disimpan 1 tahun** dan **diperkecil** (720 px, JPEG 0,6) | Keputusan pemilik: hemat penyimpanan |
| K16 | Perjalanan dinas ditetapkan HRD **atau** diajukan pegawai. Selama dinas, presensi **otomatis terhitung** "Hadir – Dinas Luar" | Pegawai dinas tidak perlu check-in dari jauh |
| K17 | Approval = **rantai atasan + kebijakan per jenis** oleh HRD | Pengaju tidak memilih jalurnya sendiri |
| K18 | Saldo cuti reset **1 Januari**. <12 bulan belum berhak. Genap 12 bulan di tengah tahun → **12 hari penuh** | Keputusan pemilik |
| K19 | Aturan cuti mengikuti **Peraturan Perusahaan**. Sampai diterima, isian awal pakai UU | Dokumen belum ada |
| K20 | Cara bayar lembur **diatur per jabatan**, dengan nilai awal SK Pasal 8 ayat 2 | Menyelesaikan pertentangan Pasal 4 dan Pasal 8 SK |
| K21 | Lembur **diajukan setelah dikerjakan** dan dicocokkan dengan presensi. Dibayar **bulan berikutnya** | — |
| K22 | Susulan maksimal 7 hari, oleh HRD, terkunci setelah rekap disahkan | — |
| K23 | Reimbursement: **aturan per kategori per kelompok**, disetujui **Admin Finance saja**, cair bersama payroll | Menggabungkan brainstorming dan Surat Remunerasi |
| K24 | Payroll 5 tahap: HRD → **Admin Payroll** → Manager yang ditunjuk → salah satu Direksi/Dirut → **Admin Finance** *(diperbarui oleh K53)* | Alur dari pemilik. Yang menghitung tidak bisa mencairkan |
| K25 | **PPh 21 ditanggung DPJM tanpa gross-up** | "Sesuai aturan": SK Pasal 17 |
| K26 | **PhDP = 85% × (Gapok + Tunjangan Jabatan)**. DPLK 5% / 10% | Keputusan pemilik |
| K27 | **BPJS mengikuti aturan pemerintah**: bagian pegawai dipotong dari gaji | Dokumen internal tidak mengaturnya |
| K28 | Status khusus SK Pasal 12–15 dihitung **otomatis** | — |
| K29 | File transfer bank berupa **Excel umum** | — |
| K30 | THR, Insentif TW/Tahunan, Bonus = **run terpisah** lewat alur yang sama | — |
| K31 | Gapok & tunjangan **diisi Admin HRD** di Data Pegawai (berversi), dengan usulan Sub Grade dan peringatan rentang | — |
| K32 | Coretax: **ekspor Excel berkolom converter resmi** BPMP, BP21, BPA1 | Tidak menebak format dokumen pajak |
| K33 | KPI **model JMPD** sesuai brainstorming | — |
| K34 | Skala **A–E**, ada **menu evaluasi atasan**, bukti kerja **opsional** tetapi progress **wajib disetujui** | — |
| K35 | Nilai **per workblock**, **dipilih penilai tanpa usulan otomatis**. Staff **final oleh Manager**. *(Bagian "nilai triwulan = rata-rata" digantikan K46)* | — |
| K36 | Notifikasi **aplikasi + email** | — |
| K37 | Template surat berupa **teks di basis data**, disunting lewat layar Template Surat | Mudah diedit HR, tanpa folder yang harus dibagikan ke luar aplikasi |
| K38 | **e-CV perlu** | — |
| K39 | Master data pegawai sesuai template. **Kontak darurat bagian dari Keluarga.** Tanpa golongan darah dan tanpa data pensiun | Keputusan pemilik |
| K40 | **Satu file database** berisi semua modul. Template Excel hanya alat impor sekali pakai | — |
| K41 | Aturan organisasi ditinjau HR **di aplikasi**, bukan di Excel terpisah | Satu sumber |
| K42 | Keluaran tahap ini: dokumen `PRD_final.md`, `SRS_final.md`, `design_final.md`. **Aplikasi belum dibangun** | Keputusan pemilik |
| K43 | **Tata letak persis JM-Click** di seluruh aplikasi. **Warna mengikuti tema DPJM**, dengan tombol terang/gelap | Pegawai sudah terbiasa dengan pola layar kantor pusat. Menggantikan larangan kartu berwarna di rancangan sebelumnya |
| K44 | Menu JMPD lengkap: Workblock, Penilaian Workblock, **Penilaian Akhir Result**, **Penilaian Akhir Behaviour**, **Predikat JMPD**, **Feedback** | Mengikuti JM-Click |
| K45 | Workblock **top-down**: Dirut membuat induk, Direktur dan Manager boleh membuat sendiri. Penugasan ke bawahan langsung menjadi **workblock turunan**. Realisasi **bottom-up** | Keputusan pemilik |
| K46 | Penilaian Akhir Result dan Behaviour **per triwulan**, dipilih atasan. Rata-rata nilai workblock hanya menjadi acuan | Keputusan pemilik |
| K47 | **Predikat otomatis** dari grid JM-Click, dengan R1–R5 diganti A–E | Satu aturan untuk semua penilai |
| K48 | Feedback terlihat oleh pengirim, penerima, dan **rantai atasan penerima** | "Sesuai struktur" |
| K49 | **Survey NPS 360 ditunda** | Keputusan pemilik |
| K50 | Halaman awal = **Beranda/Dashboard** yang memuat presensi, Workblock, dan KPI | Keputusan pemilik |
| K51 | **Prototipe klik dulu** (Fase 0), disetujui pemilik, baru dibangun per fase secara utuh (database + server + layar bersamaan) | Salah paham tampilan murah dibetulkan di prototipe. Membangun seluruh layar dulu lalu menyambungkan database belakangan mengulang kegagalan sistem pendahulu: layar dengan angka karangan dan kolom yang tidak pernah terisi |
| K52 | PRD memuat **checklist penerimaan per fase** (§11). Setiap butir menunjuk ID di SRS | Fase selesai karena terbukti, bukan karena terasa selesai |
| K53 | **Bendahara digabung ke Admin Finance.** Payroll menjadi **5 tahap**: HRD sahkan rekap → Admin Payroll hitung → **Manager yang ditunjuk** → salah satu Direksi/Dirut → **Admin Finance** bayar & terbitkan slip. Finance tidak lagi memverifikasi di tengah alur | Keputusan pemilik. Pemisahan tugas tetap terjaga: Admin Payroll tidak boleh sekaligus Admin Finance |
| K54 | Beranda **berbeda per peran**: fitur, peringatan, aksi cepat, dan grafik untuk tiap peran (§6.12) | Setiap orang melihat pekerjaannya sendiri tanpa perlu mencari menu |
| K55 | User Management menampilkan **9 peran**: Employee, Manager/Atasan, Direksi, Dirut (**otomatis dari jabatan**, tampil tetapi tidak bisa diketik) dan Admin HRD, Admin Payroll, Admin Finance, Auditor, Super Admin (dicentang) | Peran dan jabatan tidak pernah bisa berbeda isi |
| K56 | **Biaya diklat & perjalanan dinas** lewat **5 tahap yang sama dengan payroll**, dengan pola **uang muka + pertanggungjawaban** (tenggat **14 hari kerja**). Kelebihan uang muka dikembalikan dengan cara **pilihan pegawai** (transfer balik atau potong gaji). Master tarif disiapkan kosong. Menggantikan aturan lama "biaya dinas lewat Reimbursement" (bagian dari K23) | Keputusan pemilik |
| K58 | **Toggle `Ikut Payroll`** per orang di Data Pegawai (bawaan Outsource = Tidak) **dan** per run di layar payroll (Tahap 2). Yang dikecualikan tetap terlihat di layar run, dan tetap mendapat baris reimbursement bila ada | Vendor/outsource dibayar lewat tagihan vendor, bukan payroll. Mengecualikan orang harus terlihat, bukan diam-diam |
| K59 | **Triwulan mengikuti tahun kalender**: TW I 1 Jan–31 Mar · TW II 1 Apr–30 Jun · TW III 1 Jul–30 Sep · TW IV 1 Okt–31 Des | Keputusan pemilik |
| K60 | **Tagihan vendor outsource dicatat di aplikasi** secara sederhana dan dibayar Admin Finance | Supaya seluruh biaya SDM terlihat di satu tempat |
| K61 | **Chart digambar sendiri sebagai SVG**, tanpa pustaka luar, dengan dua warna seri dan aturan bentuk yang tetap (§6.12) | Data kecil, warna ikut token tema, dan tidak ada ketergantungan CDN yang bisa hilang |
| K57 | Filter tanggal **4 mode: Harian, Bulanan, Triwulan, Rentang**. Mode Triwulan menjadi bawaan untuk blok JMPD | Penilaian JMPD berjalan per triwulan. Menggantikan aturan rancangan lama yang sengaja tidak menyediakan pilihan triwulan |
| K62 | **PPh 21 gross-up**: gaji bulanan diberi **tunjangan pajak** yang ditambahkan ke bruto dan dihitung iteratif dengan TER; THR ditanggung penuh; PPh atas **insentif/remunerasi kinerja Direksi & Dewan Pengawas** menjadi beban pribadi penerima dan dipotong dari neto (rujuk Surat Remunerasi). Menggantikan K25 | Keputusan pemilik. Pegawai menerima penghasilan utuh, insentif kinerja tetap beban penerima |
| K63 | **Tenggat THR H-14**: THR dibayar paling lambat **14 hari sebelum hari raya**, dengan peringatan bila tanggal bayar kurang dari itu. Menggantikan aturan 7 hari | Keputusan pemilik |

### Keputusan sesi 12–14 Oktober 2026

| Kode | Keputusan | Sebabnya |
|---|---|---|
| K64 | **Pindah ke server milik DPJM**: PostgreSQL 16 + Node 22 + Nginx. Tidak ada layanan Google di jalur data. Menggantikan K2 dan K4 | Empat alasan sekaligus: kepatuhan data pegawai, batas platform Apps Script, server kantor yang sudah ada, dan kebutuhan yang Sheets tidak bisa penuhi (transaksi, kunci baris, kunci asing) |
| K65 | **User Management longgar, bukan kaku.** Kelima peran admin bebas dicentang, kombinasi apa pun boleh — termasuk `admin_payroll`+`admin_finance` — tetapi **wajib beralasan tertulis**, tercatat di Audit Log, dan muncul sebagai peringatan tetap di Beranda Super Admin serta di layar run payroll. Menggantikan USR-06 | Kantor 20 orang. Memaksakan pemisahan tugas membuat pekerjaan macet saat satu orang cuti. Yang dipilih: lubangnya terlihat dan tercatat, bukan tersembunyi |
| K66 | **Rencana Bisnis: pagu + serapan + dashboard.** Anggaran per tahun/kategori/unit, serapan terisi otomatis dari payroll, biaya diklat & dinas, dan reimbursement, dengan grafik pagu vs serapan di Beranda. **Tidak ada** pengajuan/revisi anggaran, **tidak ada** approval anggaran, dan **tidak ada** pemblokiran transaksi yang melampaui pagu | Mencabut non-tujuan "Tidak ada modul Budget". Tabel `anggaran` dan `serapan_anggaran` sudah ada di skema, jadi ini melengkapi yang sudah dirancang, bukan modul baru |
| K67 | **Tagihan vendor outsource bukan menu sendiri.** Ia menjadi bagian di dalam layar Payroll. Tabel `tagihan_vendor` dan seluruh kebutuhan §6.7b tetap berlaku | Outsource tidak masuk payroll engine, tapi pembayarannya satu urusan dengan pencairan bulanan. Menu sendiri membuat Admin Finance berpindah layar tanpa alasan |
| K68 | **UJI di cloud memakai kredit yang sudah dimiliki, ASLI di server kantor**, dengan versi OS/PostgreSQL/Node **identik**. Deploy berhenti bila versinya berbeda | Kredit yang habis tidak menjatuhkan apa pun karena UJI tidak memuat data sungguhan. Sekaligus menghapus halangan nyata: pengembang tidak perlu memasang PostgreSQL di laptopnya |
| K69 | **Notifikasi email dikirim ke alamat email pribadi pegawai, lewat SMTP kantor.** Pengirimnya tetap milik kantor, dan email **tidak pernah melampirkan slip gaji** | Kantor tidak memberi semua orang email kerja. Yang keluar hanya pemberitahuan dengan tautan ke aplikasi, jadi kepatuhan tetap utuh |

---

## 8. Risiko dan ketergantungan

| Risiko | Dampak | Penanganan |
|---|---|---|
| **Server kantor mati, atau listrik/jaringan kantor putus** | Seluruh aplikasi berhenti: tidak ada presensi, tidak ada approval, tidak ada payroll | Risiko **baru** yang dulu ditanggung Google. Penanganan: backup harian ke luar mesin, runbook pemulihan yang **pernah benar-benar diuji** (NFR-12), dan cara mundur manual untuk presensi selama gangguan. Yang paling berbahaya: server mati Jumat sore sementara payroll harus final Senin |
| ~~Google mengubah izin iframe Apps Script lagi~~ | — | **Hilang.** Tidak ada lagi iframe Apps Script, jadi GPS dan kamera tidak bergantung pada atribut `allow` milik Google. Uji di Android dan iPhone tetap wajib, tapi sekarang untuk alasan biasa |
| Koordinat GPS bisa dipalsukan aplikasi lokasi tiruan | Presensi palsu | Foto check-in wajib. GPS diperlakukan sebagai bukti pendukung, bukan bukti mutlak |
| **Tidak ada yang menambal sistem operasi dan PostgreSQL** | Lubang keamanan terbuka berbulan-bulan pada mesin yang memuat gaji, NIK, dan NPWP 20 orang | Risiko **baru**, pengganti risiko kuota. Penanganan: pembaruan keamanan otomatis, dan **satu orang di kantor ditunjuk bertanggung jawab atas mesin itu**. Tanpa orang yang ditunjuk, risiko ini tidak tertangani — dan menuliskannya di sini tidak menanganinya |
| **Sertifikat TLS kedaluwarsa** | Browser menolak membuka aplikasi; 20 orang berhenti bekerja serentak | Pembaruan otomatis, ditambah pemantauan yang memperingatkan 20 hari sebelum kedaluwarsa. Kegagalan jenis ini selalu terjadi di hari yang paling tidak diinginkan |
| **Kredit cloud untuk UJI habis atau kedaluwarsa** | Lingkungan uji hilang, lalu perubahan masuk ke ASLI tanpa diuji | Dampaknya sengaja dibuat kecil: UJI tidak memuat data sungguhan dan tidak dipakai pegawai. Bila kredit habis, UJI pindah ke mesin lain atau dihidupkan hanya saat dipakai |
| ~~Kuota Apps Script akun Gmail~~ (±100 email/hari, 6 menit/eksekusi, 90 menit trigger/hari) | — | **Hilang.** Tidak ada lagi kuota platform. Email lewat SMTP kantor, dan pekerjaan terjadwal dibatasi hanya oleh mesinnya sendiri |
| ~~Satu akun Google pemilik jadi titik kegagalan tunggal~~ | — | **Hilang, tapi digantikan.** Titik kegagalan tunggalnya sekarang server kantor — baris pertama tabel ini |
| Pemegang akses `root` bisa mengubah tabel langsung | Integritas data | Audit Log berantai hash, **ditambah** `REVOKE UPDATE` dan trigger penolak, sehingga role aplikasi tidak bisa mengubahnya — bug di kode tidak lagi cukup untuk merusaknya. Terhadap `root` sendiri, rantai hash membuat perubahan **terdeteksi, bukan mustahil**. Auditor menjalankan pemeriksaan rantai |
| Aturan pajak & BPJS salah dihitung | Pegawai menerima uang yang salah | Keuangan menghitung 4–5 contoh dengan tangan, lalu angkanya dikunci sebagai tes otomatis |
| Peraturan Perusahaan belum diterima | Aturan cuti & plafon reimbursement Pegawai belum pasti | Semuanya master data yang bisa diubah HR tanpa mengubah kode |
| ~~Penyimpanan sesi di iPhone (Safari) dibersihkan setelah 7 hari tidak dibuka~~ | — | **Hilang.** Batas 7 hari Safari mengenai `localStorage` dan cookie yang dipasang skrip. Sesi kini cookie **HttpOnly** yang dipasang server, dan tidak terkena batas itu. "Ingat perangkat 30 hari" jadi benar-benar 30 hari |

## 9. Yang menunggu masukan

| Hal | Dari | Dampak bila tertunda |
|---|---|---|
| Peraturan Perusahaan (bagian cuti, Cuti Besar, cuti bersama, plafon reimbursement Pegawai) | Pemilik / HR | Isian awal memakai UU dan brainstorming, lalu disesuaikan HR di Pengaturan. Kelayakan THR sementara memakai aturan bawaan (masa kerja ≥ 1 bulan) sampai PP terbit |
| 3 file converter Coretax (BPMP v.3, BP21 v.4, BPA1) di `referensi/coretax/` | Pemilik | Ekspor Coretax (Fase 3) tidak dibangun sampai file ada |
| 4–5 contoh perhitungan slip manual (berbagai PTKP, satu Direksi, satu Dewan Pengawas) | Keuangan | Modul payroll tidak dianggap selesai tanpa fixture ini |
| Hasil uji `uji_apps_script` di HP Android dan iPhone | Pemilik | Konfirmasi akhir K4 sebelum Fase 1 dipakai |
| Jadwal THR — **diputuskan: serentak**, satu tanggal bayar per run | Pemilik / HR | Peringatan bila tanggal bayar kurang dari **H-14 (14 hari sebelum hari raya)**. Opsi per agama menyusul, menunggu permintaan HR (butuh data agama pegawai + master hari raya per agama) |
| Pegawai yang masuk di tengah bulan: gaji bulan pertama diprorata atau penuh | Pemilik / Keuangan | Bawaan: prorata hari kalender |
| Batas upah JP dan kelas risiko JKK yang berlaku 2026 | Keuangan | Diisi di tabel tarif sebelum Fase 3 |
| Nomor surat otomatis dan arsip surat keluar | Pemilik | Tempatnya disiapkan, fiturnya belum dibangun |
| Survey NPS 360: pertanyaan, responden, anonimitas | Pemilik | Penilaian Behaviour berjalan tanpa skor NPS |
| Tarif uang harian, transport, dan penginapan perjalanan dinas | Pemilik / Finance | Master tarif kosong; Admin Payroll mengisi nominal manual dengan keterangan |

## 10. Ukuran keberhasilan

1. **18 dari 20 orang check-in lewat aplikasi tanpa dibantu** selama empat minggu berturut-turut.
2. Slip gaji periode mana pun bisa dicetak ulang **identik** enam bulan kemudian, walaupun gaji sudah naik.
3. Hasil hitung payroll **sama persis** dengan contoh hitungan manual Keuangan.
4. **Tidak ada angka di layar yang tidak berasal dari database.**
5. Orang lain bisa memulihkan aplikasi dari backup dengan mengikuti runbook, tanpa bertanya kepada pemilik.
6. Pemeriksaan rantai hash Audit Log oleh Auditor selalu utuh.

---

## 11. Checklist penerimaan per fase (UAT)

Fase dianggap selesai **hanya bila semua butirnya tercentang**: diuji di lingkungan UJI, lalu diulang singkat di ASLI. Kolom *Ref* menunjuk ID kebutuhan di `SRS_final.md`. Butir yang gagal dicatat beserta tanggal perbaikannya, bukan dihapus.

### Fase 0 — Prototipe
| ✓ | Butir | Ref |
|---|---|---|
| ☐ | Prototipe klik disetujui pemilik untuk: Beranda, Presensi (HP), Pengajuan, Approval, Data Pegawai, User Management, Payroll, Slip Gaji, JMPD (Workblock, On Going Report, Penilaian, Predikat, Feedback), Pengaturan | K51 |
| ☐ | Tata letak mengikuti JM-Click, warna tema DPJM, tombol terang/gelap berfungsi | UI-01 – UI-08 |
| ☐ | Uji `uji_apps_script` lolos di minimal satu HP Android dan satu iPhone (GPS + foto) | design §2.2 |

### Fase 1 — Fondasi & harian
| ✓ | Butir | Ref |
|---|---|---|
| ☐ | Login dengan NPP dan dengan email; pesan gagal selalu sama; terkunci 15 menit setelah 5 gagal; wajib ganti sandi saat login pertama | AUTH-01, 02, 05, 06 |
| ☐ | Reset sandi oleh HRD tercatat di Audit Log tanpa kata sandinya | AUTH-08, 09 |
| ☐ | Setiap aksi server ditolak tanpa token dan tanpa izin. Tes akses per peran semuanya lulus | AUTH-10, OTZ-01 – 09 |
| ☐ | Kombinasi peran terlarang ditolak; super admin terakhir tidak bisa dicabut | USR-06, USR-10 |
| ☐ | Pegawai tanpa akun tampil di User Management dan bisa dibuatkan akun sekaligus | USR-02 |
| ☐ | Impor template 20 orang: satu baris salah membatalkan semua, dengan laporan baris gagal | EMP-17, 18 |
| ☐ | Kenaikan gaji membuat versi baru, dan versi lama tetap ada. Peringatan rentang Grade muncul | EMP-07, 08 |
| ☐ | e-CV PDF rapi, termasuk untuk pegawai tanpa foto | EMP-15 |
| ☐ | Check-in dengan GPS + foto; foto ≤ 120 KB; tanggal WIB benar untuk check-in pukul 00.30 dan 06.30 | ATT-01, 03, 06 |
| ☐ | Di luar radius ditolak dengan jaraknya; bypass GPS mencatat koordinat; akurasi > 200 m diminta ulang | LOC-06, 08, ATT-15 |
| ☐ | Koreksi HRD wajib beralasan dan terlihat di rekap | ATT-12 |
| ☐ | Audit Log tercatat untuk setiap perubahan; mengubah satu sel Audit Log langsung di Sheets terdeteksi oleh "Periksa rantai" | AUD-01 – 06 |
| ☐ | Backup harian berjalan, dan satu kali pemulihan berhasil dicoba | NFR-12 |
| ☐ | Semua layar tanpa gulir samping di lebar 360 dan 390 px; menu bawah muncul di HP | NFR-03, UI-07 |
| ☐ | **18 dari 20 orang check-in mandiri selama 4 minggu berturut-turut** | §10 butir 1 |

### Fase 2 — Pengajuan
| ✓ | Butir | Ref |
|---|---|---|
| ☐ | Kebijakan approval per jenis bisa diubah HRD; jalur pengajuan lama tidak ikut berubah | APR-01, 03 |
| ☐ | Penolakan tanpa alasan ditolak; tidak bisa menyetujui pengajuan sendiri | APR-06, OTZ-09 |
| ☐ | Saldo cuti: < 12 bulan = 0; genap 12 bulan = 12 hari penuh; reset 1 Januari; saldo awal terhitung | LV-02, 03 |
| ☐ | Cuti melebihi saldo atau bertabrakan tanggal ditolak sebelum sampai ke penyetuju | LV-06, 07 |
| ☐ | Lembur dicocokkan dengan jam check-out; batas 4 jam/hari dan 18 jam/minggu diterapkan | OT-02, 03 |
| ☐ | Dinas yang ditetapkan HRD membuat hari-harinya tercatat "Hadir – Dinas Luar" | TRV-03 |
| ☐ | Susulan > 7 hari atau setelah rekap disahkan ditolak | SUS-02 |
| ☐ | Tinjauan luar radius yang disetujui memakai waktu dan koordinat asli | LOC-07 |
| ☐ | Rekap bulanan: contoh gapok Rp3.090.000 + 30 menit terlambat = potongan Rp2.600; setelah disahkan, periode terkunci | REK-03, 05 |
| ☐ | Manager melihat presensi dan cuti timnya, tetapi tidak bisa melihat gaji mereka | OTZ-03 |
| ☐ | Notifikasi: pegawai A mengajukan cuti → atasan A menerima notifikasi di aplikasi dan email | NOT-01, 03 |

### Fase 3 — Uang
| ✓ | Butir | Ref |
|---|---|---|
| ☐ | Reimbursement: tanpa lampiran tidak bisa dikirim; syarat masa kerja dan plafon diperiksa; disetujui Admin Finance | RB-01, 04, 05, 06 |
| ☐ | Klaim yang disetujui setelah run dihitung tidak masuk run itu | RB-08 |
| ☐ | Run melewati 5 tahap; token Admin Payroll ditolak untuk tahap 3–5; satu orang tidak bisa menyetujui dua tahap; pengembalian wajib beralasan | PAY-03 – 06a |
| ☐ | **Semua fixture hitungan manual Keuangan lulus tanpa selisih** | PAY-23 |
| ☐ | Contoh angka: lembur 2 jam = Rp92.800; DPLK = Rp195.075 | OT-07, PAY-18 |
| ☐ | Slip Januari tetap identik setelah gaji dinaikkan di Maret | PAY-09 |
| ☐ | Pegawai membuka dan mencetak slip 12 periode ke belakang | PAY-10 |
| ☐ | File transfer Excel: total = total neto run | PAY-27 |
| ☐ | Run THR, insentif, bonus, dan penyesuaian berjalan lewat alur yang sama | PAY-25, 26 |
| ☐ | Rekap PPh 21 & BPJS; ekspor Coretax sesuai converter (bila file converter sudah diterima) | PAY-28, 29 |
| ☐ | Toggle Ikut Payroll: Outsource tidak ikut dihitung, daftar yang dikecualikan tampil di layar run, dan orang yang dikecualikan tetap mendapat baris reimbursement bila ada | PAY-01a, PAY-32 |
| ☐ | Tagihan vendor dicatat, diverifikasi, dan dibayar Admin Finance, lalu muncul di laporan biaya SDM | TGV-01 – 05 |
| ☐ | Uang muka dinas dan diklat melewati 5 tahap dan ditransfer sebelum berangkat | BIA-01 – 05 |
| ☐ | Pertanggungjawaban dengan bukti per komponen; pengingat tenggat 14 hari kerja; kekurangan dibayar; kelebihan lewat transfer balik atau potong gaji sesuai pilihan pegawai | BIA-06 – 10 |

### Fase 4 — Kinerja & pelengkap
| ✓ | Butir | Ref |
|---|---|---|
| ☐ | Hanya Dirut, Direktur, dan Manager bisa membuat workblock; total bobot dan sub-bobot harus 100% | KPI-01, 03 |
| ☐ | Karyawan yang bisa ditugaskan hanya bawahan langsung; workblock turunan `X.n` otomatis muncul dengan *Assigned From* | KPI-04, 07 |
| ☐ | Laporan progress yang disetujui menaikkan progress sampai Workblock Induk | KPI-14, 15 |
| ☐ | Penilaian workblock A–E; Penilaian Akhir Result dan Behaviour per triwulan | KPI-18, 20, 21 |
| ☐ | Predikat: B + Role Model = Exceed; D + Below Average = Unsatisfactory; A + Guardian = Exceptional | KPI-23 |
| ☐ | Feedback tidak bisa dibaca rekan penerima yang bukan pengirim atau atasannya | FB-02 |
| ☐ | Diklat selesai otomatis masuk Riwayat Diklat | TR-03 |
| ☐ | 7 report + ekspor fleksibel; toggle Direksi & Dewas mati secara default | RPT-01, 03, 04 |
| ☐ | Pengumuman hanya sampai ke sasarannya; template surat dengan variabel salah ditolak saat didaftarkan | ANN-02, LET-02 |
| ☐ | Beranda tiap peran menampilkan fitur dan grafiknya sendiri; filter Harian/Bulanan/Triwulan/Rentang mengubah semua angka dan grafik | DSH-04, DSH-05, DSH-07 – 15 |
| ☐ | Runbook berhasil diikuti oleh orang selain penulisnya | NFR-17 |

---

## 12. Lampiran: menu dan fitur per peran

Daftar ini menjadi acuan layar. Menu yang tidak tercantum untuk sebuah peran **tidak ditampilkan**, dan aksinya tetap ditolak server bila dicoba langsung (aturan tampil per menu ada di `design_final.md` §10.3).

### 12.1 Employee — semua orang, termasuk Dewan Pengawas
| Menu | Fitur |
|---|---|
| Beranda | Presensi hari ini · aksi cepat · status pengajuan · saldo cuti · daftar sisa plafon · perjalanan dinas saya · kartu Individual Workblock Performance · predikat · pengumuman |
| Presensi | Check-in (GPS + foto) · check-out · riwayat presensi saya · ajukan presensi susulan · ajukan tinjauan bila di luar radius |
| Cuti | Lihat saldo · ajukan cuti (jenis, tanggal, alasan, lampiran) · batalkan sebelum disetujui · riwayat & status |
| Lembur | Ajukan lembur · lihat jam diajukan vs jam diakui · riwayat & status |
| Perjalanan Dinas | Ajukan dinas · lihat dinas yang ditetapkan HRD · status |
| Uang Muka & Pertanggungjawaban | Lihat status uang muka · kirim pertanggungjawaban + bukti per komponen · pilih cara pengembalian kelebihan · lihat tenggat |
| Reimbursement | Ajukan klaim + lampiran wajib · lihat sisa plafon dan kelayakan · status bayar |
| Slip Gaji | Buka 12 periode terakhir · cetak PDF |
| Profil & e-CV | Lihat data · ajukan perubahan + lampiran · unggah dokumen & foto · cetak e-CV · riwayat perubahan |
| JMPD | Lihat workblock turunan · isi On Going Report · View History · lihat nilai & predikat · kirim dan baca feedback |
| Pengumuman · Notifikasi · Ubah Kata Sandi | Baca & tandai dibaca · atur email per jenis · ganti kata sandi |

**Tidak bisa:** membuat workblock, melihat data orang lain, menyetujui apa pun.

### 12.2 Manager / Atasan — Employee ditambah
| Menu | Fitur |
|---|---|
| Approval | Pengajuan tim (cuti, lembur, dinas) · setujui/tolak dengan alasan wajib · detail (mis. jam lembur yang diakui) |
| Rekap Kehadiran (tim) | Rekap per anggota unit · filter periode · ekspor |
| JMPD | Buat workblock · Show Milestones & bagi ke Staff · ajukan ke atasan · Edit / Cancel Submission · setujui laporan progress · nilai workblock A–E · Penilaian Akhir Result & Behaviour · predikat tim |
| Payroll & Biaya *(Manager KSU & Keuangan)* | Lihat run/berkas di Tahap 3 · setujui atau kembalikan dengan alasan |

**Tidak bisa:** data pegawai, gaji, pengaturan, Audit Log.

### 12.3 Direksi / Direktur — Manager ditambah
| Menu | Fitur |
|---|---|
| Approval | Pengajuan Manager binaannya |
| JMPD | Buat workblock level Direktur & bagi ke Manager · setujui workblock Manager · nilai Manager · predikat unit binaan |
| Payroll & Biaya | Tahap 4: sahkan atau kembalikan |
| Beranda | Ringkasan unit binaan dan biaya SDM |

### 12.4 Dirut — Direksi ditambah
| Menu | Fitur |
|---|---|
| JMPD | **Workblock Induk** · bagi ke Direktur dan Manager KMR/Internal Audit · nilai Direktur dan Manager KMR/IA |
| Approval | Pengajuan Direktur |
| Payroll & Biaya | Tahap 4 (cukup salah satu Direksi/Dirut) |

### 12.5 Admin HRD — Employee ditambah
| Menu | Fitur |
|---|---|
| Data Pegawai | Tambah/ubah · impor Excel · gaji & tunjangan berversi · keluarga, pendidikan, riwayat, sertifikasi · dokumen · ubah status pegawai |
| Presensi | Rekap semua pegawai · koreksi (alasan wajib) · **sahkan rekap bulanan (Tahap 1)** · titik kantor lewat peta · jam kerja · hari libur |
| Approval | Langkah HRD semua jenis + presensi susulan + tinjauan luar radius + perubahan profil |
| Perjalanan Dinas & Diklat | Tetapkan dinas · master diklat & peserta · **buat berkas biaya (Tahap 1)** |
| Payroll → bagian **Tagihan Vendor** | Catat tagihan vendor outsource + lampiran invoice. **Bukan menu sendiri** (K67) |
| Pengumuman · Template Surat | Buat, tujukan ke sasaran, cetak PDF |
| Pengaturan | Unit, jabatan, grade, komponen gaji, jenis cuti, kategori, kebijakan approval |
| User Management | Buat akun · reset sandi · aktif/nonaktif · buka kunci · paksa keluar |
| Report | Tujuh report inti + ekspor fleksibel |

**Tidak bisa:** Audit Log, mengatur peran admin, menghitung atau membayar gaji.

### 12.6 Admin Payroll — Employee ditambah
| Menu | Fitur |
|---|---|
| Payroll | Buat run (bulanan, THR, insentif TW, insentif tahunan, bonus, penyesuaian) · **hitung semua orang (Tahap 2)** · lihat slip & rincian · input atau impor insentif/bonus · ajukan ke Tahap 3 · lihat pengembalian & alasannya · hitung ulang |
| Biaya Diklat & Dinas | Isi rincian dan tarif (Tahap 2) · hitung selisih pertanggungjawaban |
| Gaji Pokok | Baca saja |
| Report | Payroll, pajak & BPJS |

**Tidak bisa:** membayar, mengubah data pegawai, menyetujui tahap lain.

### 12.7 Admin Finance — Employee ditambah
| Menu | Fitur |
|---|---|
| Verifikasi Reimbursement | Setujui, tolak, atau setujui dengan nominal lebih kecil + alasan |
| Payroll Tahap 5 | Unduh file transfer Excel · catat tanggal bayar & bukti · **terbitkan slip** · kembalikan dengan alasan |
| Biaya Tahap 5 | Transfer uang muka dan kekurangan · catat bukti · konfirmasi pengembalian kelebihan |
| Payroll → bagian **Tagihan Vendor** | Verifikasi, bayar, catat bukti bayar, atau kembalikan dengan alasan. **Bukan menu sendiri** (K67) |
| Pengaturan (sebagian) | Kategori & plafon reimbursement · **tarif dinas** · **anggaran diklat** per tahun |
| Report | Keuangan |

**Tidak bisa:** menghitung payroll, mengubah data pegawai.

### 12.8 Auditor — Employee ditambah
| Menu | Fitur |
|---|---|
| Audit Log | Baca · filter per modul, tanggal, pelaku, pegawai · **periksa rantai hash** · ekspor |
| Report | Semua report, baca saja |

**Tidak bisa:** menulis apa pun.

### 12.9 Super Admin — Employee ditambah
| Menu | Fitur |
|---|---|
| User Management | **Atur peran admin** (5 peran, dengan pemeriksaan pemisahan tugas) |
| Pengaturan sistem | Tarif PPh 21, BPJS, dan UMP (berversi) · pengaturan umum |
| Audit Log | Baca dan periksa rantai |
| Kesehatan sistem | Status pekerjaan terjadwal, backup, kuota email |
| Penyetuju cadangan | Bila penyetuju yang seharusnya adalah pengaju sendiri |

**Tidak bisa:** mengubah run payroll yang sudah final.
