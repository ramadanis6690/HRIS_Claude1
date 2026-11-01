# Konfigurasi Server — HRIS DPJM

Panduan memasang aplikasi di server, untuk lingkungan **UJI** (cloud, data contoh) maupun **ASLI** (server kantor). Langkahnya sama, kecuali yang ditandai. Alasan setiap butir ada di `PERMINTAAN_IT.md`. Dokumen ini hanya berisi cara mengerjakannya.

Semua perintah dijalankan sebagai `root` (atau dengan `sudo`) di Ubuntu 24.04. Nilai yang harus diganti ditulis `GANTI_…`.

---

## 0. Yang diputuskan lebih dulu

Langkah 7–9 tidak bisa diselesaikan tanpa jawaban ini (PERMINTAAN_IT §4, §5, §7):

| Keputusan | Dipakai di |
|---|---|
| Nama domain, mis. `hris.dpjm.co.id`, dan siapa pemegang DNS-nya | Langkah 8 (Nginx + TLS) dan `HRIS_ASAL_SAH` |
| Sertifikat: Let's Encrypt (otomatis) atau CA korporat | Langkah 8 |
| Tujuan backup di luar mesin (NAS yang di-mount, atau server lain lewat rsync) | Langkah 9 |
| Siapa yang memegang kunci privat GPG untuk membuka backup | Langkah 9 |
| Siapa yang menambal OS dan PostgreSQL | `docs/RUNBOOK.md` §5 |

---

## 1. Paket

```bash
apt update && apt install -y postgresql-16 postgresql-contrib-16 nginx git gnupg rsync curl ca-certificates
# Node.js 22 LTS dari NodeSource (repositori Ubuntu masih di versi lama)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version      # harus v22.x
psql --version      # harus 16.x
timedatectl set-timezone Asia/Jakarta && timedatectl set-ntp true
```

Untuk Let's Encrypt tambahkan `apt install -y certbot`.

**Versi harus sama di UJI dan ASLI**: sistem operasi, PostgreSQL mayor, dan Node mayor. Skrip deploy memeriksanya (langkah 10).

## 2. Pengguna sistem dan folder

```bash
useradd --system --no-create-home --home-dir /opt/hris --shell /usr/sbin/nologin hris
install -d -o hris -g hris -m 0750 /opt/hris /var/lib/hris
install -d -o root -g root -m 0700 /etc/hris
```

## 3. Kode aplikasi

```bash
sudo -u hris -H git clone https://github.com/ramadanis6690/HRIS_Claude1.git /opt/hris
cd /opt/hris
sudo -u hris -H npm ci --no-audit --no-fund
sudo -u hris -H npm run build
```

Aplikasi diambil dari cabang `main`. Selama perubahan Fase 1 belum digabung ke `main`, jalankan dulu `sudo -u hris git checkout claude/eloquent-babbage-ikxous` sebelum `npm ci`. Bila repositorinya privat, buat *deploy key* hanya-baca di GitHub untuk pengguna `hris`.

## 4. PostgreSQL

PostgreSQL cukup mendengar di localhost. Di Ubuntu itu sudah bawaan: pastikan `listen_addresses = 'localhost'` di `/etc/postgresql/16/main/postgresql.conf`, dan tambahkan `log_min_duration_statement = 1000`. Port 5432 ditutup di firewall.

Buat dua role dan basis data dengan skrip yang ada di repo:

```bash
cd /tmp && sudo -u postgres DATABASES="hris" bash /opt/hris/scripts/siapkan-db.sh
# Di UJI:  DATABASES="hris_uji" atau keduanya
```

Skrip itu mencetak dua baris `DATABASE_URL` dan `DATABASE_URL_PEMILIK`, dengan kata sandi acak. Salin keduanya ke langkah 5. Yang dibuatnya:

