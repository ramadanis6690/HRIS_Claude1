# SRS Final — HRIS Dana Pensiun Jasa Marga (DPJM)

**Tanggal:** 19 September 2026
**Mengacu pada:** `PRD_final.md` (keputusan K1–K57, checklist §11) · `design_final.md`
**Aturan penulisan:** setiap kebutuhan harus **bisa diuji**. Kalau sebuah baris tidak bisa dijadikan tes, ia belum selesai ditulis.

Penanda: **[W]** wajib · **[S]** sebaiknya · **[T]** tertunda menunggu masukan luar
Kolom **Fase** menunjukkan kapan kebutuhan dibangun (1–4, lihat PRD §5).

Istilah:
- **Server** = satu proses Node di server DPJM, dijalankan systemd sebagai pengguna `hris`
- **Database** = PostgreSQL di mesin yang sama, hanya mendengar di localhost
- **Pengguna** = orang yang login
- **Pegawai** = baris di tab `Pegawai`, termasuk Direksi dan Dewan Pengawas

---

## 1. Autentikasi dan sesi

| ID | Fase | Kebutuhan |
|---|---|---|
| AUTH-01 | 1 | **[W]** Pengguna masuk dengan **NPP atau email** ditambah kata sandi. Keduanya menunjuk akun yang sama. |
| AUTH-02 | 1 | **[W]** Pesan gagal login selalu *"Username atau kata sandi salah."*, apa pun penyebabnya (username tidak ada, kata sandi salah, atau akun nonaktif). |
| AUTH-03 | 1 | **[W]** Kata sandi disimpan sebagai hash **argon2id**. Tidak ada kolom `salt` dan tidak ada kunci rahasia tambahan: satu nilai `hash_sandi` memuat algoritma, parameter biaya, salt, dan hash sekaligus. **Diuji dengan:** membaca tabel `pengguna` dan memastikan tidak ada kolom yang memuat kata sandi asli. |
| AUTH-04 | 1 | **[W]** Kata sandi minimal 8 karakter dan mengandung huruf serta angka. |
| AUTH-05 | 1 | **[W]** Setelah **5 kali gagal** berturut-turut, akun terkunci **15 menit**. Login yang berhasil mengembalikan hitungan ke 0. |
| AUTH-06 | 1 | **[W]** Akun dengan tanda *wajib ganti sandi* hanya bisa membuka layar ganti kata sandi sampai kata sandinya diganti. Server menolak semua panggilan lain dari sesi itu. |
| AUTH-07 | 1 | **[W]** Pengguna bisa mengganti kata sandinya sendiri dengan memasukkan kata sandi lama. |
| AUTH-08 | 1 | **[W]** Admin HRD dan Super Admin bisa mereset kata sandi pengguna lain. Hasilnya kata sandi sementara yang **ditampilkan sekali** ke admin, dengan tanda *wajib ganti sandi*. |
| AUTH-09 | 1 | **[W]** Setiap reset tercatat di Audit Log (pelaku, akun sasaran, waktu). **Kata sandi tidak pernah muncul** di Audit Log, log eksekusi, maupun email. |
| AUTH-10 | 1 | **[W]** Setiap panggilan server (kecuali `login`) membawa token sesi. Server memvalidasi token **sebelum** menjalankan apa pun. **Diuji dengan:** memanggil setiap fungsi publik tanpa token dan dengan token palsu; semuanya harus ditolak. |
| AUTH-11 | 1 | **[W]** Sesi berakhir setelah **8 jam tanpa aktivitas**. Dengan **"Ingat perangkat ini"**, sesi berlaku **30 hari**. Tidak dicentang adalah nilai awal. |
| AUTH-12 | 1 | **[W]** Menonaktifkan akun atau pegawai **mencabut semua sesinya**. Panggilan berikutnya ditolak, bukan hanya menunya yang hilang. |
| AUTH-13 | 1 | **[W]** Token dikirim ke browser sebagai cookie **HttpOnly + Secure + SameSite=Lax**, tidak pernah `localStorage` — JavaScript tidak bisa menyentuhnya, sehingga XSS tidak bisa mencuri sesi. Di server token disimpan hanya sebagai SHA-256, sehingga orang yang membaca tabel `sesi` tidak bisa memakainya. |
| AUTH-14 | 1 | **[W]** Tombol perlihatkan kata sandi tersedia di kolom kata sandi dan nonaktif secara default. |
| AUTH-15 | 1 | **[W]** Tombol **Keluar** mencabut sesi di server, bukan hanya menghapus token di browser. |

## 2. User Management dan peran

| ID | Fase | Kebutuhan |
|---|---|---|
| USR-01 | 1 | **[W]** Setiap akun menunjuk **tepat satu** baris pegawai. Tidak ada akun tanpa pegawai. |
| USR-02 | 1 | **[W]** Layar User Management menampilkan **pegawai aktif yang belum punya akun**, dihitung ulang setiap kali layar dibuka, dengan tombol "Buatkan akun" per baris dan tombol massal. |
| USR-03 | 1 | **[W]** NPP dan email akun **diambil dari data pegawai**, tidak diketik bebas. Nama, jabatan, dan unit tidak bisa diubah dari User Management. |
| USR-04 | 1 | **[W]** User Management menampilkan **9 peran** dalam satu daftar. Empat peran struktural, yaitu `employee`, `manager` (Manager/Atasan), `direksi`, dan `dirut`, **terisi otomatis dari jabatan**, tampil sebagai label hanya-baca, dan berubah hanya bila jabatan diubah di Data Pegawai. Dewan Pengawas berperan `employee`. |
| USR-05 | 1 | **[W]** Lima peran admin dicentang: `super_admin`, `admin_hrd`, `admin_payroll`, `admin_finance`, `auditor`. Satu orang boleh memegang lebih dari satu. Tugas bendahara termasuk dalam `admin_finance`. |
| USR-06 | 1 | **[W]** Kombinasi peran admin **tidak dibatasi** (K65). Kombinasi yang melemahkan pemisahan tugas — `admin_payroll`+`admin_finance` dan `auditor`+peran admin lain — **boleh disimpan dengan alasan tertulis wajib**, tercatat di Audit Log beserta siapa yang memberikannya. **Diuji dengan:** menyimpan kombinasi itu tanpa alasan (ditolak), lalu dengan alasan (diterima, dan alasannya terbaca di Audit Log). |
| USR-06a | 1 | **[W]** Setiap pemegang kombinasi bertentangan muncul sebagai **peringatan tetap** di dua tempat: Beranda Super Admin, dan layar run payroll pada tahap yang orang itu pegang. Peringatan menyebutkan nama, kombinasinya, dan alasan yang dicatat — bukan sekadar ikon. **Diuji dengan:** memberi satu orang `admin_payroll`+`admin_finance`, lalu memastikan peringatannya tampil di kedua layar. |
| USR-06b | 1 | **[W]** Khusus `admin_payroll`+`admin_finance`, layar run payroll menyebutkan akibatnya secara eksplisit: orang itu dapat **menghitung payroll pada Tahap 2 dan mencairkannya pada Tahap 5**. Pemisahan tugas pada Tahap 3–4 tetap ditegakkan basis data (PAY-06a), tetapi kombinasi ini **tidak** tercakup olehnya, karena `hitung` dan `terbitkan` bukan aksi `setuju`. Keterbatasan ini ditulis apa adanya di layar, bukan disembunyikan. |
| USR-07 | 1 | **[W]** Hanya `super_admin` yang bisa memberi atau mencabut peran admin. Setiap perubahan peran tercatat di Audit Log. |
| USR-08 | 1 | **[W]** Menonaktifkan akun **tidak menghapus** baris pegawai maupun presensi, pengajuan, dan slip lamanya. |
| USR-09 | 1 | **[W]** Pegawai berstatus *Berhenti* atau *Meninggal Dunia* otomatis nonaktif pada hari setelah tanggal berhentinya (lewat pekerjaan terjadwal harian). |
| USR-10 | 1 | **[W]** Minimal harus selalu ada satu `super_admin` aktif. Server menolak pencabutan `super_admin` terakhir. |

## 3. Otorisasi

| ID | Fase | Kebutuhan |
|---|---|---|
| OTZ-01 | 1 | **[W]** Setiap fungsi server menyatakan **izin yang dibutuhkannya**, dan pemeriksaan izin dilakukan di server. Menyembunyikan menu bukan pengaman. **Diuji dengan:** memanggil fungsi admin memakai token pegawai biasa; harus ditolak. |
| OTZ-02 | 1 | **[W]** Pegawai hanya bisa membaca **data miliknya sendiri**, kecuali izinnya menyatakan lain. **Diuji dengan:** token pegawai A meminta data pegawai B lewat setiap fungsi baca; semuanya ditolak atau kosong. |
| OTZ-03 | 1 | **[W]** Manager bisa membaca **rekap presensi dan cuti** anggota unitnya (baca saja), tetapi **tidak** data gaji mereka. |
| OTZ-04 | 1 | **[W]** Data gaji dan slip hanya bisa dibaca oleh: pegawai ybs, `admin_hrd`, `admin_payroll`, `admin_finance`, serta pihak yang **sedang memegang tahap verifikasi** run tersebut (Manager KSU & Keuangan di Tahap 3, Direksi/Dirut di Tahap 4), **hanya untuk run itu**. |
| OTZ-05 | 1 | **[W]** `admin_hrd` **tidak bisa membaca Audit Log**. Ditolak oleh server, bukan hanya oleh menu. |
| OTZ-06 | 1 | **[W]** `auditor` bisa membaca Audit Log dan semua report, tetapi **tidak bisa menulis apa pun**. **Diuji dengan:** memanggil setiap fungsi tulis memakai token auditor. |
| OTZ-07 | 1 | **[W]** Scan dokumen dan foto profil hanya bisa dibuka pegawai ybs dan `admin_hrd`. Foto presensi hanya bisa dibuka pegawai ybs, `admin_hrd`, dan Manager unitnya. |
| OTZ-08 | 1 | **[W]** Berkas di Drive **tidak pernah dibagikan** ke akun lain. Berkas dikirim ke browser lewat server setelah pemeriksaan izin. |
| OTZ-09 | 1 | **[W]** Penyetuju tidak bisa menyetujui pengajuannya sendiri. |

## 4. Data pegawai dan profil

