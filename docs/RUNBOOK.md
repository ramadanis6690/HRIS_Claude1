# Runbook — HRIS DPJM

Prosedur operasional (SRS NFR-17). Ditulis supaya bisa diikuti orang selain penulisnya. Perintah dijalankan sebagai `root` di server. Pemasangan dari nol ada di `docs/KONFIGURASI_SERVER.md`.

**Catatan wajib diisi**

| Hal | Isi |
|---|---|
| Penanggung jawab tambalan OS & PostgreSQL | _(nama, kontak)_ |
| Kontak bila server mati di luar jam kerja | _(nama, kontak)_ |
| Pemegang kunci privat GPG backup | _(nama)_ |
| Tanggal uji pemulihan terakhir | _(yyyy-mm-dd, oleh siapa, hasil)_ |

---

## 1. Menyiapkan server dari nol

Ikuti `docs/KONFIGURASI_SERVER.md` langkah 0–10, lalu tabel *Pemeriksaan setelah terpasang*. Paket dan alasannya ada di `PERMINTAAN_IT.md`.

## 2. Deploy ke UJI lalu ASLI, dan kembali ke versi sebelumnya

```bash
cd /opt/hris && sudo bash deploy/deploy.sh uji      # di mesin UJI
# uji alur di UJI (checklist PRD §11), lalu di server kantor:
cd /opt/hris && sudo bash deploy/deploy.sh asli
```

Deploy mengambil kode, `npm ci`, membangun, menjalankan migrasi yang belum diterapkan, lalu memuat ulang layanan. Di ASLI ia berhenti bila versi OS, PostgreSQL, atau Node berbeda dari UJI.

**Kembali ke versi sebelumnya.** Deploy mencetak hash commit sebelumnya.

```bash
cd /opt/hris
sudo -u hris -H git checkout <hash-sebelumnya>
sudo -u hris -H npm ci && sudo -u hris -H npm run build
systemctl restart hris.service
```

Migrasi tidak pernah dibatalkan otomatis. Bila versi baru membawa migrasi, kembali ke kode lama hanya aman selama migrasi itu menambah (kolom/tabel baru), bukan mengubah. Bila ragu, pulihkan backup sebelum deploy (§3) di UJI dulu.

## 3. Memulihkan dari backup

Backup dibuat setiap 01.00 WIB oleh `hris-backup.timer` ke `HRIS_BACKUP_TUJUAN`, terenkripsi GPG, dan disimpan 30 hari.

**Uji pemulihan tiap 3 bulan, ke UJI, bukan ke ASLI:**

1. Salin arsip terbaru (`hris-yyyymmdd-hhmm.tar.gpg` beserta `.sha256`) ke mesin UJI.
2. Pastikan kunci privat GPG tersedia di mesin itu (dibawa pemegangnya).
3. `sudo bash /opt/hris/deploy/pulihkan.sh <arsip.tar.gpg> hris_uji /var/lib/hris`
4. Masuk sebagai Auditor → Audit Log → **Periksa rantai**. Hasilnya harus *utuh*.
5. Buka satu e-CV dan satu foto presensi.
6. Catat tanggal dan hasilnya di tabel atas.

**Pemulihan sungguhan di ASLI** memakai perintah yang sama dengan basis data `hris`. Skrip memeriksa sha256 dan isi arsip lebih dulu, menghentikan layanan, lalu mengganti basis data dalam **satu transaksi** (bila gagal di tengah, isi lama tetap utuh), mengganti folder berkas, dan menyalakan layanan lagi. Data yang masuk sejak backup terakhir hilang; catat apa yang perlu dimasukkan ulang (§9).

## 4. Sertifikat TLS