- `hris_pemilik`: pemilik basis data, dipakai **hanya** untuk migrasi. Ia diberi `CREATEROLE` dan `ADMIN` atas `hris_app`, karena migrasi 001 menjalankan `ALTER ROLE hris_app SET timezone`, dan PostgreSQL 16 menolaknya tanpa kedua hak itu. Kata sandinya dipegang IT.
- `hris_app`: role aplikasi. Hak `DELETE` dicabut, dan Audit Log tidak bisa diubahnya. Pengecualiannya hanya tabel `sesi`, untuk membuang sesi kedaluwarsa (migrasi 003).

## 5. Berkas rahasia `/etc/hris/env`

```bash
install -m 0600 -o root -g root /opt/hris/deploy/env.contoh /etc/hris/env
nano /etc/hris/env
```

Isi semua `GANTI_…`:

- `HRIS_LINGKUNGAN`: `asli` di server kantor, `uji` di UJI.
- `DATABASE_URL`, `DATABASE_URL_PEMILIK`: dari langkah 4.
- `HRIS_ASAL_SAH`: alamat publik persis, mis. `https://hris.dpjm.co.id`.
- `HRIS_BACKUP_TUJUAN`, `HRIS_BACKUP_GPG_PENERIMA`: dari langkah 9.

Berkas ini tidak pernah masuk git, dan isinya tidak pernah ditulis ke log.

## 6. Migrasi skema dan Super Admin pertama

```bash
cd /opt/hris
set -a; source /etc/hris/env; set +a
sudo -u hris -E HRIS_ENV_FILE=/tidak-ada npm run migrasi
sudo -u hris -E HRIS_ENV_FILE=/tidak-ada npm run buat-super-admin -- --npp GANTI_NPP --nama "GANTI NAMA" --email GANTI@dpjm.co.id
```

Kata sandi sementara Super Admin tampil **sekali** dan wajib diganti saat login pertama. Super Admin lalu:

1. Pengaturan → **Titik Kantor**: klik lokasi kantor di peta, pilih radius.
2. Pengaturan → **Hari Libur**: isi libur nasional tahun berjalan.
3. Pengaturan → **Tabel Grade**: isi dari lampiran SK 17/KPTS/VIII/2025.
4. Data Pegawai → unduh **Templat Excel**, isi 20 pegawai, lalu **Impor Excel**.
5. Pengaturan → **Unit**: tetapkan direktur pembina tiap unit.
6. User Management → **Buatkan semua** akun, lalu berikan peran admin (Admin HRD, Payroll, Finance, Auditor).

**Di UJI saja**, data contoh bisa dipakai sebagai pengganti langkah 4–6: `sudo -u hris -E HRIS_ENV_FILE=/tidak-ada npm run isi-contoh`. Skrip itu menolak berjalan di ASLI.

## 7. Layanan dan pekerjaan terjadwal (systemd)

```bash
cp /opt/hris/deploy/systemd/* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now hris.service
systemctl enable --now hris-backup.timer hris-hapus-foto.timer hris-nonaktifkan-berhenti.timer \
                       hris-bersihkan.timer hris-pengingat.timer hris-sesi.timer
systemctl list-timers 'hris-*'
curl -s http://127.0.0.1:3000/api/sehat     # {"ok":true}
```

Yang terpasang sekarang adalah satu layanan dan **enam** timer. PERMINTAAN_IT §6 menyebut delapan; dua sisanya (pengingat pertanggungjawaban 06.15 dan kirim ulang email 07.00) ditambahkan bersama modulnya di Fase 2–3.

Bila Node terpasang di tempat lain selain `/usr/bin/node`, sesuaikan `ExecStart` di `hris.service` dan `hris-pekerjaan@.service`.

## 8. Nginx dan HTTPS

```bash
cp /opt/hris/deploy/nginx/hris.conf /etc/nginx/sites-available/hris
sed -i 's/hris.GANTI-DOMAIN/hris.dpjm.co.id/g' /etc/nginx/sites-available/hris   # nama domain sungguhan
ln -s /etc/nginx/sites-available/hris /etc/nginx/sites-enabled/hris
rm -f /etc/nginx/sites-enabled/default
```