| ID | Fase | Kebutuhan |
|---|---|---|
| EMP-01 | 1 | **[W]** Tab `Pegawai` adalah **satu-satunya** sumber identitas pegawai. Tab lain hanya merujuk `pegawai_id`. |
| EMP-02 | 1 | **[W]** NPP unik, email unik, dan NIK tepat 16 digit angka. Penyimpanan yang melanggar ditolak dengan pesan di kolom yang salah. |
| EMP-03 | 1 | **[W]** **Jenis Kepegawaian** ∈ {PKWTT, PKWT, Penugasan, Outsource, Direksi, Dewan Pengawas} dan **Status Pegawai** adalah dua kolom terpisah. |
| EMP-04 | 1 | **[W]** Perubahan Status Pegawai disimpan sebagai riwayat dengan tanggal mulai (tab `RiwayatStatus`). Baris lama tidak ditimpa. |
| EMP-05 | 1 | **[W]** Pegawai berstatus *Bebas Tugas – Ditahan* wajib punya jumlah tanggungan, dihitung dari Keluarga yang *Ditanggung = Ya*. |
| EMP-06 | 1 | **[W]** Masa kerja ditampilkan "X tahun Y bulan", **dihitung** dari tanggal masa kerja diakui (bila ada) atau tanggal masuk. Tidak ada kolom masa kerja yang diketik. |
| EMP-07 | 1 | **[W]** Gaji berversi (tab `Gaji`): menambah nominal baru **menutup** versi lama (mengisi `berlaku_sampai`) dan **membuka** versi baru. Tidak ada fungsi yang mengubah nominal lama. **Diuji dengan:** menaikkan gapok, lalu memastikan baris lama tetap ada dengan nominal lamanya. |
| EMP-08 | 1 | **[W]** Saat gapok PKWTT disimpan, sistem menampilkan **usulan Sub Grade** dari masa kerja dan **peringatan** bila nominal di luar rentang Minimum–Maksimum tabel Grade. Peringatan tidak memblokir penyimpanan. |
| EMP-09 | 1 | **[W]** Keluarga bisa lebih dari satu baris. Setiap pegawai aktif punya **minimal satu** baris *Kontak Darurat = Ya* dengan nomor HP. Kekurangannya ditampilkan di daftar *Perlu tindakan* HRD. |
| EMP-10 | 1 | **[W]** Pendidikan, Riwayat Pekerjaan, Riwayat Diklat, dan Sertifikasi disimpan sebagai tabel, bukan teks bebas. |
| EMP-11 | 2 | **[W]** Perubahan profil oleh pegawai masuk sebagai **pengajuan** (`perubahan_profil`). Nilai baru baru berlaku setelah disetujui. |
| EMP-12 | 2 | **[W]** Pengajuan perubahan **rekening bank atau NIK** tidak bisa dikirim tanpa lampiran bukti. |
| EMP-13 | 2 | **[W]** Riwayat perubahan profil (nilai lama → baru, siapa menyetujui, kapan) bisa dilihat pegawai ybs dan HRD. |
| EMP-14 | 1 | **[W]** Foto profil rasio 3:4, maksimal 2 MB setelah dikompres di browser, disimpan terpisah dari foto presensi dan **tidak ikut** penghapusan 1 tahun. |
| EMP-15 | 1 | **[W]** e-CV dicetak sebagai PDF. Pegawai tanpa foto mendapat kotak bertanda "Tanpa foto". Kolom kosong ditulis **"Belum diisi"**, tidak pernah tanda "-". |
| EMP-16 | 1 | **[W]** Pengingat ke Admin HRD: kontrak berakhir **30 hari** sebelumnya, dan sertifikat kedaluwarsa **60 hari** sebelumnya. |
| EMP-17 | 1 | **[W]** Impor Excel memakai susunan tab dan kolom `Template_Data_Pegawai_DPJM.xlsx`, menampilkan pratinjau, dan melaporkan **setiap** baris yang gagal beserta sebabnya. |
| EMP-18 | 1 | **[W]** Impor **semua atau tidak sama sekali** per berkas: satu baris gagal membatalkan seluruh impor. Baris dengan NPP berawalan `CONTOH` diabaikan. |
| EMP-20 | 1 | **[W]** Tiap pegawai punya toggle: wajib presensi, bypass GPS, potongan terlambat, BPJS Kesehatan, BPJS Ketenagakerjaan, DPLK, DPJM pemotong pajak, dan **`ikut_payroll`**. Nilai awal `ikut_payroll` diturunkan dari jenis kepegawaian: **Outsource = Tidak**, lainnya = Ya. Perubahan tercatat di Audit Log. |
| EMP-19 | 1 | **[W]** Tidak ada field di layar yang tidak punya kolom di database. **Diuji dengan:** tes otomatis yang membandingkan daftar field setiap formulir dengan header tab. |

## 5. Presensi

| ID | Fase | Kebutuhan |
|---|---|---|
| ATT-01 | 1 | **[W]** Check-in mencatat waktu server, koordinat, akurasi GPS, dan **foto (wajib)**. Check-out mencatat waktu dan koordinat, **tanpa foto**. |
| ATT-02 | 1 | **[W]** **Waktu presensi diambil dari server**, bukan dari jam HP. |
| ATT-03 | 1 | **[W]** Tanggal presensi = tanggal **WIB**. **Diuji dengan:** check-in pukul 00.30 dan 06.30 WIB tercatat di tanggal yang benar. |
| ATT-04 | 1 | **[W]** Satu pegawai hanya bisa check-in **sekali per tanggal**. Dua permintaan check-in bersamaan hanya menghasilkan satu baris (dijaga kunci tulis). |
| ATT-05 | 1 | **[W]** Tombol yang tampil mengikuti keadaan: Check-in bila belum masuk, Check-out bila sudah masuk, dan tidak ada tombol bila hari itu lengkap. |
| ATT-06 | 1 | **[W]** Foto dikompres di browser menjadi sisi terpanjang **720 px**, JPEG kualitas **0,6**. **Diuji dengan:** foto HP 4000 px menghasilkan berkas ≤ 120 KB. |
| ATT-07 | 1 | **[W]** Bila kamera langsung tidak bisa dibuka, layar menawarkan **kamera bawaan HP** (`<input capture>`) sebagai cadangan, dan menyebutkan sebabnya. |
| ATT-08 | 1 | **[W]** Bila izin lokasi ditolak atau GPS tidak tersedia, layar menjelaskan cara menyalakannya. Tidak boleh gagal diam-diam. |
| ATT-09 | 1 | **[W]** Pegawai dengan **Wajib Presensi = Tidak** tetap bisa check-in, tetapi tidak pernah dinilai terlambat, pulang cepat, atau mangkir. |
| ATT-10 | 1 | **[W]** Setiap baris presensi menyimpan **potret** jam masuk, jam pulang, toleransi, radius, dan status bypass **saat itu**. Mengubah pengaturan tidak mengubah baris lama. |
| ATT-11 | 1 | **[W]** `menit_terlambat` = menit setelah (jam masuk + toleransi). `menit_pulang_cepat` = menit sebelum jam pulang. Keduanya dihitung server. |
| ATT-12 | 1 | **[W]** Admin HRD bisa **mengoreksi** jam presensi atau membuat presensi, dengan **alasan wajib**. Baris koreksi ditandai `koreksi_hr` dan **terlihat di rekap kehadiran**, bukan hanya di Audit Log. |
| ATT-13 | 1 | **[W]** Foto presensi yang berumur **lebih dari 365 hari** dihapus dari Drive oleh pekerjaan terjadwal harian. Baris presensinya tetap, dengan kolom `foto_dihapus_pada` terisi. |
| ATT-14 | 1 | **[W]** Layar check-in pegawai **tidak memuat peta**. |
| ATT-15 | 1 | **[W]** Bila akurasi GPS lebih buruk dari **200 m**, check-in tidak diproses dan pegawai diminta mencoba lagi (mis. di dekat jendela atau di luar ruangan). Kejadian ini tidak dicatat sebagai percobaan luar radius. |

### Titik kantor dan radius

| ID | Fase | Kebutuhan |
|---|---|---|
| LOC-01 | 1 | **[W]** Admin menetapkan titik kantor dengan **mengklik peta** Leaflet + OpenStreetMap, lengkap dengan kotak pencarian alamat. Koordinat bisa juga diketik sebagai cadangan. |
| LOC-02 | 1 | **[W]** Radius hanya boleh **50, 100, 200, atau 300 m**. Nilai lain ditolak server, bukan hanya oleh dropdown. |
| LOC-03 | 1 | **[W]** Boleh ada lebih dari satu titik, masing-masing bisa aktif atau nonaktif. |
| LOC-04 | 1 | **[W]** Pegawai bisa dikunci ke satu titik. Bila tidak dikunci, check-in sah di radius titik aktif **mana pun** (yang terdekat dipakai). |
| LOC-05 | 1 | **[W]** Jarak dihitung **server** dengan rumus haversine. Nilai jarak atau "dalam radius" yang dikirim browser diabaikan. |
| LOC-06 | 1 | **[W]** Check-in di luar radius (bypass OFF) **ditolak** dengan pesan *"Anda berada ±X m dari [nama kantor] (batas Y m)"*. Percobaannya tetap disimpan di tab `PercobaanCheckIn` (waktu, koordinat, foto). |
| LOC-07 | 2 | **[W]** Dari pesan penolakan, pegawai bisa mengirim **tinjauan luar radius** (alasan wajib). Bila disetujui, presensi dibuat dengan **waktu dan koordinat percobaan asli** dan ditandai `tinjauan_radius`. |
| LOC-08 | 1 | **[W]** Bypass GPS = Ya: radius tidak diperiksa, tetapi koordinat dan jarak tetap dicatat. |
| LOC-09 | 1 | **[W]** Bila belum ada titik kantor aktif, `dalam_radius` = kosong (belum dinilai), bukan "di luar". |
| LOC-10 | 1 | **[W]** Menonaktifkan atau memindahkan titik kantor **tidak mengubah** penilaian presensi yang sudah tersimpan. |
| LOC-11 | 1 | **[W]** Layar peninjauan HRD menampilkan koordinat sebagai teks dengan tautan ke OpenStreetMap, bukan peta per baris. |

### Jam kerja, hari libur, rekap

| ID | Fase | Kebutuhan |
|---|---|---|
| WRK-01 | 1 | **[W]** Jam masuk, jam pulang, toleransi (0–120 menit), hari kerja, dan batas susulan adalah **pengaturan berversi** dengan tanggal berlaku. Nilai awalnya 08.00 / 17.00 / 0 / Senin–Jumat / 7 hari. |
| WRK-02 | 1 | **[W]** Hari libur punya `sumber` ∈ {nasional, ditetapkan_hr}. Hanya yang `ditetapkan_hr` bisa dihapus lewat layar. |
| WRK-03 | 1 | **[W]** "Hari kerja" = hari yang termasuk hari kerja pengaturan **dan** bukan hari libur. |
| REK-01 | 2 | **[W]** Rekap kehadiran bulanan per pegawai memuat: hari kerja, hadir, dinas luar, cuti, mangkir, menit terlambat, menit pulang cepat, jumlah tanpa check-out, jumlah susulan, dan jumlah koreksi. |
| REK-02 | 2 | **[W]** Mangkir = hari kerja tanpa presensi, cuti, dinas, atau Bebas Tugas, pada pegawai *Wajib Presensi = Ya*. Nilainya 480 menit. |
| REK-03 | 2 | **[W]** Potongan kehadiran = `lantai_ratusan( (30% × Gapok ÷ 10.380) × (menit terlambat + menit pulang cepat + 480 × hari mangkir) )`, hanya bila *Potongan Terlambat = Ya* dan pegawai tidak Bebas Tugas. **Diuji dengan:** Gapok Rp3.090.000 dan 30 menit terlambat → **Rp2.600**. |
| REK-04 | 2 | **[W]** Lupa check-out ditandai "tanpa check-out" dan **tidak** menambah menit pulang cepat, sampai HRD mengoreksinya. |
| REK-05 | 2 | **[W]** Rekap berstatus *Draf* sampai **disahkan Admin HRD**. Setelah disahkan, presensi, susulan, dan koreksi pada periode itu **terkunci** dari jalur pegawai. Koreksi HRD sesudahnya masuk ke **periode berikutnya** sebagai penyesuaian. |
| REK-06 | 2 | **[W]** Angka rekap per pegawai dan angka grafik kehadiran **berasal dari satu fungsi hitung**, sehingga tidak bisa berselisih. |

