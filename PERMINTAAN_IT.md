# Permintaan ke IT — Server HRIS Dana Pensiun Jasa Marga

**Tanggal:** 14 Oktober 2026
**Pemohon:** Unit Kepesertaan, SDM & Umum
**Untuk:** pengelola server kantor

Dokumen ini satu permintaan utuh, disusun supaya tidak perlu bolak-balik. Setiap butir disertai **alasannya**, supaya IT bisa menilai, bukan sekadar menjalankan. Yang ditandai **[WAJIB]** memblokir pembangunan; **[PERLU KEPUTUSAN]** butuh jawaban, bukan pekerjaan.

Aplikasinya: sistem kepegawaian internal untuk **20 orang** — presensi, cuti, lembur, penggajian, penilaian kinerja. Dibuka dari browser HP dan laptop, di kantor maupun di luar kantor.

---

## 0. Yang pertama dibutuhkan: keadaan server sekarang

**[WAJIB]** Tolong jalankan ini di server dan kirimkan keluarannya:

```bash
cat /etc/os-release; echo "---"; nproc; free -h; df -h /; echo "---"; which docker psql nginx node
```

*Alasannya:* lingkungan uji harus memakai **versi sistem operasi dan PostgreSQL yang sama** dengan server ini. Tanpa keluaran ini, lingkungan uji tidak bisa disiapkan, dan "sudah lulus uji" tidak membuktikan apa pun.

---

## 1. Perangkat lunak yang dipasang

**[WAJIB]**

| Paket | Versi | Alasannya |
|---|---|---|
| PostgreSQL | **16** atau lebih baru | Basis data. Versi 16 ke atas karena skemanya memakai `gen_random_uuid()` bawaan dan constraint `EXCLUDE USING gist` |
| `postgresql-contrib` | sesuai versi di atas | Ekstensi `btree_gist`, dipakai untuk mencegah periode gaji bertumpang tindih |
| Node.js | **22 LTS** | Server aplikasi |
| Nginx | versi repositori | Penerima HTTPS, penerus ke aplikasi di localhost |
| `git` | versi repositori | Pengambilan kode saat deploy |

Docker **tidak diperlukan**. Aplikasinya satu proses Node dan satu PostgreSQL, keduanya langsung di sistem operasi.

---

## 2. Pengguna sistem dan folder

**[WAJIB]**

| Hal | Nilai | Alasannya |
|---|---|---|
| Pengguna sistem | `hris`, tanpa shell login (`/usr/sbin/nologin`) | Aplikasi tidak berjalan sebagai `root`. Bila aplikasinya ditembus, yang didapat penyerang hanya hak pengguna ini |
| Folder kode | `/opt/hris` — pemilik `hris`, mode `0750` | |
| Folder berkas | `/var/lib/hris` — pemilik `hris`, mode `0750` | Foto presensi, scan KTP/KK/NPWP, lampiran, PDF surat. **Isinya data pribadi pegawai**, jadi tidak boleh terbaca pengguna lain di mesin itu |
| Folder rahasia | `/etc/hris/env` — pemilik `root`, mode `0600` | Kata sandi basis data. Dibaca systemd saat menjalankan layanan; tidak pernah masuk `git` dan tidak pernah masuk log |
| Zona waktu | `Asia/Jakarta`, dan NTP aktif | Jam presensi dan keterlambatan dihitung dari jam server. Jam server yang melenceng 3 menit berarti potongan keterlambatan yang salah |

---

## 3. PostgreSQL

**[WAJIB]**

| Hal | Nilai | Alasannya |
|---|---|---|
| `listen_addresses` | **`localhost` saja** | Basis data **tidak boleh** bisa dihubungi dari jaringan, termasuk dari dalam kantor. Satu-satunya yang bicara dengannya adalah proses Node di mesin yang sama |
| Basis data | `hris` dan `hris_uji` | |
| Role aplikasi | `hris_app`, dengan kata sandi acak panjang | Aplikasi **tidak pernah** tersambung sebagai pemilik basis data. Hak `DELETE` dicabut dari role ini, dan Audit Log tidak bisa diubahnya — bahkan bila ada bug di kode |
| Pemilik basis data | role terpisah (`hris_pemilik`), kata sandinya dipegang IT, dengan `CREATEROLE` dan `ADMIN` atas `hris_app` | Dipakai hanya untuk migrasi skema. Kedua hak itu diperlukan karena migrasi pertama mengatur zona waktu role aplikasi (`ALTER ROLE hris_app SET timezone`), yang ditolak PostgreSQL 16 tanpa keduanya. Skrip `scripts/siapkan-db.sh` memasangnya |
| `log_min_duration_statement` | `1000` | Kueri yang lebih dari 1 detik dicatat, supaya pelambatan terlihat sebelum dikeluhkan orang |

