---
name: hris-dpjm
description: Pola tetap proyek HRIS Dana Pensiun Jasa Marga (PostgreSQL 16 + Node 22 + React 19/Vite/TypeScript, server milik DPJM). Baca SEBELUM menulis atau mengubah kode, migrasi skema/*.sql, aksi API, fungsi core/*, tes, layar, atau pekerjaan terjadwal di repo ini, dan sebelum menyusun rencana implementasi. Memuat sumber kebenaran, jalur tulis tunggal, aturan basis data, cara menambah aksi, mesin hitung murni, tema, tes, serta pola lama Apps Script/Sheets yang tidak boleh dipakai lagi.
---

# HRIS DPJM — pola tetap proyek

Skill ini ringkasan yang bisa ditindaklanjuti. Rinciannya ada di dokumen; nomor bagian disebut supaya bisa dibuka langsung.

## 1. Sumber kebenaran

| Pertanyaan | Dokumen |
|---|---|
| Apa yang harus dilakukan aplikasi | `SRS_final.md` (ID kebutuhan: EMP-, PAY-, AUD-, NFR-, …), `PRD_final.md` |
| Bagaimana membangunnya | `design_final.md` |
| Tipe kolom, constraint, hak akses role | `skema/001_skema_awal.sql`, ditambah migrasi bernomor berikutnya |
| Kebutuhan server | `PERMINTAAN_IT.md` |
| Angka uang | Fixture hitungan manual Keuangan di `test/fixtures/payroll/`. **Bila fixture berbeda dari rumus di design, fixture yang menang** dan rumusnya diperbarui (§8.7) |

`brainstorming_HRIS.md` adalah riwayat (masih Apps Script + Sheets). Jangan dipakai sebagai rancangan.

Bila SRS dan design tampak bertentangan, **tanyakan ke pemilik**. Jangan memilih sendiri.

## 2. Prinsip yang tidak dilanggar (design §1)

1. **Browser tidak pernah dipercaya.** Waktu presensi, jarak ke kantor, hak akses, saldo cuti, dan semua angka uang dihitung server.
2. **Satu pintu masuk** (`POST /api {aksi, data}`) dan **satu jalur tulis** (`repo.tulis`).
3. **Masa lalu tidak ditulis ulang.** Gaji berversi, potret di slip, potret jam kerja dan radius di presensi, jalur approval disalin saat diajukan.
4. **Basis data tidak terbuka ke jaringan.** Aplikasi tersambung sebagai `hris_app`, tanpa hak `DELETE` dan tanpa hak mengubah Audit Log.
5. **Data pegawai tidak meninggalkan kantor.** Tidak ada layanan pihak ketiga di jalur data. Satu-satunya yang keluar adalah email notifikasi ke alamat pegawai sendiri, tanpa lampiran slip.

## 3. Struktur (design §3)

```
skema/00N_*.sql        migrasi bernomor, tidak pernah disunting ulang setelah diterapkan
src/server/            konfig db api auth izin repo audit berkas notif · pekerjaan/ · modul/
src/core/              FUNGSI MURNI: tanggal rupiah jarak kehadiran cuti lembur plafon
                       bpjs dplk pph21 thr payroll kpi renbis validasi
src/bersama/           aksi.ts (tipe Aksi, dipakai klien & server) · tema.ts (token warna)
src/client/            main.tsx api.ts Sesi.tsx format.ts Chart.tsx layar/*.tsx
test/core/ · test/fixtures/payroll/ · test/akses/
docs/RUNBOOK.md
```

Nama pengenal memakai **bahasa Indonesia** seperti di dokumen (`hitungMenitTerlambat`, `repo.tulis`, `galat`, `pelaku`, `alasan`). Contoh berbahasa Inggris di rules ECC tidak mengubah ini.

## 4. Basis data (design §4.1, skema SQL)

| Isi | Tipe |
|---|---|
| Tanggal | `date` |
| Waktu | `timestamptz`; zona `Asia/Jakarta` disetel di role `hris_app`, bukan di tiap kueri |
| Uang | domain `rupiah` (bigint, rupiah bulat, boleh negatif untuk penyesuaian) |
| Persen progres/bobot JMPD | domain `persen` (numeric(5,2), 0–100) |
| Periode | domain `periode_bulan` (`yyyy-MM`) |
| Boolean | `boolean`, bukan `Y`/`N` |
| NIK, NPP, NPWP, no. rekening | `text`: nol di depan bermakna |
| Koordinat | `numeric(9,6)` / `numeric(10,6)` |
| Nilai sebelum/sesudah | `jsonb` |

- `id uuid DEFAULT gen_random_uuid()`. Nomor untuk manusia (`CUTI-2026-0012`) disimpan di kolom `nomor` dengan indeks unik.
- Setiap `*_id` adalah `REFERENCES` dengan `ON DELETE RESTRICT` (bawaan).
- **Tidak ada hapus fisik.** Master memakai `aktif`, transaksi memakai `status`.
- Tabel transaksi punya `dibuat_pada`, `dibuat_oleh`, `diubah_pada`, `diubah_oleh`.
- **Aturan kritis ditegakkan basis data**, bukan hanya kode: EMP-02, EMP-07 (`EXCLUDE USING gist`), PAY-02, PAY-06a, PAY-11, penolakan wajib beralasan, dan Audit Log append-only. Aturan baru yang bisa diungkapkan sebagai constraint ditulis sebagai constraint.
- **Celah yang diketahui:** kepala `001_skema_awal.sql` menyebut PAY-08 (run final terkunci permanen), tapi belum ada trigger yang menegakkannya. Jangan mengandalkannya sebelum migrasi penambalnya ada.

**Migrasi:** berkas baru `skema/00N_nama.sql`, diawali `\set ON_ERROR_STOP on`, dijalankan sebagai pemilik basis data, lalu mencatat dirinya di `skema_versi`. Berkas yang sudah diterapkan tidak pernah disunting. Tabel baru otomatis mendapat `SELECT, INSERT, UPDATE` untuk `hris_app` lewat default privileges. Jangan pernah memberi `DELETE`.

**`bigint` di Node:** `pg` mengembalikan kolom bigint sebagai string. `db.ts` harus mem-parse OID 20 menjadi `number`, karena rupiah DPJM jauh di bawah `Number.MAX_SAFE_INTEGER`. Tanpa itu `"100" + "200"` menjadi `"100200"` diam-diam.

## 5. Menambah aksi (design §2.1, §5.3)

1. Tulis tipe di `src/bersama/aksi.ts`: `'modul.kataKerja': { kirim: …; terima: … }`.
2. Tambahkan baris di tabel `AKSI` (`src/server/api.ts`) dengan `izin` dan `fn`. **Aksi tanpa izin = galat saat startup.**
3. Izin yang bergantung data ("pegawai ini anggota unit saya?", "saya pemegang tahap ini?") diperiksa di dalam handler lewat `Izin.*`.
4. Handler hanya menulis lewat `repo` (§6 di bawah).
5. Tambahkan kasus di `test/akses/`: aksi itu dipanggil dengan token **setiap** peran, dan yang tidak berhak ditolak.
6. Klien memanggil `api('modul.kataKerja', data)`. Tidak ada `fetch` lain ke server.
7. Galat dilempar sebagai `galat('KODE')`. Pesan ke pengguna harus bisa ditindaklanjuti ("Anda berada ±240 m dari Kantor Pusat (batas 100 m)."), bukan kode. Detailnya masuk log.

Menu dan izin memakai aturan yang sama (§10.3): menu yang tidak berhak tidak dirender, dan servernya tetap menolak.

## 6. Jalur tulis dan Audit Log (design §7)

```ts
repo.tulis(tabel, operasi: 'tambah' | 'ubah' | 'nonaktifkan', baris, { pelaku, alasan })
```

- Satu transaksi: `SELECT … FOR UPDATE` atas baris lama, terapkan perubahan, lalu `audit.catat` **dalam transaksi yang sama**. Data dan lognya berhasil bersama atau gagal bersama.
- Kunci per baris, tidak ada kunci global.
- `bersihkan()` membuang `hash_sandi` dan `hash_token` sebelum dicatat (AUD-06).
- **`INSERT`/`UPDATE`/`DELETE` hanya boleh ada di `repo.ts` dan `audit.ts`.** Tes statis memindai kode dan gagal bila menemukannya di tempat lain.
- Satu aksi bisnis yang menulis beberapa baris (persetujuan laporan + hitung ulang pohon JMPD, transisi tahap payroll) berjalan dalam **satu** transaksi. Pohon atau run tidak boleh setengah diperbarui.
- Rantai hash: `hash_n = SHA-256(hash_(n-1) | no | waktu | pelaku_id | aksi | tabel | baris_id | sebelum | sesudah | alasan)`. `audit_rantai` diperbarui dalam transaksi yang sama.
- Audit Log tidak pernah diubah atau diarsipkan. Koreksi = baris baru.
- **Pengecualian:** `sesi`, `log_pemicu`, dan penghitung login di `pengguna` ditulis lewat `repo.operasional` tanpa Audit Log. Migrasi 003 memberi `DELETE` hanya atas `sesi`. Jangan menambah pengecualian lain tanpa mencatatnya di design §7.1.

## 7. Mesin hitung `core/*` (design §3, §8)

- **Murni:** tanpa basis data, tanpa `fs`, tanpa membaca jam sistem. Waktu selalu masuk sebagai argumen.
- Uang dalam **rupiah bulat**. `lantaiRatusan` untuk potongan keterlambatan dan lembur (SK Pasal 16 ayat 4), `lantaiRibuan` untuk PKP.
- **Mesin menolak berjalan dengan tabel tarif kosong**, dan layar menyebutkan tarif mana yang belum diisi. Jangan pernah menebak nilai bawaan.
- Perlakuan pajak per komponen dibaca dari `kena_pajak`, bukan ditulis di kode.
- Slip **hanya dibaca dari potret** (`payroll_slip`, `payroll_baris`), tidak pernah dihitung ulang dari master.
- Contoh uji wajib dari design:
  - potongan: gapok Rp3.090.000, 30 menit → **Rp2.600** (§8.2)
  - lembur: (gapok + tunjangan) Rp4.590.000, 2 jam hari kerja → **Rp92.800** (§8.4)
- Tahap run (§8.9): pelaku memegang peran tahap itu, belum pernah mengerjakan tahap lain di run yang sama (PAY-06a), dan tahapnya berurutan. Run `bulanan` 5 tahap; run khusus 3 tahap.

## 8. Autentikasi dan berkas (design §5, §4.8)

- Kata sandi: `argon2id` dengan parameter bawaan pustaka. Satu kolom `hash_sandi`, **tanpa** salt atau pepper terpisah.
- Token: `randomBytes(32)`, yang disimpan hanya `SHA-256(token)`. Cookie `HttpOnly; Secure; SameSite=Lax`. **Tidak pernah** di `localStorage`. Batas tidak aktif 8 jam. Tidak ada cache di depan tabel `sesi`.
- Berkas tinggal di `/var/lib/hris/…`, dengan katalog di tabel `berkas` (sha256, ukuran, media type). Berkas **tidak pernah dilayani lewat tautan**: server memeriksa izin, lalu mengalirkan isinya.

## 9. Tampilan (design §10)

- Tata letak JM-Click, warna tema DPJM. **Semua warna lewat token** (`src/bersama/tema.ts` / CSS var §10.2), tidak ada warna yang ditulis langsung. Terang adalah bawaan.
- IBM Plex Sans, dan IBM Plex Mono untuk NPP/NIK/rekening. Angka `tabular-nums`, kolom uang rata kanan.
- `formatRupiah(n) = 'Rp ' + Math.round(n).toLocaleString('id-ID')`, tanpa mode ringkas.
- Chart digambar sendiri sebagai SVG (`batang`, `batangBertumpuk`, `garis`, `progres`). **Tidak ada pustaka chart dan tidak ada CDN.**
- Mobile-first untuk presensi. GPS dan kamera hanya jalan di HTTPS.

## 10. Tes (design §11)

| Lapis | Alat |
|---|---|
| `core/*` dan fixture payroll | vitest (`npm test`) |
| Statis | skrip Node + `tsc`: tulis hanya di repo/audit, setiap aksi punya izin, tidak ada kredensial, tipe `Aksi` cocok |
| Akses | setiap aksi × setiap peran di lingkungan UJI |
| Alur | skenario UAT di UJI |
| Perangkat | Android Chrome + iPhone Safari |

UJI dan ASLI harus memakai versi OS, PostgreSQL mayor, dan Node yang sama. Deploy berhenti bila berbeda (NFR-13). UJI tidak pernah memuat data pegawai sungguhan.

## 11. Yang sudah ada di kode (Fase 1)

| Bagian | Tempat |
|---|---|
| Dispatcher + tabel izin | `src/server/api.ts` (`AKSI`, `tulis: true` untuk aksi yang mengubah data) |
| Tipe aksi bersama | `src/bersama/aksi.ts`; definisi kolom formulir pegawai di `src/bersama/pegawai.ts` |
| Izin & menu | `src/server/izin.ts` (`menuUntuk`, `atasanDari`, `bisaBaca*`) |
| Modul | `src/server/modul/*` — presensi, pegawai, pengguna, pengaturan, impor, ecv, beranda, log-audit, sistem |
| Pekerjaan terjadwal | `src/server/pekerjaan/jalankan.ts`, unit systemd di `deploy/systemd/` |
| Layar | `src/client/layar/*`, komponen dasar di `src/client/komponen/dasar.tsx` |
| Tes | `test/core` (murni), `test/statis` (jalur tulis, izin, kredensial), `test/integrasi` (akses per peran, HTTP, audit, presensi, pegawai, pekerjaan) |
| Server & deploy | `docs/KONFIGURASI_SERVER.md`, `docs/RUNBOOK.md`, `deploy/` |

Aksi baru: tambahkan tipe di `aksi.ts`, baris di `AKSI` (tsc menolak bila lupa), lalu kasus di `test/integrasi/akses.test.ts` — tes itu otomatis memanggil setiap aksi tanpa token, dengan token pegawai biasa, dan dengan token auditor.

## 12. Pola lama yang TIDAK berlaku lagi

Bila ditemukan di dokumen lama, catatan, atau ingatan sesi sebelumnya, abaikan:

| Pola lama | Penggantinya |
|---|---|
| Google Apps Script, Sheets sebagai basis data, Drive, Gmail | PostgreSQL + `/var/lib/hris` + SMTP kantor |
| "Tab" dan "daftarkan tabnya di §4" | Tabel `snake_case` lewat migrasi `skema/00N_*.sql` |
| Semua kolom diformat teks (`@`) | Tipe kolom sungguhan (§4 di atas) |
| HMAC-SHA-256 berulang + pepper + `ITERASI` | `argon2id` |
| Kunci skrip global untuk semua penulisan | Transaksi + `SELECT … FOR UPDATE` |
| `repo.tulis` dengan kunci global | `repo.tulis` dalam transaksi (§6 di atas) |
| `core/*` diakhiri `module.exports` bersyarat | Modul TypeScript biasa (`export function`) |
| Cache sesi, `terakhir_aktif` ditulis maks 1×/5 menit | Satu `SELECT` berindeks, ditulis tiap panggilan |
| Arsip Audit Log tahunan | Satu tabel, satu rantai |
| Hash terakhir di Script Properties | Tabel `audit_rantai` |

**Sisa teks lama di `design_final.md`** yang dibaca dengan arti barunya:
- §8.1 "Foto disimpan ke Drive" → disimpan lewat `berkas.ts` ke `/var/lib/hris/presensi/`.
- §8 "tidak membaca Sheets" → tidak membaca basis data.
- §9 "tertunda karena kuota" → tertunda karena SMTP gagal.
- §10.5 `client/chart.html` → `src/client/Chart.tsx` (§3).
- Judul kolom "Tab" dan nama PascalCase di §4.2–§4.7 → nama tabel `snake_case`. Isian `(Y/N)` → `boolean`. Bila berbeda, **berkas SQL yang menentukan**.

## 13. Alur kerja: ECC

Proyek ini memakai **ECC (`ecc@ecc`)** sebagai satu-satunya alur kerja. Superpowers tidak dipakai, supaya tidak ada dua set instruksi alur yang saling bertabrakan.

| Langkah | ECC |
|---|---|
| Rencana fitur | `/ecc:plan`, atau agent `ecc:planner` untuk fitur besar. Rencana mengacu ke ID SRS dan bagian design |
| Keputusan arsitektur | agent `ecc:architect`. Hasilnya dicatat di `design_final.md`, bukan di dokumen baru |
| Tulis kode | skill `ecc:tdd-workflow` / agent `ecc:tdd-guide`. Tes `core/*` ditulis lebih dulu |
| Telaah kode | agent `ecc:code-reviewer`, ditambah `ecc:typescript-reviewer` atau `ecc:react-reviewer` |
| Telaah SQL | agent `ecc:database-reviewer` untuk setiap `skema/*.sql` |
| Telaah keamanan | agent `ecc:security-reviewer`, **wajib** untuk `auth`, `izin`, `repo`, `audit`, `berkas`, payroll, dan berkas biaya |
| Sebelum PR | skill `ecc:verification-loop` |
| Build gagal | `/ecc:build-fix` atau agent `ecc:build-error-resolver` |

Rules ECC ada di `.claude/rules/ecc/`. **Bila bertentangan dengan skill ini atau dokumen proyek, proyek yang menang.** Daftar pertentangannya ada di `CLAUDE.md`.