## 6. Perjalanan dinas

| ID | Fase | Kebutuhan |
|---|---|---|
| TRV-01 | 2 | **[W]** Perjalanan dinas memuat tanggal berangkat, tanggal kembali, kota tujuan, keperluan, dan moda transportasi. |
| TRV-02 | 2 | **[W]** Admin HRD bisa **menetapkan langsung** (status langsung *Disetujui*, jalur tercatat "ditetapkan HRD"). Pegawai bisa **mengajukan** lewat jalur kebijakan. |
| TRV-03 | 2 | **[W]** Selama dinas yang disetujui, setiap hari kerja dalam rentangnya dihitung **"Hadir – Dinas Luar"** di rekap, tanpa check-in, tanpa potongan. |
| TRV-04 | 2 | **[W]** Membatalkan atau mempersingkat dinas membuat hari yang tidak lagi tercakup **dinilai normal kembali**, selama rekap periodenya belum disahkan. |
| TRV-05 | 2 | **[W]** Check-in yang tetap dilakukan saat dinas disimpan dengan tanda `dinas_luar` dan tidak diperiksa radiusnya. |
| TRV-06 | 2 | **[W]** Pengajuan dinas yang bertabrakan tanggal dengan cuti atau dinas lain yang masih berlaku ditolak. |
| TRV-07 | 3 | **[W]** Biaya perjalanan dinas diproses lewat **Biaya Diklat & Perjalanan Dinas** (BIA-01 s.d. BIA-12), bukan lewat Reimbursement. |

## 7. Pengajuan dan approval

Berlaku untuk: `cuti`, `lembur`, `dinas`, `susulan`, `tinjauan_radius`, `perubahan_profil`, `reimbursement`.

| ID | Fase | Kebutuhan |
|---|---|---|
| APR-01 | 2 | **[W]** Admin HRD menetapkan **kebijakan per jenis**: urutan langkah dari {Atasan langsung, Direktur pembina, Admin HRD, Admin Finance}, boleh bersyarat (mis. cuti > N hari). |
| APR-02 | 2 | **[W]** Pengaju **tidak bisa** memilih atau mengubah jalurnya. |
| APR-03 | 2 | **[W]** Saat diajukan, langkah dari kebijakan **diubah menjadi orang tertentu** (atasan dari rantai unit/jabatan) dan **disalin** ke `LangkahApproval` dan `jalur_snapshot`. Mengubah kebijakan atau atasan sesudahnya tidak mengubah pengajuan yang sedang berjalan. |
| APR-04 | 2 | **[W]** Bila penyetuju sebuah langkah adalah pengaju sendiri, atau posisi atasannya kosong, langkah dialihkan ke pemegang peran penyetuju lain, lalu ke `super_admin`. Pengalihan dicatat. |
| APR-05 | 2 | **[W]** Satu layar Approval menampilkan semua pengajuan yang menunggu tindakan pengguna, lintas jenis. |
| APR-06 | 2 | **[W]** Penolakan tanpa alasan **ditolak server**. |
| APR-07 | 2 | **[W]** **Alur cuti & lembur**: pengaju → **Atasan Langsung** → **Direktur Pembina unit pengaju** (pengajuan oleh Direksi sendiri → Dirut); **Admin HRD bukan langkah**. Setelah disetujui, saldo cuti terpotong dan jam lembur diakui **otomatis**, lalu lembur diteruskan ke bendahara (Admin Finance) untuk dibayar pada run payroll. Dinas tetap Atasan → HRD; Reimbursement tetap Admin Finance; Susulan/Profil tetap Admin HRD. |
| APR-08 | 2 | **[W]** Setiap langkah tercatat: siapa, kapan, hasil, alasan. |
| APR-09 | 2 | **[W]** Pengaju bisa **membatalkan** pengajuan selama belum ada langkah yang disetujui. |
| APR-10 | 2 | **[W]** Penolakan pada langkah mana pun mengakhiri pengajuan dengan status *Ditolak*. Persetujuan pada langkah terakhir menjadikannya *Disetujui* dan menjalankan akibatnya (saldo cuti, rekap lembur, dinas, profil, dan seterusnya). |

### Cuti

| ID | Fase | Kebutuhan |
|---|---|---|
| LV-01 | 2 | **[W]** Jenis cuti adalah master data (nama, jatah/tahun, potong saldo, wajib lampiran, syarat masa kerja, bisa dibawa, maks dibawa, aktif), bisa ditambah dan diubah Admin HRD. |
| LV-02 | 2 | **[W]** Saldo cuti tahunan **dihitung** = jatah − terpakai sebelum sistem (`SaldoCutiAwal`) − hari cuti disetujui pada tahun itu. Pengajuan yang masih *menunggu* ikut mengurangi saldo yang **tersedia untuk pengajuan baru**, supaya dua pengajuan tidak bisa sama-sama lolos. Tidak ada kolom saldo yang diketik. |
| LV-03 | 2 | **[W]** Periode = tahun kalender, direset 1 Januari. Pegawai dengan masa kerja < 12 bulan **tidak berhak** cuti tahunan. Pada tanggal genap 12 bulan, jatah **12 hari penuh** berlaku sampai 31 Desember tahun itu. **Diuji dengan:** masuk 1 Juli 2025 → sebelum 1 Juli 2026 jatahnya 0, sejak 1 Juli 2026 jatahnya 12. |
| LV-04 | 2 | **[W]** Sisa cuti hangus 31 Desember, kecuali jenis cuti itu diset *bisa dibawa* (maksimal N hari). |
| LV-05 | 2 | **[W]** Jumlah hari cuti = hari kerja di rentang tanggal (akhir pekan dan hari libur tidak dihitung). |
| LV-06 | 2 | **[W]** Pengajuan yang melebihi saldo ditolak **sebelum** sampai ke penyetuju. |
| LV-07 | 2 | **[W]** Tanggal cuti yang bertabrakan dengan cuti atau dinas lain yang masih hidup ditolak. |
| LV-08 | 2 | **[W]** Jenis cuti *wajib lampiran* tidak bisa dikirim tanpa lampiran. |
| LV-09 | 2 | **[T]** Jatah Cuti Besar dan perlakuan cuti bersama terhadap saldo tahunan mengikuti Peraturan Perusahaan. |

### Lembur

| ID | Fase | Kebutuhan |
|---|---|---|
| OT-01 | 2 | **[W]** Lembur mencatat tanggal, jam mulai, jam selesai, dan uraian. Diajukan setelah dikerjakan. |
| OT-02 | 2 | **[W]** **Jam diakui** = irisan jam lembur yang diajukan dengan rentang kehadiran tercatat. Lembur hari kerja dihitung setelah jam pulang sampai jam check-out. Lembur hari libur memerlukan presensi hari itu. Penyetuju melihat jam diajukan dan jam diakui berdampingan. |
| OT-03 | 2 | **[W]** Hari kerja: maksimal 4 jam/hari dan 18 jam/minggu. Kelebihannya tidak diakui, dan penyetuju diberi tahu. Batas ini tidak berlaku di hari libur (SK Pasal 8 ayat 5b). |
| OT-04 | 2 | **[W]** Cara bayar diambil dari master **Jabatan**: `upah_per_jam`, `lumpsum`, atau `tidak_ada`. Nilai awal: Manager, Specialist, Assistant Manager = lumpsum; jabatan lain di Grade III–V = upah per jam; Direksi & Dewan Pengawas = tidak ada. |
| OT-05 | 3 | **[W]** Upah per jam: tarif = `(Gapok + Tunjangan Jabatan) ÷ 173`. Hari kerja: jam ke-1 × 1,5 dan jam ke-2 dst × 2. Hari libur: jam ke-1–8 × 2, jam ke-9 × 3, jam ke-10–12 × 4. Jam dihitung per jam penuh; pecahan jam dihitung proporsional per menit. |
| OT-06 | 3 | **[W]** Lumpsum: Rp100.000 per hari dengan jam diakui ≥ 2 jam; di bawah 2 jam = Rp0. |
| OT-07 | 3 | **[W]** Total upah lembur sebulan dibulatkan **ke bawah ke ratusan rupiah** (SK Pasal 8 ayat 4). **Diuji dengan:** Gapok Rp3.090.000 + TJ Rp1.500.000, 2 jam di hari kerja → **Rp92.800**. |
| OT-08 | 3 | **[W]** Lembur yang disetujui dan tercakup rekap yang disahkan dibayar di **run bulanan berikutnya**. |

### Presensi susulan

| ID | Fase | Kebutuhan |
|---|---|---|
| SUS-01 | 2 | **[W]** Susulan memuat tanggal, jam masuk, jam pulang (opsional), alasan wajib, dan lampiran opsional. |
| SUS-02 | 2 | **[W]** Ditolak bila tanggalnya belum terjadi, bukan hari kerja, lebih tua dari batas susulan (bawaan 7 hari), sudah ada presensi, atau periodenya sudah disahkan. |
| SUS-03 | 2 | **[W]** Bila disetujui, presensi dibuat dengan `sumber = susulan`, `dalam_radius` kosong, dan penanda **"Susulan"** terlihat di rekap. |

## 8. Reimbursement