Skemanya ada di folder `skema/` dalam repositori aplikasi (`001_skema_awal.sql` dan migrasi berikutnya), dijalankan dengan `npm run migrasi` sebagai pemilik basis data. Langkah lengkapnya ada di `docs/KONFIGURASI_SERVER.md`.

---

## 4. Jaringan, domain, dan sertifikat

**[WAJIB]**

| Hal | Kebutuhan | Alasannya |
|---|---|---|
| Masuk dari internet | Port **443** terbuka dari internet | Pegawai check-in dari HP, dan Direksi menyetujui cuti saat dinas luar kota. Tanpa ini aplikasinya hanya berguna di dalam kantor |
| Port 80 | Terbuka **hanya** untuk pengalihan ke 443 dan perpanjangan sertifikat | |
| Port 5432 | **Tertutup dari mana pun** | Lihat §3 |
| Nginx | Batas unggah **10 MB**, dan pembatasan laju khusus di alamat login | Foto presensi ±2 MB. Pembatasan laju menahan percobaan tebak kata sandi |

**[PERLU KEPUTUSAN]**

| Pertanyaan | Mengapa penting |
|---|---|
| **Nama domain** apa yang dipakai, dan siapa yang memegang DNS-nya? | Dibutuhkan sebelum sertifikat bisa diterbitkan |
| Sertifikat dari **Let's Encrypt** (otomatis, gratis) atau **CA korporat** Jasa Marga? | Menentukan cara perpanjangannya. Bila CA korporat, siapa yang memperbarui dan kapan |
| Siapa yang **dihubungi bila sertifikat mau kedaluwarsa**? | Sertifikat kedaluwarsa berarti 20 orang berhenti bekerja serentak, dan selalu terjadi di hari yang paling tidak diinginkan |

---

## 5. Backup — butir yang paling sering ditunda, dan paling mahal bila diabaikan

**[WAJIB]**

| Hal | Kebutuhan | Alasannya |
|---|---|---|
| Isi backup | `pg_dump` basis data **dan** salinan `/var/lib/hris` | Basis data tanpa berkasnya tidak bisa menerbitkan ulang slip gaji atau menampilkan bukti reimbursement |
| Tujuan | **Di luar mesin ini** — NAS, server lain, atau penyimpanan kantor | Backup di cakram yang sama tidak menolong saat cakram itu yang mati. Ini satu-satunya butir yang kalau salah membuat semua butir lain tidak ada artinya |
| Jadwal & retensi | Harian, disimpan 30 hari | |
| Enkripsi | Berkas backup terenkripsi | Isinya gaji, NIK, dan NPWP 20 orang |
| Uji pemulihan | **Tiap 3 bulan**, dipulihkan ke lingkungan uji, tanggalnya dicatat | Backup yang belum pernah dipulihkan belum terbukti ada |

**[PERLU KEPUTUSAN]** Ke mana backup disimpan, dan siapa yang memegang kunci enkripsinya?

---

## 6. Layanan dan pekerjaan terjadwal

**[WAJIB]** Izin membuat satu layanan systemd (`hris.service`) dan **delapan** systemd timer. Berkasnya ada di `deploy/systemd/`; enam terpasang di Fase 1, dua sisanya (06.15 dan 07.00) menyusul bersama modulnya.

Pekerjaannya ringan — ini kantor 20 orang, bukan ribuan:

| Waktu (WIB) | Pekerjaan |
|---|---|
| 01.00 | Backup basis data dan berkas |
| 02.00 | Hapus foto presensi berumur lebih dari 365 hari |
| 02.30 | Nonaktifkan akun pegawai yang tanggal berhentinya sudah lewat |
| 03.00 | Hapus berkas ekspor lebih dari 7 hari dan sesi kedaluwarsa |
| 06.00 | Pengingat kontrak berakhir, sertifikat kedaluwarsa |
| 06.15 | Pengingat pertanggungjawaban perjalanan dinas |
| 07.00 | Kirim ulang email yang tertunda |
| Tiap jam | Bersihkan sesi yang dicabut |

---

## 7. Pemeliharaan — butir yang butuh orang, bukan pengaturan

**[PERLU KEPUTUSAN]** dan ini yang paling penting di seluruh dokumen:

| Pertanyaan | Mengapa penting |
|---|---|
| **Siapa yang menambal sistem operasi dan PostgreSQL, dan seberapa sering?** | Mesin ini memuat gaji, NIK, dan NPWP 20 orang, dan terbuka ke internet di port 443. Tanpa nama orang yang bertanggung jawab, lubang keamanan bisa terbuka berbulan-bulan tanpa ada yang tahu. Menuliskan risiko ini di dokumen tidak menanganinya |
| Pembaruan keamanan otomatis (`unattended-upgrades`) boleh dinyalakan? | Mengurangi ketergantungan pada ingatan orang |
| Siapa yang dihubungi bila server mati di luar jam kerja? | Skenario terburuk: server mati Jumat sore sementara payroll harus final Senin |
| Pemantauan cakram penuh dan layanan mati — sudah ada di kantor, atau perlu disiapkan? | Cakram penuh menghentikan basis data tanpa pemberitahuan |

---

## 8. Spesifikasi minimum

Untuk 20 pengguna, kebutuhannya kecil. Yang menentukan ukuran cakram adalah foto presensi, bukan basis datanya.

| | Minimum | Nyaman |
|---|---|---|
| CPU | 2 inti | 4 inti |
| RAM | 4 GB | 8 GB |
| Cakram | 50 GB | 100 GB |

*Perkiraan pertumbuhan:* basis data di bawah 1 GB per tahun (presensi ±5.000 baris/tahun, Audit Log ±60.000 baris/tahun). Foto presensi ±300 MB per tahun, dan dihapus otomatis setelah 1 tahun. Puncak beban adalah 20 orang check-in dalam 30 menit setiap pagi.

---

## 9. Lingkungan uji

**[PERLU KEPUTUSAN]** Lingkungan uji akan dijalankan di cloud memakai kredit yang sudah dimiliki unit, **bukan** di server kantor, dan **tidak memuat data pegawai sungguhan** — hanya data contoh.

| Pertanyaan | |
|---|---|
| Apakah IT mengizinkan lingkungan uji berada di luar kantor, mengingat isinya data contoh? | |
| Bila tidak diizinkan, bisakah lingkungan uji diletakkan di server yang sama dengan basis data `hris_uji` terpisah? | Lebih sederhana, tapi uji yang merusak bisa mengganggu server yang dipakai orang |

Syaratnya satu dan tidak bisa dinegosiasikan: **versi sistem operasi, PostgreSQL, dan Node di lingkungan uji harus sama dengan server kantor.** Kalau berbeda, hasil ujinya tidak berarti.

---

## Ringkasan yang dibutuhkan dari IT

**Pekerjaan:**
1. Keluaran perintah di §0
2. Pasang paket di §1
3. Buat pengguna sistem dan folder di §2
4. Pasang dan atur PostgreSQL di §3
5. Buka port 443, tutup 5432, pasang Nginx (§4)
6. Siapkan backup ke luar mesin (§5)
7. Izin membuat layanan dan timer systemd (§6)

**Keputusan:**
1. Nama domain dan pemegang DNS (§4)
2. Sumber sertifikat TLS dan siapa yang memperbaruinya (§4)
3. Tujuan backup dan pemegang kunci enkripsi (§5)
4. **Siapa yang bertanggung jawab menambal server** (§7)
5. Kontak bila server mati di luar jam kerja (§7)
6. Izin lingkungan uji di cloud (§9)
7. Pengaturan SMTP untuk notifikasi email, bila kantor punya mail server sendiri