- **Let's Encrypt:** diperpanjang otomatis oleh `certbot.timer`. Periksa dengan `certbot certificates` dan `systemctl list-timers certbot*`.
- **CA korporat:** pasang sertifikat baru di jalur `ssl_certificate`, lalu `nginx -t && systemctl reload nginx`.
- **Telanjur kedaluwarsa:** browser menolak membuka aplikasi, dan GPS serta kamera berhenti. Perbarui sertifikat (`certbot renew --force-renewal` atau pasang yang baru), `systemctl reload nginx`. Selama itu, berlakukan §9.

## 5. Menambal sistem operasi dan PostgreSQL

Penanggung jawab: lihat tabel atas. Tanpa nama di sana, risiko PRD §8 tidak tertangani.

```bash
apt update && apt list --upgradable
apt upgrade -y                      # termasuk postgresql-16 versi minor
systemctl restart postgresql hris.service
curl -s http://127.0.0.1:3000/api/sehat
```

- Pembaruan keamanan otomatis disarankan: `apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.
- **Naik versi mayor** (PostgreSQL 17, Node 24, Ubuntu baru) dikerjakan di UJI dulu, lalu ASLI, karena deploy membandingkan versi mayor keduanya.

## 6. Mencabut akses pegawai yang keluar

Admin HRD → Data Pegawai → pegawai itu → **Ubah status** → *Berhenti* dengan tanggal dan alasan.

- Akun nonaktif otomatis pada hari setelah tanggal berhenti (pekerjaan 02.30, USR-09), dan semua sesinya dicabut.
- Bila harus seketika: User Management → **Nonaktifkan** (alasan wajib). Sesi langsung dicabut (AUTH-12).
- Tidak ada yang terhapus: presensi, riwayat, dan Audit Log tetap tersimpan.
- Bila orang itu memegang peran admin, Super Admin mencabutnya di User Management → Peran.

## 7. Payroll telanjur final dengan angka salah

Modul payroll dibangun di Fase 3. Prosedurnya akan berupa **run penyesuaian** yang merujuk run asal (design §8.8). Slip yang sudah final tidak pernah diubah.

## 8. Memeriksa pekerjaan terjadwal dan rantai Audit Log

- Super Admin → **Status Sistem**: setiap pekerjaan menunjukkan kapan terakhir berhasil. Merah = lebih dari 26 jam (2 jam untuk `sesi`) atau gagal.
- Di server: `systemctl list-timers 'hris-*'` dan `journalctl -u 'hris-pekerjaan@*' -u hris-backup --since today`.
- Menjalankan satu pekerjaan sekarang: `systemctl start hris-pekerjaan@hapus-foto.service`.
- Auditor → Audit Log → **Periksa rantai**. Bila *tidak utuh*, layar menyebut nomor baris pertama yang tidak cocok. Bandingkan dengan backup sebelum tanggal baris itu (pulihkan ke UJI, §3), dan laporkan sebagai insiden.

## 9. Bila server mati

**Dikerjakan manual selama mati:**

- Presensi: setiap pegawai mencatat jam datang dan pulang di formulir kertas yang ditandatangani atasan, atau mengirim foto + lokasi lewat grup pesan unit ke Admin HRD.
- Persetujuan dan payroll menunggu server hidup, kecuali payroll yang harus final hari itu: siapkan dari rekap terakhir dan catat sebagai penyesuaian.

**Setelah hidup kembali:**

1. `curl -s http://127.0.0.1:3000/api/sehat`, lalu cek Status Sistem dan Periksa rantai.
2. Admin HRD memasukkan presensi hari-hari mati lewat Rekap Kehadiran → **Koreksi**, dengan alasan *"Server mati <tanggal>, data dari formulir kertas"*. Koreksi tercatat di Audit Log dan ditandai di rekap.
3. Bila pemulihan dari backup dilakukan, masukkan ulang perubahan sejak backup terakhir dari catatan manual.

**Server tidak menyala:** periksa `systemctl status hris postgresql nginx`, `journalctl -u hris -n 100`, sisa cakram (`df -h`; cakram penuh menghentikan basis data), dan masa berlaku sertifikat.