| ID | Fase | Kebutuhan |
|---|---|---|
| RB-01 | 3 | **[W]** Satu formulir: kategori, deskripsi, nominal, tanggal nota, dan **minimal satu lampiran**. Tanpa lampiran, pengajuan tidak bisa dikirim. Biaya perjalanan dinas dan diklat tidak termasuk kategori reimbursement (lihat BIA). |
| RB-02 | 3 | **[W]** Kategori diambil dari master data, bukan diketik bebas. |
| RB-03 | 3 | **[W]** Aturan per (kategori × kelompok Pegawai/Direksi/Dewan Pengawas): syarat masa kerja minimal (bulan), plafon (kosong = tanpa batas), periode plafon (bulan), persentase penggantian, kena pajak, aktif. |
| RB-04 | 3 | **[W]** Pengajuan dari pegawai yang **belum memenuhi masa kerja** ditolak saat dikirim, dengan pesan *"Kategori ini tersedia setelah masa kerja N bulan (Anda: X bulan)"*. |
| RB-05 | 3 | **[W]** Sisa plafon = plafon − (klaim disetujui + klaim awal) di jendela periode yang berlaku. Nominal di atas sisa plafon **dipotong otomatis** menjadi sisa plafon, dengan pemberitahuan ke pengaju dan penyetuju. |
| RB-06 | 3 | **[W]** Penyetuju: **Admin Finance**. Admin Finance bisa menyetujui dengan nominal yang lebih kecil dari yang diajukan, dengan alasan wajib. |
| RB-07 | 3 | **[W]** Status bayar: *menunggu_pembayaran* setelah disetujui, lalu *dibayar* dengan tautan ke slip saat run final. |
| RB-08 | 3 | **[W]** Klaim yang disetujui **sebelum** run bulanan dihitung otomatis ikut run itu. Yang disetujui sesudahnya ikut run berikutnya. **Diuji dengan:** menyetujui klaim setelah run dihitung, lalu memastikan klaim itu tidak muncul di run tersebut. |
| RB-09 | 3 | **[W]** Lampiran hanya bisa dibuka pengaju, Admin Finance, dan Admin HRD. |
| RB-10 | 3 | **[W]** Isian awal aturan: Pegawai kacamata ≥ 12 bulan, alat bantu ≥ 36 bulan. Dewan Pengawas kacamata Rp2.500.000/12 bulan, alat bantu dengar Rp600.000/24 bulan, protesa mata Rp500.000, protesa alat gerak Rp500.000/60 bulan, alat bantu lain 100%. Direksi 100% tanpa plafon. |
| RB-11 | 3 | **[T]** Plafon kategori Pegawai lainnya mengikuti Peraturan Perusahaan. |

## 9. Payroll

| ID | Fase | Kebutuhan |
|---|---|---|
| PAY-01 | 3 | **[W]** Run dibuat **per periode untuk semua orang** yang aktif pada periode itu, bukan per orang. Satu baris slip per orang. |
| PAY-01a | 3 | **[W]** Peserta run = pegawai yang aktif pada periode itu **dan** `ikut_payroll` menyala. Sebelum menghitung, layar run menampilkan **daftar peserta dengan toggle per orang**; Admin Payroll bisa menyalakan/mematikan **khusus run itu** tanpa mengubah data pegawai, dan perubahannya tercatat di Audit Log. |
| PAY-01b | 3 | **[W]** Toggle peserta hanya bisa diubah selama run berada di Tahap 2. Setelah diajukan, run harus dikembalikan lebih dulu, lalu dihitung ulang. |
| PAY-01c | 3 | **[W]** Layar run menampilkan ringkasan **"N aktif · N dihitung · N dikecualikan"** beserta daftar nama dan alasan pengecualian (toggle mati, belum masuk kerja pada periode, atau berhenti sebelum periode). Orang yang dikecualikan tidak boleh hilang tanpa keterangan. |
| PAY-32 | 3 | **[W]** Orang yang dikecualikan tidak mendapat slip gaji, tidak masuk file transfer bank, dan tidak masuk rekap PPh 21 — **kecuali** bila ia punya reimbursement disetujui yang belum dibayar: ia tetap mendapat baris run berisi **komponen reimbursement saja**, tanpa gaji, BPJS, DPLK, maupun PPh. **Diuji dengan:** pegawai Outsource dengan satu klaim disetujui → slipnya hanya memuat baris reimbursement. |
| PAY-33 | 3 | **[W]** **Run khusus** (THR/Insentif Triwulan/Insentif Tahunan/Bonus/Penyesuaian) diajukan Admin HRD/Admin Payroll dan disetujui Direksi — **3 tahap**: (1) pengajuan HRD/Payroll → (2) persetujuan Direksi → (3) pembayaran & penerbitan slip oleh Finance. Tahap verifikasi Manager **tidak dipakai** pada run khusus; bila ditolak, pengusul dapat mengajukan ulang. **Run bulanan tetap 5 tahap** (PAY-03). |
| PAY-34 | 3 | **[W]** **Katalog komponen payroll** dikelola sebagai master `KomponenGaji` (kode, nama, tipe, `kena_pajak`, aktif) dengan katalog awal di `design_final.md` §8.13. Tarif yang bergantung grade/kelompok (uang makan, uang transport, uang telekomunikasi) diisi HRD di tab `TarifKomponen` (kode, `grade_atau_kelompok`, nominal, satuan, `berlaku_mulai`, aktif); pengecualian per orang (non-aktif atau nominal khusus + alasan wajib) disimpan di tab `KomponenPegawai`. Perlakuan pajak tiap komponen dibaca dari kolom `kena_pajak`. |
| PAY-35 | 3 | **[W]** **Tunjangan operasional**: uang makan dan uang transport dihitung **per hari hadir**, uang telekomunikasi **per bulan**, dengan tarif per grade dari `TarifKomponen`. Bila tarif belum diisi, komponen tidak dihitung dan sistem **memperingatkan** di layar run payroll. |
| PAY-36 | 3 | **[W]** **Tunjangan Perumahan & Utilitas Direksi Rp 22.500.000 per bulan** dan **Tunjangan Transportasi Dewan Pengawas Rp 4.000.000 per bulan** dibayar pada run bulanan untuk jenis kepegawaian yang berhak (Surat Remunerasi). |
| PAY-37 | 3 | **[W]** **Ongkos Cuti Tahunan = 1× penghasilan** dan **Ongkos Cuti Besar / Istirahat Panjang = 1× penghasilan**, dibayar satu kali per peristiwa. |
| PAY-38 | 3 | **[W]** **Uang Kompensasi Piket**: Rp 75.000 (hari kerja) · Rp 150.000 (hari libur) · Rp 250.000 (Idul Fitri & Natal), dihitung dari hari piket yang diakui. |
| PAY-39 | 3 | **[W]** **Bantuan Sumbangan Duka Cita** dibayar sesuai nominal pengajuan dan **tidak kena pajak**. **Bantuan Keuangan Keluarga** untuk pegawai *Bebas Tugas – Ditahan*: 25% (1 tanggungan) · 35% (2) · 45% (3) · 50% (≥4) dari upah, maksimal **6 bulan**. |
| PAY-40 | 3 | **[W]** **Tambahan Uang Purna Karya = 5× penghasilan** untuk pensiun normal dengan masa kerja ≥ 24 tahun. Komponen peristiwa (ongkos cuti tahunan/besar, bantuan duka cita, bantuan keluarga ditahan, purna karya) diajukan lewat **pengajuan + approval atasan → direksi** dengan **bukti wajib**, lalu setelah disetujui **otomatis masuk run payroll berikutnya**. |
| PAY-02 | 3 | **[W]** Jenis run: `bulanan`, `thr`, `insentif_tw`, `insentif_tahunan`, `bonus`, `penyesuaian`. Hanya boleh ada satu run `bulanan` per periode. |
| PAY-03 | 3 | **[W]** Tahapan (5): (1) Admin HRD sahkan rekap → (2) Admin Payroll hitung → (3) Manager yang ditunjuk verifikasi → (4) salah satu Direksi/Dirut sahkan → (5) Admin Finance bayar & terbitkan slip. Run bulanan **tidak bisa dihitung** sebelum rekap bulan sebelumnya disahkan. |
| PAY-04 | 3 | **[W]** Setiap tahap hanya bisa dikerjakan pemegang perannya. **Diuji dengan:** memanggil aksi tahap 3–5 dengan token `admin_payroll`; semua ditolak. |
| PAY-05 | 3 | **[W]** Tahap 3 selesai hanya bila **semua** Manager unit yang ditunjuk di Pengaturan sudah setuju (bawaan: Manager KSU dan Manager Keuangan & Akuntansi). Tahap 4 selesai oleh **satu** Direksi/Dirut. |
| PAY-06 | 3 | **[W]** Setiap tahap bisa **mengembalikan** run ke Tahap 2 dengan **alasan wajib**. Menghitung ulang membatalkan semua persetujuan tahap 3–4 run itu. |
| PAY-06a | 3 | **[W]** **Satu orang tidak boleh menyetujui dua tahap pada run yang sama.** Contoh: Manager Keuangan yang juga Admin Finance tidak bisa mengerjakan Tahap 3 dan Tahap 5 pada run yang sama. Tahap lainnya harus dikerjakan pemegang peran lain, dan layar menyebutkan sebabnya. |
| PAY-07 | 3 | **[W]** Menghitung menyalin **potret** ke slip: nama, NPP, NIK, jabatan, unit, jenis kepegawaian, PTKP, bank, rekening, pemilik rekening, gapok, tunjangan, faktor status, dan **setiap baris komponen** beserta rinciannya. |
| PAY-08 | 3 | **[W]** Setelah Tahap 5, run **terkunci permanen**. Tidak ada fungsi yang mengubah slip atau barisnya, termasuk untuk `super_admin`. Koreksi lewat run `penyesuaian` yang merujuk run asal. |
| PAY-09 | 3 | **[W]** Slip lama **identik** walaupun data pegawai berubah. **Diuji dengan:** finalkan run Januari, naikkan gapok di Maret, lalu buka dan cetak slip Januari; semua angka dan teks sama. |
| PAY-10 | 3 | **[W]** Pegawai bisa membuka slipnya untuk **12 periode ke belakang**, dipilih dari run yang benar-benar final, dan mencetaknya sebagai PDF. Layar dan PDF berasal dari satu fungsi penyusun yang sama. |
| PAY-11 | 3 | **[W]** Semua nominal uang disimpan sebagai **bilangan bulat rupiah**. Pembulatan hanya di titik yang ditetapkan (lembur & potongan kehadiran: ke bawah ke ratusan; lainnya: ke rupiah terdekat). |
| PAY-12 | 3 | **[W]** Semua nominal ditampilkan penuh, `Rp 37.600.000`. Tidak pernah memakai `jt`, `M`, atau `k`. |
| PAY-13 | 3 | **[W]** Gaji & tunjangan diambil dari versi gaji yang **berlaku pada tanggal terakhir periode**. |
| PAY-14 | 3 | **[W]** Tunjangan Jabatan hanya dibayar bila Kelompok Jabatan berhak (Struktural/Fungsional, bukan Staf) menurut SK Pasal 4. |
| PAY-15 | 3 | **[W]** Faktor status: Probation 80% dari penghasilan dengan batas bawah UMP (nilai UMP disimpan di data tarif berversi). Cuti sakit panjang 100/75/50/25% per blok 4 bulan sejak tanggal mulai status. Skorsing/non-aktif = gaji terakhir. Ditahan = 0% gaji + bantuan keluarga 25/35/45/50% untuk 1/2/3/≥4 tanggungan. Meninggal = kompensasi dibayar ke rekening **ahli waris** selama 6 bulan sejak bulan meninggal. |
| PAY-16 | 3 | **[W]** Berhenti bukan karena meninggal setelah tanggal 1 bulan berjalan: kompensasi bulan itu tetap dibayar, dan berhenti mulai bulan berikutnya (SK Pasal 12 ayat 2). |
| PAY-17 | 3 | **[W]** BPJS: tarif dari tab tarif berversi yang berlaku pada periode run. Bagian pegawai (Kesehatan, JHT, JP) menjadi potongan, bagian perusahaan menjadi baris *informasi*. Hanya untuk orang dengan toggle kepesertaan Ya. Batas upah diterapkan. |
| PAY-18 | 3 | **[W]** DPLK: PhDP = 85% × (Gapok + Tunjangan Jabatan). Pegawai 5% × PhDP (potongan), perusahaan 10% × PhDP (informasi). Hanya bila *DPLK Aktif = Ya*. **Diuji dengan:** Gapok Rp3.090.000 + TJ Rp1.500.000 → potongan **Rp195.075**. |
| PAY-19 | 3 | **[W]** PPh 21 **gross-up / ditanggung DPJM**: PPh diberikan sebagai **tunjangan pajak** yang ditambahkan ke bruto dan dihitung **iteratif** (`pph = TER[kategori(ptkp)](bruto + tunjangan_pajak)`), sehingga neto **tidak dipotong** PPh; tampil di slip sebagai baris pendapatan *Tunjangan Pajak* dan baris *informasi*. **Pengecualian:** PPh atas **insentif/remunerasi kinerja Direksi & Dewan Pengawas** menjadi **beban pribadi penerima** dan **dipotong dari neto**. **Diuji dengan:** slip pegawai biasa memuat tunjangan pajak dan tidak memuat potongan PPh; slip Direksi dengan insentif memuat potongan PPh insentif. |
| PAY-20 | 3 | **[W]** PPh 21 pegawai tetap Januari–November memakai **TER bulanan**. Kategori TER ditentukan **otomatis dari kode PTKP** pegawai: A = TK/0, TK/1, K/0 · B = TK/2, TK/3, K/1, K/2 · C = K/3. Karena gross-up, PPh bulanan dihitung **iteratif** terhadap bruto yang sudah termasuk tunjangan pajak. Desember (atau bulan terakhir bekerja) memakai perhitungan tahunan tarif Pasal 17 dikurangi PPh Januari–November. Tarif dan PTKP diambil dari tab tarif berversi; **tabel TER resmi menunggu fixture Keuangan (PAY-23)**. |
| PAY-21 | 3 | **[W]** Hanya orang dengan *DPJM Pemotong Pajak = Ya* yang dihitung PPh-nya dan masuk ekspor Coretax. |
| PAY-22 | 3 | **[W]** Tarif pajak dan BPJS **tidak bisa disunting lewat layar**. Perubahan tarif adalah perubahan data berversi oleh Super Admin, tercatat di Audit Log. |
| PAY-23 | 3 | **[W]** Hasil perhitungan cocok **persis** dengan 4–5 contoh hitungan manual Keuangan, yang dikunci sebagai fixture tes. Modul payroll tidak dianggap selesai sebelum semua fixture lulus. |
| PAY-24 | 3 | **[T]** Perlakuan PPh 21 Dewan Pengawas (bukan pegawai, bukti potong BP21) dikunci dari contoh hitungan Keuangan. |
| PAY-25 | 3 | **[W]** THR: Pegawai 2 × penghasilan bila masa kerja ≥ 12 bulan per tanggal acuan THR, **tanpa faktor status/probation**. Bila < 12 bulan, proporsional: `bulan masa kerja ÷ 12 × 2 × penghasilan`. Masa kerja memakai **tanggal masa kerja diakui bila diisi**, selain tanggal masuk. Direksi 1 × gaji. Dewan Pengawas 1 × honorarium dari **master remunerasi pegawai**. Nilai default dihitung sistem; **Admin Payroll boleh menyesuaikan nominal per pegawai** (penanda **Manual** + alasan wajib, tercatat di Audit Log, ada aksi **kembalikan ke hitungan aturan**). Peserta dapat diaktif/non-aktifkan per run **hanya selama run di Tahap 2** dan hanya berlaku untuk run itu (alasan dicatat); yang non-aktif tidak diterbitkan slip dan **tidak masuk rekap pajak maupun file transfer bank**. Kelayakan bawaan (sementara menunggu PP): masa kerja **≥ 1 bulan** per tanggal acuan; berhenti **< 30 hari sebelum hari raya** ditandai tidak berhak dan hanya bisa dinyalakan Admin Payroll dengan alasan wajib (tercatat audit). Jadwal **serentak**, satu tanggal bayar per run, dengan validasi/peringatan paling lambat **H-14 (14 hari sebelum hari raya)**. PPh atas THR **ditanggung penuh** perusahaan. |
| PAY-26 | 3 | **[W]** Insentif TW, Insentif Tahunan, dan Bonus: nominal per orang diisi di layar atau diimpor dari Excel oleh Admin Payroll sebelum dihitung. |
| PAY-27 | 3 | **[W]** Tahap 5 menghasilkan **file transfer Excel**: nama, bank, nomor rekening, pemilik rekening, nominal bersih, dan total yang sama dengan total run. |
| PAY-28 | 3 | **[W]** Rekap PPh 21 & BPJS per periode bisa diekspor ke Excel. |
| PAY-29 | 3 | **[T]** Ekspor Excel dengan kolom **persis** sama dengan converter DJP **BPMP v.3**, **BP21 v.4**, dan **BPA1**. Menunggu tiga file converter di `referensi/coretax/`. |
| PAY-30 | 3 | **[W]** Menerbitkan slip mengirim notifikasi ke setiap pegawai. Email **tidak melampirkan slip**. |
| PAY-31 | 3 | **[T]** Pegawai yang masuk di tengah bulan: bawaan prorata hari kalender, menunggu konfirmasi pemilik. |