**Let's Encrypt:** sebelum sertifikat ada, Nginx belum bisa memuat blok 443. Terbitkan dulu, lalu muat ulang:

```bash
install -d /var/www/letsencrypt
certbot certonly --webroot -w /var/www/letsencrypt -d hris.dpjm.co.id   # butuh port 80 terbuka
nginx -t && systemctl reload nginx
systemctl list-timers certbot*        # perpanjangan otomatis
```

**CA korporat:** taruh sertifikat dan kuncinya, lalu sesuaikan `ssl_certificate` dan `ssl_certificate_key`.

Firewall: buka **443** dari internet; **80** hanya untuk pengalihan dan perpanjangan sertifikat; **5432** tertutup dari mana pun.

GPS dan kamera di HP **hanya jalan lewat HTTPS**. Tanpa langkah ini, presensi tidak bisa dipakai dari HP.

## 9. Backup ke luar mesin

1. Di komputer IT (bukan di server), buat pasangan kunci GPG khusus backup:
   `gpg --quick-gen-key "HRIS DPJM Backup" rsa4096 encrypt never`.
   Simpan kunci privat dan frasa sandinya di tempat aman, misalnya brankas atau pengelola kata sandi IT.
2. Ekspor **kunci publik** saja ke server, lalu impor sebagai root:
   `gpg --import hris-backup-publik.asc`. Isi sidik jarinya ke `HRIS_BACKUP_GPG_PENERIMA`.
3. Tujuan:
   - **NAS yang di-mount** (disarankan): mount ke `/mnt/backup-hris` (NFS/SMB, dicatat di `/etc/fstab`), lalu isi `HRIS_BACKUP_TUJUAN=/mnt/backup-hris`. Skrip **menolak** folder yang ternyata ada di cakram yang sama dengan server, dan menghapus arsip yang lebih tua dari 30 hari.
   - **rsync ke server lain**: `HRIS_BACKUP_TUJUAN=backup@nas.kantor:/backup/hris/`, dengan kunci SSH root ke tujuan. Retensi 30 hari diatur di tujuan.
4. Uji sekali sekarang: `systemctl start hris-backup.service && journalctl -u hris-backup -n 20`.
5. **Uji pemulihan** ke UJI (wajib sekali sebelum dipakai, lalu tiap 3 bulan): `docs/RUNBOOK.md` §3.

## 10. Deploy berikutnya

```bash
cd /opt/hris
sudo bash deploy/deploy.sh uji     # di mesin UJI
sudo bash deploy/deploy.sh asli    # di server kantor, setelah UJI lulus
```

Di UJI, skrip mencetak baris versi, mis. `Ubuntu 24.04.5 LTS|16|22`. Salin ke `/etc/hris/env` di server kantor sebagai `HRIS_VERSI_UJI="…"`. Deploy ke ASLI **berhenti** bila versinya berbeda (NFR-13).

---

## Pemeriksaan setelah terpasang

| ✓ | Butir |
|---|---|
| ☐ | `https://<domain>` membuka layar login; `http://` dialihkan ke `https://` |
| ☐ | `curl -s https://<domain>/api/sehat` menjawab `{"ok":true}` |
| ☐ | Port 5432 tidak bisa dihubungi dari luar server |
| ☐ | Super Admin bisa login dan wajib mengganti kata sandi sementara |
| ☐ | Check-in dari **HP Android (Chrome)** dan **iPhone (Safari)**: izin lokasi dan kamera diminta, foto terkirim, jam tercatat (design §2.2) |
| ☐ | Check-in dari luar radius ditolak dengan jaraknya |
| ☐ | Beranda Super Admin → Pekerjaan terjadwal: semua hijau setelah 24 jam |
| ☐ | Backup pertama berhasil, dan arsipnya ada di tujuan |
| ☐ | Satu kali pemulihan ke UJI berhasil, dan "Periksa rantai" melaporkan utuh. Tanggalnya dicatat di RUNBOOK |
| ☐ | Nama orang yang menambal server tercatat di RUNBOOK §5 |