## 9a. Biaya diklat dan perjalanan dinas

| ID | Fase | Kebutuhan |
|---|---|---|
| BIA-01 | 3 | **[W]** Admin HRD membuat **berkas biaya** dari perjalanan dinas atau diklat yang sudah disetujui. Berkas memuat kegiatan, peserta, tanggal, dan fase `uang_muka`. Satu kegiatan hanya boleh punya satu berkas uang muka yang aktif. |
| BIA-02 | 3 | **[W]** Admin Payroll mengisi rincian per peserta per komponen (`uang_harian`, `transport`, `penginapan`, `biaya_diklat`, `lainnya`): jumlah × tarif = nominal. Bila tarif ada di master, tarif terisi otomatis. Bila kosong, nominal diisi manual dengan **keterangan wajib**. |
| BIA-03 | 3 | **[W]** Berkas biaya melewati **5 tahap yang sama dengan payroll**, dengan aturan yang sama: pemegang peran per tahap, Manager KSU + Keuangan di Tahap 3, satu Direksi/Dirut di Tahap 4, pengembalian wajib beralasan, dan satu orang tidak boleh menyetujui dua tahap (PAY-03 s.d. PAY-06a). |
| BIA-04 | 3 | **[W]** Pada Tahap 5, Admin Finance mencatat tanggal transfer dan bukti bayar per peserta. Peserta mendapat notifikasi "Uang muka sudah ditransfer". |
| BIA-05 | 3 | **[W]** Uang muka **tidak lewat payroll** dan tidak muncul di slip gaji. Uang muka dibayar langsung sebelum tanggal berangkat/mulai. Bila Tahap 5 belum selesai H-1, Admin HRD dan Admin Finance mendapat peringatan. |
| BIA-06 | 3 | **[W]** Setelah tanggal kembali/selesai, peserta mengirim **pertanggungjawaban**: biaya sebenarnya per komponen, masing-masing dengan **bukti wajib**. |
| BIA-07 | 3 | **[W]** Tenggat pertanggungjawaban = **14 hari kerja** setelah tanggal kembali/selesai (bisa diubah di Pengaturan). Pengingat dikirim 3 hari kerja sebelum tenggat dan saat tenggat lewat. Yang lewat tenggat tampil di dashboard Admin HRD dan Admin Finance. |
| BIA-08 | 3 | **[W]** Pertanggungjawaban melewati 5 tahap yang sama (fase `pertanggungjawaban`). Admin Payroll menghitung **selisih = biaya sebenarnya − uang muka** per peserta. |
| BIA-09 | 3 | **[W]** Selisih positif (**kekurangan**) dibayar Admin Finance pada Tahap 5 pertanggungjawaban. |
| BIA-10 | 3 | **[W]** Selisih negatif (**kelebihan**): peserta **memilih** saat mengirim pertanggungjawaban: (a) **transfer balik**, dengan unggah bukti transfer lalu dikonfirmasi Admin Finance; atau (b) **potong gaji**, yang menjadi baris potongan di run bulanan pertama setelah pertanggungjawaban final. **Diuji dengan:** memilih potong gaji Rp350.000, lalu memastikan baris potongan itu muncul tepat sekali di slip bulan berikutnya. |
| BIA-11 | 3 | **[W]** Master **Tarif Dinas** (uang harian, transport, penginapan; per jabatan/grade dan per kota/zona bila diperlukan, dengan tanggal berlaku) disediakan **kosong** dan bisa diisi Admin Finance/Super Admin. |
| BIA-12 | 3 | **[W]** **Renbis & serapan anggaran**: master **anggaran per kategori per unit per tahun** (pagu). Serapan bulanan dihitung **otomatis dari transaksi**: payroll run final → Penggajian, THR/Insentif/Bonus, dan Lembur; `BerkasBiaya` final → Diklat & Perjalanan Dinas; reimbursement dibayar → Reimbursement; tagihan vendor dibayar → Vendor Outsource. Dashboard menampilkan **pagu · terserap YTD · sisa · % serapan** (`% = terserap ÷ pagu × 100`), tabel per kategori, tabel per bulan (bulan ini, kumulatif, sisa), dan grafik kumulatif vs pagu. **Ekspor CSV per bulan termasuk bulan-bulan sebelumnya** serta ekspor seluruh periode. Hak lihat: Direksi/Dirut (semua unit), Manager (unitnya), Admin Finance/HRD/Payroll (semua), Auditor (baca). |

## 9b. Tagihan vendor outsource

| ID | Fase | Kebutuhan |
|---|---|---|
| TGV-01 | 3 | **[W]** Tagihan vendor memuat nomor tagihan, nama vendor, periode, jumlah orang, nominal, keterangan, dan **lampiran invoice wajib**. Dicatat Admin HRD atau Admin Finance. |
| TGV-02 | 3 | **[W]** Status: *menunggu → diverifikasi → dibayar*. Verifikasi dan pembayaran hanya oleh Admin Finance, dengan tanggal bayar dan bukti bayar. |
| TGV-03 | 3 | **[W]** Mengembalikan tagihan ke pencatat wajib disertai alasan, dan tercatat di Audit Log. |
| TGV-04 | 3 | **[W]** Tagihan vendor **tidak** menghasilkan slip gaji, tidak masuk file transfer gaji, dan tidak masuk rekap PPh 21. |
| TGV-05 | 3 | **[W]** Tagihan yang sudah dibayar ikut dihitung pada laporan biaya SDM dan dashboard Admin Finance. |

## 10. JMPD: Workblock, penilaian, predikat, feedback

Tata letak dan alur layar mengikuti JM-Click (lihat UI-01 s.d. UI-08). Skala Result memakai A–E.

### Workblock

| ID | Fase | Kebutuhan |
|---|---|---|
| KPI-01 | 4 | **[W]** Yang boleh membuat workblock: **Dirut** (Workblock Induk), **Direktur**, dan **Manager**. Staff tidak punya tombol *Add New Workblock*, dan server menolak pembuatan workblock oleh Staff. |
| KPI-02 | 4 | **[W]** Formulir *Create Workblock*: Initiative\*, Begin Date\*, Completion Date\*, Goal\*, Key Activities\*, Dependencies Internal, Dependencies External, Stakeholder\*, Budget\* (Rupiah penuh), Deliverables\*. **Project Owner** terisi otomatis dari unit pembuat ("Direksi" untuk Dirut/Direktur). Completion Date tidak boleh sebelum Begin Date. |
| KPI-03 | 4 | **[W]** Toggle *Show Milestones* ON: *Add Milestone* (nama, Bobot Utama %) dan *Add Karyawan* per milestone (karyawan, Sub Bobot %). Layar menampilkan "Maksimal Bobot / Total Bobot / Sisa Bobot" dan "Total Milestones". Server menolak pengiriman bila **total bobot milestone ≠ 100%** atau **total sub-bobot per milestone ≠ 100%**. |
| KPI-04 | 4 | **[W]** Karyawan yang bisa dipilih di *Add Karyawan* hanya **bawahan langsung dalam struktur**: Dirut → Direktur dan Manager KMR/Internal Audit; Direktur → Manager unit binaannya; Manager → Staff unitnya. |
| KPI-05 | 4 | **[W]** Pengajuan: Workblock Direktur disetujui Dirut. Workblock Manager disetujui Direktur pembina (Manager KMR/IA oleh Dirut). Workblock Dirut langsung *Approved*. Penolakan wajib beralasan dan mengembalikan workblock ke Draft. |
| KPI-06 | 4 | **[W]** Status: Draft → Waiting for Approval → Approved → On Progress → Finished → Completed. Selama *Waiting for Approval*, pembuat bisa **Edit** atau **Cancel Submission** (kembali ke Draft). |
| KPI-07 | 4 | **[W]** Saat sebuah workblock menjadi *Approved*, setiap baris *Add Karyawan* otomatis menjadi **workblock turunan** milik karyawan itu, dengan ID `induk.n` (mis. `WB-12.1`), *Assigned From* = pembuat workblock, Initiative = nama milestone, Bobot = sub-bobot, dan status *Approved* tanpa persetujuan ulang. |
| KPI-08 | 4 | **[W]** Pemegang workblock turunan (Direktur atau Manager) boleh menyalakan *Show Milestones* di turunannya untuk membaginya lagi ke bawahannya. Hasilnya turunan tingkat berikutnya (mis. `WB-12.1.1`). |
| KPI-09 | 4 | **[W]** Daftar Workblock menampilkan kolom: ID Workblock, Initiative, Assigned From, Bobot, Progress, Jumlah Milestone, Approval (nama penyetuju/penilai), Status (label berwarna), Action (detail, On Going Report), Nilai. Filter: Tahun, Status, Search, dengan *row per pages*. |
| KPI-10 | 4 | **[W]** Kartu *Individual Workblock Performance*: Need Action, Approved, On Progress, Finished, Average Progress, dan label "Penilai: nama / NPP". *Need Action* = workblock milik saya yang perlu diisi atau direvisi, ditambah laporan/workblock bawahan yang menunggu persetujuan saya. |
| KPI-11 | 4 | **[W]** Halaman detail workblock punya tombol **Print as PDF**, dan PDF-nya berasal dari fungsi penyusun yang sama dengan layar. |

### Realisasi

| ID | Fase | Kebutuhan |
|---|---|---|
| KPI-12 | 4 | **[W]** *On Going Report* hanya bisa diisi pada workblock berstatus Approved atau On Progress **yang tidak dibagi lagi** (tanpa milestone turunan). Layar menampilkan per milestone: Bobot, Target, *On going Progress (%)* (0–100), Pencapaian (bobot × progress), *Previous Notes*, serta *Report date* dan progress workblock. |
| KPI-13 | 4 | **[W]** *Important Notes* minimal **15 karakter**. Lampiran bukti **opsional**. |
| KPI-14 | 4 | **[W]** Laporan berstatus *menunggu* sampai **disetujui pemberi tugas** (atau atasan pembuat untuk workblock yang dibuat sendiri). Sebelum disetujui, progress lama yang dipakai. Penolakan wajib beralasan. Laporan pertama yang disetujui mengubah status menjadi On Progress. |
| KPI-15 | 4 | **[W]** Progress naik otomatis (bottom-up): progress workblock turunan = progress penugasan di milestone induknya. Progress milestone = Σ(progress penugasan × sub-bobot) ÷ 100. Progress workblock = Σ(progress milestone × bobot) ÷ 100. Angka dan rumusnya ditampilkan. |
| KPI-16 | 4 | **[W]** Workblock yang mencapai 100% otomatis menjadi *Finished*. |
| KPI-17 | 4 | **[W]** *View History* menampilkan semua laporan beserta notes, penyetuju, dan waktunya. Grafik menampilkan Target vs Progress per milestone. |

### Penilaian dan predikat

| ID | Fase | Kebutuhan |
|---|---|---|
| KPI-18 | 4 | **[W]** **Penilaian Workblock**: layar *Daftar Team Member* (NPP, Nama, Workblock List, Average Progress, Workblock Need Scoring) → jendela "…'s workblock score" dengan peringatan "Anda belum menyelesaikan penilaian" → *Nilai Form* berisi dropdown **A–E** dan Notes minimal 15 karakter. Hanya workblock berstatus On Progress atau Finished yang bisa dinilai. Penilainya adalah **pemberi tugas**. |
| KPI-19 | 4 | **[W]** Workblock *Finished* yang sudah dinilai menjadi *Completed* dan terkunci. |
| KPI-20 | 4 | **[W]** **Penilaian Akhir Result** per **triwulan**: daftar bawahan (NPP, Nama, Position, Unit, Status) → layar penilaian berisi Average Progress, tabel workblock dan nilainya, feedback yang diterima pada triwulan itu, lalu **radio button A–E** dan *Important notes* wajib. |
| KPI-21 | 4 | **[W]** **Penilaian Akhir Behaviour** per **triwulan**: radio button **Below Average / Average / Role Model / Guardian** dengan deskripsinya, *Important notes* wajib, dan tabel workblock serta feedback sebagai acuan. |
| KPI-22 | 4 | **[W]** Penilai akhir: Staff oleh Manager (final), Manager oleh Direktur pembina (KMR/IA oleh Dirut), Direktur oleh Dirut. Dirut tidak dinilai. Kartu "Nilai Akhir Result Anda" dan "Nilai Behaviour Anda" menampilkan nilai penilai sendiri untuk periode itu. |
| KPI-23 | 4 | **[W]** **Predikat JMPD** otomatis dari grid Result × Behaviour sesuai PRD §6.8. **Diuji dengan:** B + Role Model → *Exceed Expectation*; D + Below Average → *Unsatisfactory*; A + Guardian → *Exceptional*. |
| KPI-24 | 4 | **[W]** Menu *Predikat JMPD* menampilkan grid 5×4 berwarna dengan sel milik pegawai ditandai, legenda lima predikat, serta tabel *Predikat JMPD Team Member* untuk penilai. Predikat baru muncul setelah Result dan Behaviour periode itu sama-sama terisi. |
| KPI-25 | 4 | **[W]** Setelah predikat triwulan terbit, nilai akhir periode itu terkunci. Perubahan hanya lewat Super Admin dengan alasan dan tercatat di Audit Log. |

### Feedback

| ID | Fase | Kebutuhan |
|---|---|---|
| FB-01 | 4 | **[W]** Ikon feedback di bilah atas membuka formulir: kategori (**Result / Behaviour / Lainnya**, wajib), Nama Karyawan (wajib), isi feedback (wajib). Pesan galat tampil di bawah setiap kolom yang kosong. |
| FB-02 | 4 | **[W]** Yang bisa membaca sebuah feedback hanyalah **pengirim, penerima, dan rantai atasan penerima** dalam struktur. **Diuji dengan:** rekan satu unit penerima (bukan pengirim) meminta feedback itu lewat server, dan permintaannya ditolak. |
| FB-03 | 4 | **[W]** Tab **User Feedback** (yang saya terima) dan **My Feedback** (yang saya kirim), dengan pencarian dan filter kategori. Setiap item menampilkan kategori, nama dan jabatan pengirim, isi, dan waktu. |
| FB-04 | 4 | **[W]** Penerima mendapat notifikasi. Feedback tidak bisa diubah setelah dikirim, tetapi pengirim bisa menghapusnya (hapus-logis, tercatat di Audit Log). |
| NPS-01 | — | **[T]** Survey NPS 360 dan kartu *Personal NPS Score* ditunda sampai pemilik menetapkan pertanyaan, responden, dan anonimitasnya. |

## 11. Diklat

| ID | Fase | Kebutuhan |
|---|---|---|
| TR-01 | 4 | **[W]** Master diklat: nama, kategori (master data), penyelenggara, sasaran peserta, tanggal mulai, tanggal selesai, anggaran (Rupiah penuh). |
| TR-02 | 4 | **[W]** Peserta dan statusnya (terdaftar / selesai / batal), dengan sertifikat opsional. |
| TR-03 | 4 | **[W]** Peserta berstatus *selesai* otomatis menambah baris di Riwayat Diklat pegawai. |

## 12. Report dan dashboard

| ID | Fase | Kebutuhan |
|---|---|---|
| RPT-01 | 4 | **[W]** Tujuh report: daftar pegawai · rekap kehadiran · rekap cuti · rekap lembur · rekap payroll · rekap pajak & BPJS · ekspor Audit Log. |
| RPT-02 | 2 | **[W]** Rekap kehadiran menampilkan **jam datang dan jam pulang** per hari, beserta tanda susulan, koreksi, dinas, dan tanpa check-out. |
| RPT-03 | 4 | **[W]** Setiap report punya toggle **Sertakan Direksi & Dewan Pengawas**, mati secara default, berdasarkan Jenis Kepegawaian. |
| RPT-04 | 4 | **[W]** Ekspor fleksibel: pilih sumber, rentang, filter, kolom. Hasilnya XLSX dan CSV. |
| RPT-05 | 4 | **[W]** Report mematuhi aturan otorisasi yang sama dengan layar. Ekspor Audit Log hanya untuk `auditor` dan `super_admin`. |
| DSH-01 | 1 | **[W]** Setelah login, pengguna masuk ke **Beranda**. Dashboard pegawai menampilkan **jam check-in hari ini** sebagai informasi paling menonjol. Mulai Fase 4, Beranda juga memuat kartu *Individual Workblock Performance* dan nilai/predikat JMPD triwulan terakhir. |
| DSH-02 | 2 | **[W]** Dashboard HRD memuat *Perlu tindakan Anda* (pengajuan menunggu, tanpa check-out, percobaan luar radius, kontrak/sertifikat akan habis, pegawai tanpa akun, pegawai tanpa kontak darurat, reimbursement belum cair). Setiap baris menuju layar yang menyelesaikannya. |
| DSH-03 | 2 | **[W]** Kehadiran hari ini dan jumlah approval menunggu diperbarui otomatis **tiap 60 detik** selama layar terbuka, dan berhenti saat tab tidak aktif. |
| DSH-04 | 1 | **[W]** Filter tanggal punya **empat mode: Harian, Bulanan, Triwulan (TW I–IV + tahun), Rentang**. Triwulan mengikuti tahun kalender: TW I 1 Jan–31 Mar, TW II 1 Apr–30 Jun, TW III 1 Jul–30 Sep, TW IV 1 Okt–31 Des. Rentang dengan tanggal mulai setelah tanggal akhir ditolak dengan pesan di tempat filter. Bawaan: Harian untuk Beranda dan rekap kehadiran, **Triwulan untuk blok dan layar JMPD**, Bulanan untuk report dan Audit Log. Pilihan diingat per layar selama sesi. |
| DSH-05 | 1 | **[W]** Mengubah filter mengubah **semua** angka, teks, tabel, dan grafik di layar itu. Setiap angka dan grafik bisa diklik untuk membuka layar rinciannya. |
| DSH-06 | 3 | **[W]** Periode payroll yang belum dijalankan ditampilkan **"belum dijalankan"**, bukan nol. |
| DSH-07 | 1–4 | **[W]** Isi Beranda **berbeda per peran**, sesuai daftar di PRD §6.12. Bagian yang bukan hak pengguna tidak dimuat dari server sama sekali. Setiap bagian dibangun di fase modul sumber datanya. |
| DSH-08 | 1 | **[W]** Beranda Employee: presensi hari ini, peringatan presensi bolong + tombol ajukan susulan, aksi cepat (cuti, lembur, reimbursement, dinas, On Going Report), status pengajuan saya, saldo cuti + pengingat hangus, kehadiran bulan ini (tanpa nominal potongan), pengumuman belum dibaca. |
| DSH-09 | 3 | **[W]** Beranda Employee (lanjutan): slip terakhir (tautan), **daftar sisa plafon reimbursement per kategori**, **perjalanan dinas saya** (akan datang/berjalan, status uang muka, tenggat pertanggungjawaban), dan uang muka yang belum dipertanggungjawabkan. |
| DSH-10 | 4 | **[W]** Beranda Employee (JMPD): kartu *Individual Workblock Performance*, tenggat milestone terdekat, laporan ditolak, nilai dan predikat triwulan terakhir, diklat yang akan diikuti, sertifikat akan kedaluwarsa. Grafik: kehadiran saya per hari · Target vs Progress per milestone · nilai workblock per triwulan. |
| DSH-11 | 2–4 | **[W]** Beranda Manager/Atasan: perlu tindakan per jenis (tertunda > 3 hari ditandai), kehadiran tim hari ini dengan nama, kalender tim, workblock unit vs tenggat, bawahan tanpa laporan > 14 hari, progress penilaian triwulan, lembur tim. Manager KSU & Keuangan: payroll/berkas biaya di Tahap 3 dengan perbandingan bulan lalu. Grafik: kehadiran tim per hari · progress workblock unit vs target · sebaran nilai & predikat tim · jam lembur tim per bulan. |
| DSH-12 | 3–4 | **[W]** Beranda Direksi/Dirut: ringkasan per unit binaan, milestone strategis lewat tenggat, perlu tindakan (termasuk payroll/biaya Tahap 4 dengan perbandingan bulan lalu), penilaian Manager. Grafik: perbandingan unit · predikat per unit per triwulan · biaya SDM per bulan per kategori (total saja). |
| DSH-13 | 2–4 | **[W]** Beranda Admin HRD: perlu tindakan, kehadiran semua pegawai hari ini + tautan Laporan Presensi, kalender HR, tenggat kontrak/sertifikat/akhir probation, kelengkapan data, rekap belum disahkan + hitung mundur gajian, progress penilaian semua unit, diklat, uang muka lewat tenggat. Grafik: kehadiran per hari · cuti per jenis per bulan · lembur per unit · progress penilaian per unit. |
| DSH-14 | 3 | **[W]** Beranda Admin Payroll: status run + hitung mundur gajian, **checklist sebelum menghitung**, selisih per komponen dengan bulan lalu, run dikembalikan beserta alasan, berkas biaya yang perlu dihitung. Grafik: total payroll 12 bulan · komponen per bulan · selisih per komponen. Beranda Admin Finance: reimbursement menunggu, pembayaran menunggu di Tahap 5, konfirmasi pengembalian, pertanggungjawaban lewat tenggat, uang keluar bulan ini, anggaran diklat vs realisasi. Grafik: uang keluar per kategori per bulan · reimbursement per kategori · anggaran vs realisasi. |
| DSH-15 | 1 | **[W]** Beranda Auditor: status rantai Audit Log + tombol periksa, perubahan sensitif, reset sandi & akun terkunci, run final & penyesuaian; grafik perubahan sensitif per minggu. Beranda Super Admin: pekerjaan terjadwal, backup terakhir yang berhasil, sisa ruang cakram, ukuran basis data & folder berkas, masa berlaku sertifikat TLS, akun terkunci, perubahan peran, dan **peringatan pemisahan tugas** bagi pemegang kombinasi peran yang bertentangan. |

## 13. Pengumuman, surat, notifikasi

| ID | Fase | Kebutuhan |
|---|---|---|
| ANN-01 | 4 | **[W]** Pengumuman memuat judul, isi, masa tayang, dan sasaran: semua, unit tertentu, jenis kepegawaian tertentu, atau orang tertentu. |
| ANN-02 | 4 | **[W]** Server hanya mengirim pengumuman ke sasarannya. Pegawai bukan sasaran tidak bisa mengambilnya lewat panggilan server. |
| ANN-03 | 4 | **[W]** Sistem mencatat siapa sudah membaca, dan HRD bisa melihat daftarnya. |
| LET-01 | 4 | **[W]** Template surat adalah teks yang disimpan di tabel `template_surat`, dengan penanda `{{nama_variabel}}`, disunting Admin HRD lewat layar Template Surat. Variabel yang dikenali tercantum di layar. |
| LET-02 | 4 | **[W]** Mendaftarkan template yang memuat variabel tak dikenal **ditolak saat didaftarkan**, dengan daftar variabel yang salah. |
| LET-03 | 4 | **[W]** Surat dihasilkan sebagai PDF, disimpan di folder Surat, dan dicatat di tab `Surat`. |
| LET-04 | 4 | **[S]** Kolom nomor surat disiapkan di tab `Surat`. Penomoran otomatis belum dibangun. |
| NOT-01 | 2 | **[W]** Notifikasi di aplikasi untuk: pengajuan baru yang menunggu saya, hasil pengajuan saya, slip terbit, pengumuman baru, pengingat HRD, **uang muka dinas/diklat sudah ditransfer**, dan **tenggat pertanggungjawaban** (3 hari kerja sebelum dan saat lewat). **Diuji dengan:** pegawai A mengajukan cuti, lalu baris notifikasi muncul untuk atasan A. |
| NOT-02 | 2 | **[W]** Notifikasi punya status dibaca dan bisa ditandai dibaca, satu per satu atau semuanya. |
| NOT-03 | 2 | **[W]** Email dikirim untuk jenis yang sama, dan bisa dimatikan per jenis oleh setiap pengguna. Email tidak memuat data gaji maupun lampiran. |
| NOT-04 | 2 | **[W]** Bila kuota email harian habis, notifikasi di aplikasi tetap dibuat, dan kegagalan email tercatat untuk dikirim ulang keesokan harinya. |

## 14. Audit Log

| ID | Fase | Kebutuhan |
|---|---|---|
| AUD-01 | 1 | **[W]** Setiap penulisan ke database lewat **satu fungsi penulis**, yang mencatat ke `audit_log`: nomor urut, waktu, pelaku, aksi (tambah/ubah/hapus-logis), tabel, id baris, nilai sebelum, nilai sesudah, alasan. **Data dan catatannya ditulis dalam satu transaksi**, jadi keduanya berhasil bersama atau gagal bersama. Di Sheets keduanya dua tulisan terpisah, dan bila yang kedua gagal, data berubah tanpa jejak — untuk dana pensiun yang diawasi OJK itu temuan audit, bukan bug kecil. **Diuji dengan:** tes statis yang memastikan tidak ada `INSERT`/`UPDATE` di luar `repo.ts`. |
| AUD-02 | 1 | **[W]** Tidak ada fungsi aplikasi yang mengubah atau menghapus baris `audit_log` — dan ini bukan lagi soal disiplin pemrogram: `UPDATE` dan `DELETE` **dicabut** dari role `hris_app`, dan trigger menolak keduanya. **Diuji dengan:** mencoba `UPDATE audit_log` sebagai `hris_app`; harus ditolak basis data, bukan oleh kode aplikasi. |
| AUD-03 | 1 | **[W]** Setiap baris menyimpan `hash = SHA-256(hash_sebelumnya + isi baris)`, dan hash terakhir disimpan di tabel satu-baris `audit_rantai`. Layar Auditor punya tombol **Periksa rantai**, yang melaporkan baris pertama yang tidak cocok. **Diuji dengan:** mengubah satu baris `audit_log` lewat `psql` sebagai pemilik basis data — satu-satunya pihak yang bisa — lalu pemeriksaan melaporkan baris itu. |
| AUD-04 | 1 | **[W]** Data tidak pernah dihapus fisik. Penghapusan adalah **nonaktif/hapus-logis** yang tercatat. Pengecualiannya hanya penghapusan foto presensi 1 tahun (ATT-13), yang juga tercatat. |
| AUD-05 | 1 | **[W]** Audit Log bisa difilter per modul, rentang tanggal, pelaku, dan pegawai yang datanya berubah. |
| AUD-06 | 1 | **[W]** Kata sandi, token, dan hash kata sandi **tidak pernah** masuk ke nilai sebelum/sesudah. |

## 15. Pengaturan

| ID | Fase | Kebutuhan |
|---|---|---|
| SET-01 | 1 | **[W]** Master data yang dikelola lewat layar Pengaturan: unit (termasuk direktur pembina), jabatan (kelompok jabatan, posisi struktural, cara bayar lembur), tabel Grade SK, komponen gaji, jenis cuti, kategori & aturan reimbursement, kategori diklat, titik kantor, hari libur, jam kerja, kebijakan approval, daftar vendor outsource, Manager Tahap 3 payroll & biaya (bawaan KSU + Keuangan), tenggat pertanggungjawaban (bawaan 14 hari kerja), **Tarif Dinas** (kosong), dan **anggaran diklat** per tahun (Admin Finance). (UMP, tarif pajak, dan tarif BPJS **bukan** pengaturan layar: ketiganya diatur regulasi dan diperbarui Super Admin sebagai data tarif berversi, lihat PAY-22.) |
| SET-02 | 1 | **[W]** Master data yang sudah dipakai transaksi **tidak bisa dihapus**, hanya dinonaktifkan. Riwayat lama tetap terbaca. |
| SET-03 | 1 | **[W]** Jabatan selalu menunjuk posisi struktural. Unit selalu punya direktur pembina. |
| SET-04 | 1 | **[W]** Isian awal: tabel Grade SK 17/KPTS/VIII/2025 (lampiran), komponen gaji, jenis cuti versi UU, aturan reimbursement (RB-10), unit & jabatan sesuai PRD §4. |

## 16. Tampilan (pola JM-Click)

| ID | Fase | Kebutuhan |
|---|---|---|
| UI-01 | 1 | **[W]** **Bilah atas** tetap di semua halaman: tombol lipat sidebar, kotak pencarian menu, ikon Feedback (aktif mulai Fase 4), lonceng notifikasi dengan angka belum dibaca, **tombol tema terang/gelap**, dan foto profil (menu Profil, Ganti Kata Sandi, Keluar). |
| UI-02 | 1 | **[W]** **Sidebar kiri** bergaya UI DPJM sebelumnya: latar hijau tua penuh, menu dikelompokkan per seksi (HARIAN, SAYA, JMPD, PEGAWAI, KEUANGAN, KOMUNIKASI, LAPORAN, SISTEM), dan angka badge untuk Approval dan Notifikasi. Di atasnya ada blok profil ala JM-Click (nama, NPP, foto). |
| UI-02a | 1 | **[W]** Menu yang tampil **dihitung otomatis** dari posisi struktural dan peran admin, sesuai tabel aturan tampil di `design_final.md` §10.3. Menu yang tidak berhak tidak dirender, dan seksi yang kosong ikut disembunyikan. **Diuji dengan:** login sebagai Staff tanpa peran admin, lalu memastikan menu Approval, Rekap Kehadiran, PEGAWAI, KEUANGAN, KOMUNIKASI, LAPORAN, dan SISTEM tidak ada, dan membuka alamat Approval secara langsung ditolak server. |
| CHT-01 | 1–4 | **[W]** Chart hanya muncul di **Beranda** dan di **layar modul** yang ditentukan (PRD §6.12). Layar transaksi (formulir pengajuan, approval, data pegawai) tidak memuat chart. |
| CHT-02 | 1 | **[W]** Chart digambar sebagai **SVG oleh kode aplikasi sendiri**, tanpa pustaka chart dari luar. Warnanya memakai token tema sehingga benar di terang dan gelap. |
| CHT-03 | 1 | **[W]** Satu sumbu nilai per chart. Dua warna seri (`--c1`, `--c2`) ditambah `--track` untuk bagian tak terisi. Legenda wajib bila seri ≥ 2. |
| CHT-04 | 1 | **[W]** Nilai per titik tidak ditulis di tiap batang; muncul saat disentuh/diklik, dengan nominal Rupiah ditulis penuh. Mengklik chart membuka layar rinciannya. |
| CHT-05 | 1 | **[W]** Batang bertumpuk hanya dipakai bila periode memuat **≥ 10 hari kerja**; di bawah itu dipakai garis. |
| CHT-06 | 1–4 | **[W]** Semua chart mengikuti filter tanggal layar (Harian/Bulanan/Triwulan/Rentang) dan ikut berubah saat filter diubah. |
| CHT-07 | 3 | **[W]** Chart **perbandingan total run dengan bulan lalu** tampil di layar Payroll dan berkas biaya untuk Admin Payroll, **Manager KSU & Keuangan saat Tahap 3**, Direksi/Dirut saat Tahap 4, dan Admin Finance saat Tahap 5. |
| UI-03 | 1 | **[W]** Isi halaman berupa **kartu putih bertajuk** di atas latar abu-abu. Tabel memakai header abu-abu, baris 40 px, pencarian dan filter di atas tabel, tombol utama di kanan atas tabel, dan *row per pages* di bawah tabel. |
| UI-04 | 1 | **[W]** **Label status** berbentuk pil berwarna yang sama di seluruh aplikasi: Draft (abu), Waiting for Approval / Menunggu (kuning), Approved / Disetujui (biru), On Progress (oranye), Finished / Selesai (hijau), Ditolak (merah), Completed / Final (hijau tua). |
| UI-05 | 1 | **[W]** **Kartu ringkasan** berwarna lembut (seperti *Individual Workblock Performance*) dipakai untuk angka ringkasan di Beranda, Presensi, Approval, dan Payroll. Warnanya diambil dari token makna tema DPJM. |
| UI-06 | 1 | **[W]** Warna mengikuti tema DPJM (`design_final.md` §10). Tidak ada warna yang ditulis langsung di komponen; semuanya lewat token, sehingga tema gelap berlaku di semua layar. |
| UI-07 | 1 | **[W]** Di lebar < 900 px sidebar menjadi menu burger. Di lebar < 600 px muncul **menu bawah**: Beranda · Presensi · Pengajuan · Feedback · Profil. |
| UI-08 | 1 | **[W]** Formulir memakai label mengambang di dalam kotak isian, tanda \* untuk kolom wajib, dan pesan galat merah di bawah kolom yang salah, seperti formulir JM-Click. |

## 17. Kebutuhan non-fungsional

| ID | Kebutuhan | Cara mengukur |
|---|---|---|
| NFR-01 | Check-in selesai (dari tekan tombol sampai terkonfirmasi) **≤ 8 detik** di 4G, termasuk unggah foto | Diukur di 3 HP berbeda |
| NFR-02 | Layar pertama setelah login tampil **≤ 4 detik** | Diukur |
| NFR-03 | Semua layar berfungsi di lebar **360–390 px** tanpa gulir horizontal halaman. Menu utama berubah jadi tombol burger | `document.body.scrollWidth` = lebar viewport |
| NFR-04 | Tabel lebar menggulir **di dalam wadahnya**. Tidak ada `overflow-x: hidden` global | Pemeriksaan CSS |
| NFR-05 | Kontras teks ≥ 4,5:1, batas komponen ≥ 3:1, di tema terang dan gelap | Dihitung |
| NFR-06 | Satu tema DPJM dengan dua mode. **Terang adalah bawaan**, dan gelap dipilih lewat tombol di bilah atas (diingat per perangkat). Tidak mengikuti mode gelap sistem operasi | Tidak ada `prefers-color-scheme` yang mengubah tema otomatis |
| NFR-07 | Semua Rupiah memakai **satu** fungsi format `Rp 1.234.567` dengan locale `id-ID` dipatok | Pencarian kode |
| NFR-08 | Setiap tombol aksi menampilkan keadaan *sedang diproses*, *berhasil*, atau *gagal*. Tombol dinonaktifkan selama proses agar tidak terkirim dua kali | Telusuri setiap tombol tulis |
| NFR-09 | Keadaan kosong menyebutkan langkah berikutnya. Kolom kosong ditulis "Belum diisi" | Setiap daftar punya teks kosongnya |
| NFR-10 | Tindakan yang sulit ditarik kembali (reset sandi, nonaktifkan akun, sahkan rekap, setujui tahap payroll, terbitkan slip) meminta **konfirmasi** yang menyebutkan akibatnya | Telusuri |
| NFR-11 | Dialog bisa ditutup dengan Escape dan klik di luar, dan fokus masuk ke kolom pertama | Uji papan ketik |
| NFR-12 | **Backup harian ke luar mesin**: `pg_dump` terenkripsi ditambah berkas `/var/lib/hris`, disimpan 30 hari, **tidak di cakram yang sama** dengan servernya — backup di cakram yang sama tidak menolong saat cakram itu yang mati. **Pemulihan diuji tiap 3 bulan** ke lingkungan UJI | Catatan runbook, memuat tanggal uji pemulihan terakhir. Backup yang belum pernah dipulihkan dianggap belum ada |
| NFR-13 | Pengembangan memakai lingkungan **UJI** terpisah di cloud, dengan **versi PostgreSQL, Node, dan sistem operasi yang sama** dengan ASLI. Tidak ada perubahan kode yang masuk ASLI tanpa lewat UJI | Runbook. Versi dibandingkan otomatis saat deploy, dan deploy **berhenti** bila berbeda — "UJI lulus" di atas versi yang berbeda tidak membuktikan apa pun |
| NFR-14 | Semua fungsi hitung murni (jarak, menit terlambat, potongan, saldo cuti, lembur, plafon, payroll, PPh, THR, progress KPI) punya **tes otomatis** yang jalan di Node | `npm test` |
| NFR-15 | Tidak ada kredensial di repositori. Kata sandi basis data dan rahasia lain dibaca dari **variabel lingkungan** yang dipasang systemd dari berkas bermode 0600 milik `root`, tidak ikut `git`, dan tidak pernah masuk log maupun pesan galat | Pencarian kode; mode berkas rahasia diperiksa |
| NFR-16 | Waktu eksekusi setiap panggilan server ≤ 30 detik; pekerjaan berat (hitung payroll, backup) ≤ 5 menit. Batas 6 menit per eksekusi, 90 menit trigger/hari, dan 30 eksekusi bersamaan **hilang** — yang membatasi sekarang hanya mesinnya sendiri | Log aplikasi |
| NFR-17 | Runbook memuat: menyiapkan server dari nol, deploy ke UJI lalu ASLI beserta cara kembali ke versi sebelumnya, **pemulihan backup**, pembaruan sertifikat TLS, menambal OS & PostgreSQL, mencabut akses pegawai yang keluar, run penyesuaian, pemeriksaan pekerjaan terjadwal, pemeriksaan rantai Audit Log, dan **apa yang dikerjakan manual selama server mati** | Berkas ada dan pernah diikuti orang selain penulisnya |

## 18. Yang sengaja belum ditentukan

| Hal | Menunggu |
|---|---|
| LV-09 Cuti Besar, cuti bersama | Peraturan Perusahaan |
| RB-11 Plafon reimbursement Pegawai | Peraturan Perusahaan |
| PAY-24 PPh 21 Dewan Pengawas | Contoh hitungan Keuangan |
| PAY-29 Ekspor Coretax | File converter BPMP, BP21, BPA1 |
| PAY-31 Prorata pegawai baru | Konfirmasi pemilik |
| Batas upah JP & kelas JKK 2026 | Keuangan |
| Opsi jadwal THR per agama (keputusan bawaan: **serentak**) | Permintaan HR; butuh data agama pegawai + master hari raya per agama |
| BIA-11 Isi tarif uang harian, transport, penginapan | Pemilik / Finance |
| NPS-01 Survey NPS 360 | Pemilik |
