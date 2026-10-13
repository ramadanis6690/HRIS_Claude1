# Design Final — HRIS Dana Pensiun Jasa Marga (DPJM)

**Tanggal:** 19 September 2026
**Mengacu pada:** `PRD_final.md` · `SRS_final.md`
**Dokumen ini berdiri sendiri.** Pembangun memulai dari folder kosong. Setiap aturan yang lahir dari kegagalan nyata disertai sebabnya di tempat aturan itu muncul.

---

## 1. Arsitektur

```
HP / laptop pegawai (browser) — di kantor maupun di luar kantor
        │   HTTPS, satu endpoint: POST /api  {aksi, data}
        │   cookie HttpOnly berisi token sesi
        ▼
Nginx          TLS, nama domain, batas unggah 10 MB, pembatasan laju di /api login
        │      proxy ke 127.0.0.1:3000
        ▼
Node 22 — SATU proses, systemd service "hris", berjalan sebagai pengguna `hris`
  ├── api.ts       satu pintu masuk: token → izin → handler
  ├── izin.ts      izin per peran & posisi struktural
  ├── repo.ts      satu-satunya jalur baca/tulis + Audit Log, dalam satu transaksi
  ├── core/*       fungsi hitung murni (dites di Node)
  ├── berkas.ts    simpan/ambil berkas dari cakram, susun PDF
  └── modul/*      pegawai, presensi, pengajuan, payroll, kpi, renbis, …
        │
        ├── PostgreSQL 16     mendengar di 127.0.0.1 saja — tidak pernah terbuka ke jaringan
        └── /var/lib/hris/    foto, lampiran, dokumen, PDF surat, ekspor

systemd timer ──► 8 pekerjaan terjadwal (§9)
backup harian ──► ke luar mesin, terenkripsi (§12)
```

**Prinsip yang tidak dilanggar:**
1. **Browser tidak pernah dipercaya.** Waktu presensi, jarak ke kantor, hak akses, saldo cuti, dan semua angka uang dihitung server.
2. **Satu pintu masuk** (`api`) dan **satu jalur tulis** (`repo.tulis`). Pemeriksaan izin dan Audit Log tidak bisa terlewat karena tidak ada jalan lain.
3. **Masa lalu tidak ditulis ulang.** Gaji berversi, potret di slip, potret jam kerja dan radius di presensi, dan jalur approval yang disalin saat diajukan.
4. **Basis data tidak pernah terbuka ke jaringan.** PostgreSQL hanya mendengar di localhost, dan aplikasi tersambung sebagai role `hris_app` yang tidak punya hak `DELETE` maupun hak mengubah Audit Log. Bug di kode tidak cukup untuk merusak data.
5. **Data pegawai tidak meninggalkan kantor.** Tidak ada layanan pihak ketiga di jalur data: tidak Sheets, tidak Drive, tidak Gmail. Satu-satunya yang keluar adalah notifikasi email ke alamat pegawai sendiri, tanpa lampiran slip.

---

## 2. Tampilan dan hosting

### 2.1 Satu halaman React, disajikan Nginx

Tampilan dibangun dengan **React 19 + Vite + TypeScript**, dibangun jadi berkas statis, lalu disajikan Nginx langsung. Navigasi antar-layar terjadi di browser tanpa memuat ulang halaman. Setiap panggilan ke server lewat satu pembungkus — **bentuknya sama seperti rancangan sebelumnya**, hanya isinya yang berganti:

```ts
// client: satu-satunya jalan ke server
export async function api<A extends keyof Aksi>(
  aksi: A, data: Aksi[A]['kirim'],
): Promise<Aksi[A]['terima']> {
  const r = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',          // token ada di cookie HttpOnly, bukan di sini
    body: JSON.stringify({ aksi, data }),
  });
  const j = await r.json();
  if (!j.ok) throw j.galat;
  return j.data;
}
```

**`Aksi` adalah satu tipe yang dipakai klien dan server.** Tabel `AKSI` di server (§5.3) menurunkan tipe itu, sehingga kelas galat "klien mengirim `tanggal`, server menunggu `tgl`" tertangkap saat `tsc` berjalan, bukan saat pegawai mengklik. Itu alasan utama memakai TypeScript di kedua sisi.

**Token tidak pernah disentuh JavaScript.** Ia cookie `HttpOnly; Secure; SameSite=Lax` yang dipasang server saat login, jadi `credentials: 'same-origin'` sudah cukup dan tidak ada yang perlu disimpan di browser.

### 2.2 GPS dan kamera

Halaman disajikan langsung dari domain sendiri, **tanpa iframe**. Tidak ada lapis yang perlu memberi atribut `allow`, dan tidak ada pihak luar yang bisa mencabutnya.

Yang tetap berlaku:

| Hal | Syarat |
|---|---|
| `navigator.geolocation` | Hanya di **HTTPS**. Sudah dipenuhi §4 permintaan IT |
| `getUserMedia` (kamera) | Hanya di HTTPS, dan pengguna harus mengizinkan sekali per perangkat |
| Izin ditolak pengguna | Layar menampilkan langkah memulihkannya, bukan kode galat |

**Tetap wajib:** uji di Android (Chrome) dan iPhone (Safari) sebelum Fase 1 dipakai — sekarang untuk alasan biasa, bukan karena kebijakan iframe pihak lain.

### 2.3 Satu jalur penyajian, tanpa cadangan

Hanya ada satu cara tampilan disajikan: berkas statis dari Nginx di domain sendiri. Tidak ada jalur kedua yang harus dipelihara, karena tidak ada pihak luar yang bisa mencabut izin penyajiannya. Bila Nginx atau mesinnya mati, yang berlaku adalah prosedur server mati di runbook (§12), bukan berpindah penyaji.

---

## 3. Struktur proyek

```
hris-dpjm/
  package.json               npm test · npm run build · npm run deploy:uji · npm run deploy:asli
  tsconfig.json              strict, satu tipe dipakai server dan klien
  skema/
    001_skema_awal.sql       migrasi pertama — 60 tabel, constraint, hak akses role
    002_*.sql                migrasi berikutnya, bernomor, tidak pernah disunting ulang
  src/
    server/
      konfig.ts              baca variabel lingkungan dari /etc/hris/env (bukan di repo)
      db.ts                  pool koneksi, pembungkus transaksi
      api.ts                 dispatcher: tabel AKSI → {izin, handler}. Menurunkan tipe `Aksi`
      auth.ts                login, sesi, argon2id
      izin.ts                izin per peran & posisi, cakupan data
      repo.ts                SATU-SATUNYA jalur baca/tulis + Audit Log, satu transaksi
      audit.ts              tulis audit_log berantai hash, periksa rantai
      berkas.ts              simpan/ambil berkas dari /var/lib/hris, susun PDF
      notif.ts               notifikasi aplikasi + email lewat SMTP kantor
      pekerjaan/             dijalankan systemd timer, bukan daemon sendiri
      modul/                 pegawai, presensi, pengajuan, cuti, lembur, dinas, susulan,
                             reimburse, payroll, biaya, vendor, kpi, renbis, diklat,
                             report, pengumuman, surat, pengaturan, pengguna
    core/                    FUNGSI MURNI — tanpa db, tanpa fs, dites di Node
      tanggal.ts  rupiah.ts  jarak.ts  kehadiran.ts  cuti.ts  lembur.ts  plafon.ts
      bpjs.ts  dplk.ts  pph21.ts  thr.ts  payroll.ts  kpi.ts  renbis.ts  validasi.ts
    bersama/
      aksi.ts                tipe tiap aksi: apa yang dikirim, apa yang diterima
      tema.ts                token warna §10.2 sebagai satu sumber
    client/
      main.tsx  api.ts  Sesi.tsx  format.ts  Chart.tsx (SVG sendiri)  layar/*.tsx
  test/
    core/*.test.ts
    fixtures/payroll/*.json  ← contoh hitungan manual Keuangan (D25)
    akses/*.test.ts          setiap aksi × setiap peran
  docs/RUNBOOK.md
  PERMINTAAN_IT.md
```

**`core/*` adalah fungsi murni, dan batas itu ditegakkan tes.** Tidak ada akses basis data, tidak ada `fs`, tidak ada jam sistem yang dibaca langsung — waktu selalu masuk sebagai argumen. Akibatnya kelima belas berkas itu bisa dites di Node tanpa menyalakan PostgreSQL maupun server, dan `npm test` berjalan dalam hitungan detik di laptop mana pun:

```ts
export function hitungMenitTerlambat(
  masuk: Date, jamMasuk: string, toleransiMenit: number,
): number { /* … */ }
```

Di sinilah seluruh uang dihitung — gaji, lembur, potongan keterlambatan, BPJS, DPLK, PPh 21, THR — jadi di sinilah fixture hitungan manual Keuangan (§11.2) mengikat hasilnya sampai ke rupiah terakhir. `renbis.ts` menghitung serapan terhadap pagu dengan aturan yang sama.

**`src/bersama/` adalah bagian yang tidak ada di rancangan lama**, dan ia yang membuat TypeScript berguna di sini: `aksi.ts` dibaca `api.ts` di server dan `api()` di klien, sehingga keduanya tidak bisa berselisih soal bentuk data. `tema.ts` membuat token warna §10.2 punya satu sumber, bukan disalin ke CSS dan ke kode chart.

---

## 4. Database — satu basis data PostgreSQL

**Skema lengkapnya ada sebagai SQL yang bisa dijalankan di `skema/001_skema_awal.sql`.** Tabel di §4.2–§4.7 adalah inventarisnya; berkas SQL itu yang menentukan tipe, constraint, dan indeksnya. Nama tab lama menjadi nama tabel dalam `snake_case` (`RiwayatStatus` → `riwayat_status`).

### 4.1 Aturan umum

- **Tipe kolom sungguhan.** Aturan lama "semua kolom diformat teks (`@`)" adalah akal-akalan terhadap Sheets, yang mengubah `0812…` menjadi angka dan `3174…` menjadi notasi ilmiah. Aturan itu ikut dihapus bersama Sheets:

| Isi | Tipe |
|---|---|
| Tanggal | `date` |
| Waktu | `timestamptz`, ditampilkan `Asia/Jakarta` |
| Uang | domain `rupiah` atas `bigint` — bilangan bulat rupiah (PAY-11) |
| Boolean | `boolean`, bukan `Y`/`N` |
| NIK, NPP, NPWP, no. rekening | tetap `text` — nol di depan berarti, dan ini pengenal, bukan bilangan |
| Progres & bobot JMPD | domain `persen` atas `numeric(5,2)`, 0–100 |
| Koordinat GPS | `numeric(9,6)` / `numeric(10,6)` |
| Nilai lama/baru, `sebelum`/`sesudah` | `jsonb` |

- **`id`** = `uuid DEFAULT gen_random_uuid()`. Nomor yang dibaca manusia (`CUTI-2026-0012`) tetap di kolom `nomor` dengan indeks unik, jadi penghitungnya tidak perlu dijaga kunci di aplikasi — basis data yang menolak nomor kembar.
- **Kunci asing sungguhan.** Setiap `*_id` adalah `REFERENCES`, dan `ON DELETE` dibiarkan `RESTRICT` (bawaan) — yang justru menegakkan aturan berikutnya.
- **Tidak ada hapus fisik.** Master data punya `aktif`; transaksi punya `status`. `DELETE` **dicabut** dari role aplikasi, jadi aturan ini bukan lagi disiplin pemrogram, melainkan izin basis data.
- Setiap tabel transaksi punya `dibuat_pada`, `dibuat_oleh`, `diubah_pada`, `diubah_oleh`; dua kolom pelaku itu kunci asing ke `pegawai(id)`.
- **Zona waktu `Asia/Jakarta`** disetel pada role `hris_app`, bukan diulang di tiap kueri.

**Tujuh aturan yang dulu hanya prosa di dokumen ini, sekarang ditegakkan basis data:**

| Aturan | Ditegakkan oleh |
|---|---|
| EMP-02 NPP & email unik, NIK 16 digit | indeks unik + `CHECK (nik ~ '^\d{16}$')` |
| EMP-07 gaji berversi tidak boleh tumpang tindih | `EXCLUDE USING gist` atas `(pegawai_id, komponen_id, daterange)` |
| PAY-02 satu run `bulanan` per periode | indeks unik sebagian `WHERE jenis = 'bulanan'` |
| PAY-06a satu orang tidak menyetujui dua tahap | indeks unik sebagian `WHERE aksi = 'setuju'` |
| PAY-11 uang bilangan bulat rupiah | domain `rupiah` |
| Penolakan dan pengembalian wajib beralasan | `CHECK (status <> 'ditolak' OR btrim(alasan) <> '')` |
| AUD Audit Log append-only | `REVOKE UPDATE` dari `hris_app` + trigger penolak |

Baris terakhir itu yang paling berarti untuk pengawasan OJK: di Sheets, "append-only" bergantung pada tidak adanya kode yang menulis ulang. Di sini basis data menolaknya, termasuk bila seseorang masuk lewat `psql` sebagai role aplikasi.

### 4.2 Master pegawai

| Tab | Kolom |
|---|---|
| `Pegawai` | id, npp, nik, npwp, nama_lengkap, gelar_depan, gelar_belakang, jenis_kelamin, tempat_lahir, tanggal_lahir, agama, kewarganegaraan, status_pernikahan, ptkp, alamat_ktp, alamat_domisili, no_hp, email, jenis_kepegawaian, status_pegawai, unit_id, jabatan_id, kelompok_jabatan, grade, sub_grade, tgl_masuk, tgl_masa_kerja_diakui, tgl_pengangkatan, tgl_akhir_probation, no_sk, tgl_sk, tgl_mulai_kontrak, tgl_akhir_kontrak, vendor_instansi, no_surat_penugasan, pendidikan_terakhir, jurusan, bank_nama, bank_rekening, bank_atas_nama, no_bpjs_kes, faskes, no_bpjs_tk, no_dplk, wajib_presensi, bypass_gps, potongan_terlambat, ikut_bpjs_kes, ikut_bpjs_tk, dplk_aktif, dpjm_pemotong_pajak, ikut_payroll, titik_kantor_id, foto_file_id, tgl_berhenti, alasan_berhenti, aktif, + kolom jejak |
| `RiwayatStatus` | id, pegawai_id, status, tgl_mulai, tgl_selesai, keterangan, + jejak |
| `Gaji` | id, pegawai_id, komponen_id, nominal, berlaku_mulai, berlaku_sampai, no_sk, + jejak |
| `Keluarga` | id, pegawai_id, nama, hubungan, nik, tgl_lahir, jenis_kelamin, no_hp, alamat, kontak_darurat, ditanggung, ahli_waris, bank_ahli_waris, rek_ahli_waris, aktif, + jejak |
| `Pendidikan` | id, pegawai_id, jenjang, institusi, jurusan, tahun_masuk, tahun_lulus, no_ijazah, aktif |
| `RiwayatPekerjaan` | id, pegawai_id, instansi, jabatan, tahun_mulai, tahun_selesai, keterangan, aktif |
| `RiwayatDiklat` | id, pegawai_id, diklat_id (kosong bila dari luar sistem), nama, penyelenggara, tgl_mulai, tgl_selesai, jumlah_jam, no_sertifikat, file_id, aktif |
| `Sertifikasi` | id, pegawai_id, nama, lembaga, no_sertifikat, tgl_terbit, berlaku_sampai, file_id, aktif |
| `Dokumen` | id, pegawai_id, jenis (KTP/KK/NPWP/Ijazah/BukuTabungan/SK/Lainnya), file_id, nama_file, aktif, + jejak |

### 4.3 Pengaturan

| Tab | Kolom |
|---|---|
| `Unit` | id, kode, nama, direktur_pembina_id, aktif |
| `Jabatan` | id, nama, posisi_struktural (Staff/Manager/Direksi/Dirut/Dewas), kelompok_jabatan, cara_bayar_lembur (upah_per_jam/lumpsum/tidak_ada), aktif |
| `TabelGrade` | id, grade, sub_grade, nama_jabatan, pendidikan_min, masa_kerja_min_thn, masa_kerja_max_thn, tunjangan_jabatan, gapok_min, gapok_med, gapok_max, berlaku_mulai |
| `KomponenGaji` | id, kode, nama, tipe (pendapatan/potongan/informasi), kena_pajak, aktif — **katalog lengkap di §8.13** |
| `TarifKomponen` | id, kode, grade_atau_kelompok, nominal, satuan, berlaku_mulai, aktif, + jejak |
| `KomponenPegawai` | id, pegawai_id, kode, aktif, nominal_khusus, alasan, + jejak |
| `TarifStatutori` | id, kode (bpjs_kes, jht, jp, jkk, jkm, ump), pihak (pegawai/perusahaan/-), persen, batas_upah, nominal, berlaku_mulai, berlaku_sampai, sumber — **tidak bisa disunting lewat layar** |
| `TarifPajak` | id, jenis (ter_a/ter_b/ter_c/pasal17/ptkp), batas_bawah, batas_atas, tarif_atau_nilai, kode_ptkp, berlaku_mulai, berlaku_sampai, sumber — **tidak bisa disunting lewat layar** |
| `JenisCuti` | id, nama, jatah_per_tahun, potong_saldo, wajib_lampiran, syarat_masa_kerja_bulan, bisa_dibawa, maks_dibawa, aktif |
| `KategoriReimburse` | id, nama, aktif |
| `AturanReimburse` | id, kategori_id, kelompok (Pegawai/Direksi/Dewas), min_masa_kerja_bulan, plafon, periode_bulan, persen_ganti, kena_pajak, aktif |
| `KategoriDiklat` | id, nama, aktif |
| `TitikKantor` | id, nama, alamat, lat, lng, radius_m (50/100/200/300), aktif |
| `HariLibur` | tanggal, keterangan, sumber (nasional/ditetapkan_hr), aktif, + jejak |
| `JamKerja` | id, jam_masuk, jam_pulang, toleransi_menit, hari_kerja (mis. `1,2,3,4,5`), batas_susulan_hari, berlaku_mulai |
| `KebijakanApproval` | id, jenis, syarat_min_hari, langkah (mis. `ATASAN,DIREKSI` untuk cuti & lembur; `DIREKSI` untuk run khusus; `ATASAN,HRD` untuk dinas), aktif, + jejak |
| `Pengaturan` | kunci, nilai (mis. `payroll_unit_tahap3=KSU,KEU`, `retensi_foto_hari=365`, `pengingat_kontrak_hari=30`, `pengingat_sertifikat_hari=60`, `tenggat_pj_hari_kerja=14`) |
| `TarifDinas` | id, komponen (uang_harian/transport/penginapan), grade_atau_jabatan, zona_kota, nominal, satuan (per hari/per perjalanan/per malam), berlaku_mulai, berlaku_sampai — **kosong di awal** |
| `AnggaranDiklat` | tahun, nominal, ditetapkan_oleh, ditetapkan_pada |
| `Anggaran` | id, tahun, kategori, unit_id, pagu, keterangan, aktif, + jejak |
| `SerapanAnggaran` | id, anggaran_id, bulan (1–12), nominal, sumber (otomatis/contoh/koreksi), diubah_oleh, waktu |

Catatan `KebijakanApproval`: jalur disalin saat pengajuan diajukan (lihat `Pengajuan.jalur_snapshot`) dan tidak berubah sesudahnya. Untuk **cuti & lembur**, langkahnya `ATASAN,DIREKSI` — pengaju → **Atasan Langsung** → **Direktur Pembina unit pengaju** (pengajuan oleh Direksi sendiri → Dirut) — dan **Admin HRD bukan langkah**. Setelah disetujui, saldo cuti terpotong dan jam lembur diakui otomatis, lalu lembur diteruskan ke bendahara (Admin Finance) untuk dibayar pada run payroll. Jalur lain tetap: dinas Atasan Langsung → HRD; reimbursement Admin Finance; susulan dan profil Admin HRD.

### 4.4 Akun

| Tab | Kolom |
|---|---|
| `Pengguna` | id, pegawai_id, hash_sandi, salt, wajib_ganti_sandi, gagal_login, terkunci_sampai, aktif, login_terakhir |
| `PeranAdmin` | id, pegawai_id, peran, aktif, diberikan_oleh, diberikan_pada |
| `Sesi` | hash_token, pengguna_id, dibuat, terakhir_aktif, kedaluwarsa, ingat, perangkat, dicabut |

### 4.5 Transaksi harian

| Tab | Kolom |
|---|---|
| `Presensi` | id, pegawai_id, tanggal, masuk_pada, masuk_lat, masuk_lng, masuk_akurasi, foto_file_id, foto_dihapus_pada, pulang_pada, pulang_lat, pulang_lng, titik_kantor_id, jarak_m, radius_saat_itu, dalam_radius, bypass_saat_itu, jam_masuk_saat_itu, jam_pulang_saat_itu, toleransi_saat_itu, menit_terlambat, menit_pulang_cepat, sumber (check_in/dinas_luar/susulan/tinjauan_radius/koreksi_hr), pengajuan_id, alasan_koreksi, + jejak |
| `PercobaanCheckIn` | id, pegawai_id, waktu, lat, lng, akurasi, titik_kantor_id, jarak_m, radius, foto_file_id, status (ditolak/diajukan/disetujui/ditolak_hr), pengajuan_id |
| `RekapKehadiran` | id, periode (`yyyy-MM`), pegawai_id, hari_kerja, hadir, dinas, cuti, bebas_tugas, mangkir, menit_terlambat, menit_pulang_cepat, tanpa_checkout, susulan, koreksi, potongan_rp, jam_lembur_diakui, lembur_rp, status (draf/disahkan), disahkan_oleh, disahkan_pada |
| `Pengajuan` | id, nomor, jenis, pegawai_id, status (menunggu/disetujui/ditolak/dibatalkan), ringkasan, jalur_snapshot, diajukan_pada, selesai_pada |
| `LangkahApproval` | id, pengajuan_id, urutan, peran_langkah, penyetuju_id, status (menunggu/disetujui/ditolak/dilewati), alasan, dialihkan_dari, waktu |
| `DetailCuti` | pengajuan_id, jenis_cuti_id, tgl_mulai, tgl_selesai, jumlah_hari, alasan |
| `DetailLembur` | pengajuan_id, tanggal, jenis_hari (kerja/libur), jam_mulai, jam_selesai, uraian, menit_diajukan, menit_diakui |
| `DetailDinas` | pengajuan_id, tgl_berangkat, tgl_kembali, kota, keperluan, moda, sumber (ditetapkan_hr/pengajuan), aktif |
| `DetailSusulan` | pengajuan_id, tanggal, jam_masuk, jam_pulang, alasan |
| `DetailTinjauanRadius` | pengajuan_id, percobaan_id, alasan |
| `DetailPerubahanProfil` | pengajuan_id, tab, baris_id, nilai_lama (JSON), nilai_baru (JSON) |
| `DetailReimburse` | pengajuan_id, kategori_id, deskripsi, nominal_diajukan, nominal_disetujui, tgl_nota, status_bayar (menunggu_pembayaran/dibayar), slip_id |
| `Lampiran` | id, pengajuan_id, file_id, nama_file |
| `SaldoCutiAwal` | id, pegawai_id, jenis_cuti_id, tahun, hari_terpakai, keterangan |
| `KlaimReimburseAwal` | id, pegawai_id, kategori_id, tgl_klaim, nominal, keterangan |

### 4.6 Payroll

| Tab | Kolom |
|---|---|
| `PayrollRun` | id, nomor, jenis (bulanan/thr/insentif_tw/insentif_tahunan/bonus/penyesuaian), periode, tgl_acuan, tgl_bayar_rencana, tgl_bayar, tahap (1–6), status (draf/dihitung/menunggu_verifikasi/final/dikembalikan), run_asal_id, total_bruto, total_potongan, total_neto, dihitung_pada |
| `PayrollTahap` | id, run_id, tahap, pelaku_id, aksi (setuju/kembalikan/hitung/terbitkan), alasan, waktu |
| `PayrollSlip` | id, run_id, pegawai_id, snap_nama, snap_npp, snap_nik, snap_jabatan, snap_unit, snap_jenis_kepegawaian, snap_ptkp, snap_bank, snap_rekening, snap_atas_nama, snap_penerima (pegawai/ahli_waris), snap_gapok, snap_tunjangan_jabatan, snap_faktor_status, total_pendapatan, total_potongan, neto, pph21_ditanggung |
| `PayrollBaris` | id, slip_id, urutan, kode_komponen, nama_snapshot, tipe (pendapatan/potongan/informasi), nominal, sumber (gaji/lembur/presensi/reimburse/bpjs/dplk/pph/insentif/thr/penyesuaian), rincian (mis. `30 menit × Rp89,31 → dibulatkan`) |
| `InputInsentif` | id, run_id, pegawai_id, kode_komponen, nominal, keterangan |
| `PayrollPeserta` | id, run_id, pegawai_id, ikut (Y/N), sumber_nilai (master/diubah_di_run), alasan_kecuali (toggle_mati/belum_masuk/sudah_berhenti/diubah_admin), diubah_oleh, diubah_pada |
| `TagihanVendor` | id, nomor, vendor, periode, jumlah_orang, nominal, keterangan, invoice_file_id, status (menunggu/diverifikasi/dibayar/dikembalikan), alasan, dicatat_oleh, diverifikasi_oleh, dibayar_pada, bukti_bayar_file_id |
| `BerkasBiaya` | id, nomor (mis. `BYA-2026-0007`), jenis (dinas/diklat), sumber_id (pengajuan dinas / diklat), fase (uang_muka/pertanggungjawaban), berkas_uang_muka_id (untuk fase pertanggungjawaban), tahap (1–5), status (draf/dihitung/menunggu_verifikasi/final/dikembalikan), total, tgl_mulai_kegiatan, tgl_selesai_kegiatan, tenggat_pj |
| `BiayaRincian` | id, berkas_id, pegawai_id, komponen (uang_harian/transport/penginapan/biaya_diklat/lainnya), jumlah, tarif, nominal, keterangan, bukti_file_id, dibayar_pada, bukti_bayar_file_id |
| `BiayaTahap` | id, berkas_id, tahap, pelaku_id, aksi, alasan, waktu |
| `PengembalianUangMuka` | id, berkas_id, pegawai_id, nominal, cara (transfer_balik/potong_gaji), bukti_file_id, status (menunggu/dikonfirmasi/dipotong), dikonfirmasi_oleh, slip_id |

### 4.7 Kinerja dan lainnya

| Tab | Kolom |
|---|---|
| `Workblock` | id, nomor (mis. `WB-12`, `WB-12.1`, `WB-12.1.1`), asal (buat_sendiri/turunan), induk_workblock_id, penugasan_id (baris `Penugasan` asalnya, bila turunan), pemilik_id, assigned_from_id, penyetuju_id, project_owner, initiative, begin_date, completion_date, goal, key_activities, dependencies_internal, dependencies_external, stakeholders, budget, deliverables, show_milestones, bobot (100 atau sub-bobot bila turunan), status, progress, + jejak |
| `Milestone` | id, workblock_id, urutan, nama, bobot, target, progress |
| `Penugasan` | id, milestone_id, pegawai_id, sub_bobot, workblock_turunan_id, progress (disalin dari turunan yang disetujui) |
| `OnGoingReport` | id, workblock_id, milestone_id, pegawai_id, progress, catatan, file_id, status (menunggu/disetujui/ditolak), penyetuju_id, alasan, waktu |
| `PenilaianWorkblock` | id, workblock_id, pegawai_id, penilai_id, nilai (A–E), catatan, dinilai_pada |
| `PenilaianAkhir` | id, pegawai_id, penilai_id, tahun, triwulan, jenis (result/behaviour), nilai (A–E atau below_average/average/role_model/guardian), catatan, dinilai_pada, terkunci |
| `PredikatJMPD` | id, pegawai_id, tahun, triwulan, result, behaviour, predikat, terbit_pada |
| `Feedback` | id, pengirim_id, penerima_id, kategori (result/behaviour/lainnya), isi, dikirim_pada, aktif |
| `Diklat` / `PesertaDiklat` | id, nama, kategori_id, penyelenggara, sasaran, tgl_mulai, tgl_selesai, anggaran, aktif / id, diklat_id, pegawai_id, status, sertifikat_file_id |
| `Pengumuman` / `PengumumanSasaran` / `PengumumanDibaca` | id, judul, isi, tayang_mulai, tayang_sampai / pengumuman_id, jenis (semua/unit/jenis_kepegawaian/pegawai), nilai / pengumuman_id, pegawai_id, dibaca_pada |
| `TemplateSurat` / `Surat` | id, nama, doc_id, variabel, aktif / id, template_id, pegawai_id, nomor (disiapkan), file_id, + jejak |
| `Notifikasi` | id, penerima_id, jenis, judul, isi, tautan, dibuat_pada, dibaca_pada, email_status (tidak_perlu/terkirim/tertunda/gagal) |
| `PreferensiNotif` | pegawai_id, jenis, email_aktif |
| `AuditLog` | no, waktu, pelaku_id, aksi, tab, baris_id, sebelum, sesudah, alasan, hash_sebelumnya, hash |
| `LogPemicu` | waktu, pekerjaan, jumlah_diproses, berhasil, galat |

**Perkiraan ukuran:** `presensi` sekitar 5.000 baris/tahun. `audit_log` sekitar 30.000–60.000 baris/tahun. Untuk PostgreSQL angka itu kecil; basis datanya di bawah 1 GB per tahun.

**Tidak ada arsip tahunan Audit Log.** Memindahkan log ke tempat lain setiap Januari berarti **memutus rantai hash**, dan itu titik paling rawan di seluruh skema. `audit_log` tumbuh di satu tabel dengan satu rantai yang tidak pernah disambung ulang. Bila suatu hari ukurannya menjadi persoalan, jalannya adalah partisi tabel per tahun — yang tidak menyentuh rantainya.

### 4.8 Berkas

Berkas tinggal di satu folder di server, dan basis data memegang katalognya di tabel `berkas`.

```
/var/lib/hris/                 (pengguna sistem `hris`, mode 0750)
  presensi/yyyy-MM/            foto check-in        ← dihapus setelah 365 hari
  lampiran/                    bukti pengajuan
  dokumen/                     scan KTP, KK, dst.
  foto-profil/
  surat/                       PDF surat keluar
  ekspor/                      Excel ekspor sementara (dihapus setelah 7 hari)
```

Yang berubah selain tempatnya:

- **Template surat tidak lagi berupa Google Docs.** Folder `TemplateSurat/` yang dulu **satu-satunya** yang dibagikan — ke Admin HRD sebagai editor — hilang, dan templatnya menjadi kolom `isi` pada tabel `template_surat`. Sekarang tidak ada folder yang dibagikan ke siapa pun, karena tidak ada Drive.
- **Backup tidak tinggal di sini.** Salinan basis data dan berkas harus pergi ke luar mesin, karena backup di cakram yang sama tidak menolong saat cakram itu yang mati — lihat §12.
- **Setiap berkas punya baris di `berkas`** berisi `sha256`, `ukuran_byte`, dan `media_type`. Berkas kembar jadi terdeteksi, dan berkas yang rusak di cakram bisa dibuktikan rusak, bukan cuma dicurigai.
- Berkas tetap **tidak pernah dilayani lewat tautan**. Server memeriksa izin, membaca dari cakram, lalu mengalirkannya ke browser. Tidak ada tautan yang bisa bocor karena tidak ada tautan yang dibuat.

---

## 5. Autentikasi dan sesi

### 5.1 Kata sandi

**argon2id**, dengan parameter bawaan pustakanya:

```ts
import argon2 from 'argon2';

export const hashSandi = (sandi: string) => argon2.hash(sandi, { type: argon2.argon2id });
export const cocok = (hash: string, sandi: string) => argon2.verify(hash, sandi);
```

Tidak ada kolom `salt`, tidak ada kunci rahasia tambahan, dan tidak ada parameter biaya yang harus diukur dan dicatat sendiri: **satu nilai `hash_sandi` memuat algoritma, parameter biaya, salt, dan hash sekaligus.**

Tiga akibat praktisnya:

| | |
|---|---|
| `argon2.verify` membaca parameter dari hash itu sendiri | Menaikkan parameter biaya suatu hari nanti **tidak membatalkan** kata sandi yang sudah ada. Hash lama tetap bisa diperiksa, dan ditulis ulang dengan parameter baru saat pemiliknya login |
| Perbandingan berjalan dalam waktu tetap | Tidak ada catatan "bandingkan seluruh string, jangan keluar lebih awal" yang harus diingat pemrogram berikutnya |
| Satu kolom, bukan dua | Tidak ada keadaan setengah jadi berupa hash yang salt-nya hilang |

### 5.2 Token

- Saat login berhasil: `token = randomBytes(32).toString('base64url')`. Yang disimpan di tabel `sesi` hanya `SHA-256(token)` sebagai `bytea`.
- Token dikirim sebagai cookie **`HttpOnly; Secure; SameSite=Lax`**. `Max-Age` 30 hari bila *Ingat perangkat ini* dicentang, cookie sesi bila tidak. **Browser tidak pernah menyimpannya di `localStorage`**, jadi XSS tidak bisa mencurinya — dan batas 7 hari Safari, yang dulu tercatat sebagai risiko, tidak berlaku untuk cookie yang dipasang server.
- Setiap `api()`: hash token → satu `SELECT` berindeks pada `sesi` → periksa `dicabut`, `kedaluwarsa`, dan batas 8 jam tidak aktif → perbarui `terakhir_aktif`.
- Menonaktifkan akun atau pegawai mengisi `dicabut` untuk semua sesinya; panggilan berikutnya langsung ditolak.
- Pekerjaan terjadwal per jam menghapus sesi yang kedaluwarsa lebih dari 7 hari.

**Tidak ada lapis cache di depan tabel `sesi`, dan itu disengaja.** Satu `SELECT` berindeks berjalan di bawah satu milidetik, jadi cache hanya akan menambah keadaan yang bisa kedaluwarsa tanpa menambah kecepatan yang terasa. `terakhir_aktif` ditulis di setiap panggilan, tanpa pembatasan frekuensi. Kode yang tidak ada tidak bisa menyimpan keadaan yang salah.

### 5.3 Dispatcher

```js
const AKSI = {
  'presensi.checkIn':   { izin: 'diri',            fn: Presensi.checkIn },
  'pegawai.simpan':     { izin: 'admin_hrd',       fn: Pegawai.simpan },
  'payroll.hitung':     { izin: 'admin_payroll',   fn: Payroll.hitung },
  'audit.baca':         { izin: ['auditor','super_admin'], fn: Audit.baca },
  // … setiap aksi WAJIB menyatakan izinnya; aksi tanpa izin = galat saat startup
};

function api(req) {
  try {
    if (req.aksi === 'auth.login') return ok(Auth.login(req.data));
    const u = Auth.dariToken(req.token);                 // melempar TIDAK_SAH
    if (u.wajibGantiSandi && req.aksi !== 'auth.gantiSandi') throw galat('WAJIB_GANTI_SANDI');
    const a = AKSI[req.aksi]; if (!a) throw galat('AKSI_TIDAK_DIKENAL');
    Izin.periksa(u, a.izin, req.data);                   // melempar DITOLAK
    return ok(a.fn(u, req.data));
  } catch (e) { return gagal(e); }                       // pesan aman, detail ke log
}
```

Izin yang **tergantung data** ("pegawai ini anggota unit saya?", "saya pemegang tahap run ini?") diperiksa di dalam handler dengan fungsi `Izin.*`. Tes akses (§11) memanggil **setiap** aksi dengan token dari setiap peran.

---

## 6. Otorisasi

### 6.1 Posisi struktural dan atasan

```
posisi(p)  = Jabatan[p.jabatan_id].posisi_struktural
atasan(p)  = Staff   → Manager aktif di p.unit_id
             Manager → Unit[p.unit_id].direktur_pembina_id
             Direksi → pegawai aktif berposisi Dirut
             Dirut / Dewas → (tidak ada)
```

Bila atasannya kosong (misalnya Manager sedang tidak ada), langkah itu dialihkan sesuai SRS APR-04.

### 6.2 Matriks izin (ringkas)

Kolom memakai 9 peran (PRD §4.2). *Employee* = diri sendiri.

| Data / aksi | Employee | Manager/Atasan (unitnya) | Direksi/Dirut (binaannya) | Admin HRD | Admin Payroll | Admin Finance | Auditor | Super Admin |
|---|---|---|---|---|---|---|---|---|
| Profil & dokumen | baca, ajukan ubah | profil dasar | profil dasar | penuh | baca | — | baca (report) | penuh |
| Gaji (master) | baca | — | — | penuh | baca | baca | — | penuh |
| Presensi & cuti | baca | **baca** | — | penuh + koreksi | baca rekap | — | report | penuh |
| Approval pengajuan | ajukan | langkah atasan | langkah direksi | langkah HRD + kebijakan | — | langkah reimburse | — | cadangan |
| Payroll run | slip sendiri | tahap 3 (Manager KSU & Keu) | tahap 4 | tahap 1 | tahap 2 | tahap 5 | report | baca |
| Berkas biaya diklat & dinas | milik sendiri + pertanggungjawaban | tahap 3 (Manager KSU & Keu) | tahap 4 | tahap 1 | tahap 2 | tahap 5 + konfirmasi pengembalian | report | baca |
| Workblock & nilai | milik sendiri | unitnya | binaannya | baca semua | — | — | report | baca |
| Audit Log | — | — | — | **— (ditolak)** | — | — | baca | baca |
| Pengaturan & peran | — | — | — | pengaturan | — | aturan reimburse, tarif dinas, anggaran diklat | — | penuh |

---

## 7. Jalur tulis, kunci, dan Audit Log

### 7.1 `repo.tulis`

```ts
export async function tulis<T>(
  tabel: string, operasi: 'tambah' | 'ubah' | 'nonaktifkan',
  baris: T & { id?: string }, { pelaku, alasan }: Jejak,
): Promise<T> {
  return db.transaksi(async (tx) => {                    // SATU transaksi
    const sebelum = operasi === 'tambah' ? null
      : await tx.baris(tabel, baris.id!, { kunci: true }); // SELECT … FOR UPDATE
    const sesudah = await tx.terapkan(tabel, operasi, baris);
    await audit.catat(tx, { pelaku, aksi: operasi, tabel, baris_id: sesudah.id,
      sebelum: bersihkan(sebelum), sesudah: bersihkan(sesudah), alasan });
    return sesudah;
  });
}
```

`bersihkan()` membuang `hash_sandi` dan `hash_token` sebelum dicatat (SRS AUD-06). Kolom `salt` tidak ada lagi.

**Dua sifat yang menentukan, dan keduanya berasal dari transaksi:**

1. **Data dan Audit Log ditulis dalam satu transaksi.** Keduanya berhasil bersama atau gagal bersama, jadi "data berubah tetapi catatannya hilang" bukan keadaan yang mungkin terjadi. Untuk dana pensiun yang diawasi OJK, keadaan itu temuan audit, bukan bug kecil.
2. **Kunci per baris, bukan kunci global.** `SELECT … FOR UPDATE` hanya mengunci baris yang disentuh, jadi 20 orang check-in dalam 30 menit setiap pagi tidak saling menunggu. Yang diantre hanya dua penulisan ke baris yang sama — misalnya dua penyetuju menekan Setujui pada run payroll yang sama pada detik yang sama, yang justru memang harus diantre.

**Tidak ada kode lain yang boleh menjalankan `INSERT`, `UPDATE`, atau `DELETE`.** Tes statis (§11) memindai kode dan gagal bila menemukannya di luar `repo.ts` dan `audit.ts`. Role `hris_app` juga tidak punya hak `DELETE` sama sekali, jadi aturan "tidak ada hapus fisik" ditegakkan basis data, bukan disiplin pemrogram.

### 7.2 Rantai hash

```
hash_n = SHA-256( hash_(n-1) | no | waktu | pelaku_id | aksi | tab | baris_id | sebelum | sesudah | alasan )
```

`hash` terakhir juga disimpan di tabel satu-baris **`audit_rantai`**, diperbarui dalam transaksi yang sama. Bila hash di `audit_rantai` berbeda dari baris terakhir `audit_log`, berarti ada yang menambah atau menghapus baris di luar aplikasi, dan Auditor melihat peringatan di layarnya. Fungsi **Periksa rantai** menghitung ulang dari baris 1 dan melaporkan baris pertama yang tidak cocok.

**Yang kini mustahil, bukan hanya terdeteksi:** role `hris_app` tidak punya hak `UPDATE` pada `audit_log`, dan trigger menolak `UPDATE` maupun `DELETE`. Jadi bug di kode aplikasi — bahkan yang sengaja ditulis — tidak cukup untuk mengubah satu baris log.

**Batas yang tetap diakui:** pemegang `root` atau pemilik basis data masih bisa mengubah tabel langsung lewat `psql`. Terhadap mereka, rantai hash membuat perubahan **terdeteksi**, bukan **mustahil** — dan itu memang sejauh yang bisa dicapai tanpa menitipkan log ke pihak ketiga, yang justru dilarang kepatuhan. Backup harian ke luar mesin memberi pembanding.

---

## 8. Mesin hitung (`core/*`)

Semua fungsi di bagian ini **murni**: tidak membaca Sheets. Semua masukan dikirim sebagai parameter, sehingga bisa dites di Node.

### 8.1 Presensi

```
checkIn(pegawai, posisi{lat,lng,akurasi}, foto, sekarangServer):
  tanggal = tanggalWIB(sekarangServer)
  bila sudah ada Presensi(pegawai, tanggal)         → tolak "Sudah check-in"
  bila akurasi > 200 m                               → minta ulang "Sinyal GPS lemah" (tidak dicatat)
  bila dinas aktif pada tanggal                      → simpan, sumber = dinas_luar, tanpa penilaian radius
  kandidat = titik terkunci pegawai, atau semua titik aktif
  bila tidak ada kandidat                            → simpan, dalam_radius = kosong
  t = kandidat dengan jarak haversine terkecil
  bila bypass_gps                                    → simpan, dalam_radius dinilai, bypass_saat_itu = Y
  bila jarak ≤ t.radius                              → simpan
  selain itu                                         → simpan PercobaanCheckIn, tolak dengan jarak
  menit_terlambat = max(0, menit(masuk) − (jam_masuk + toleransi))   ← potret JamKerja berlaku
```

Foto disimpan ke Drive lebih dulu. Bila penulisan baris gagal, foto itu dihapus lagi supaya tidak ada berkas yatim.

### 8.2 Rekap bulanan dan potongan

Untuk setiap hari kerja `d` di periode, setiap pegawai *Wajib Presensi = Y* diberi satu status, dengan urutan prioritas: **Bebas Tugas → Cuti disetujui → Dinas → Presensi → Mangkir**.

```
tarif_menit = (0,30 × gapok) / 10.380
potongan    = lantaiRatusan( tarif_menit × (Σ menit_terlambat + Σ menit_pulang_cepat + 480 × mangkir) )
              → 0 bila potongan_terlambat = N atau Bebas Tugas
```

`lantaiRatusan(x) = floor(x / 100) × 100`, karena SK Pasal 16 ayat 4 menyebut pecahan di bawah Rp100 dibulatkan menjadi Rp0. Contoh uji: gapok Rp3.090.000, 30 menit → `89,306 × 30 = 2.679,19` → **Rp2.600**.

### 8.3 Cuti

```
genap12(p)            = tanggal masa kerja diakui (atau tgl_masuk) + 12 bulan
jatahTahunan(p, tgl)  = tgl ≥ genap12(p) ? JenisCuti['Tahunan'].jatah_per_tahun (12) : 0
                        # berlaku sampai 31 Desember; reset 1 Januari
saldo = jatah − SaldoCutiAwal(tahun) − Σ jumlah_hari cuti disetujui/menunggu (tahun, potong_saldo = Y)
jumlah_hari = hari kerja di [mulai, selesai]
```

Cuti yang masih *menunggu* ikut mengurangi saldo supaya dua pengajuan tidak bisa sama-sama lolos.

### 8.4 Lembur

```
menit_diakui = irisan([jam_mulai, jam_selesai], [jam_pulang_jadwal, pulang_pada])   (hari kerja)
             = irisan([jam_mulai, jam_selesai], [masuk_pada, pulang_pada])          (hari libur)
cara = Jabatan.cara_bayar_lembur
upah_per_jam: tarif = (gapok + tunj_jabatan) / 173
  hari kerja: jam1 × 1,5 ; sisanya × 2              ; maks 240 menit/hari, 1.080 menit/minggu
  hari libur: jam1–8 × 2 ; jam9 × 3 ; jam10–12 × 4
lumpsum: 100.000 per hari bila menit_diakui ≥ 120
total_bulan = lantaiRatusan( Σ )
```

Contoh uji: tarif `4.590.000 / 173 = 26.531,79`. Dua jam di hari kerja = `3,5 × 26.531,79 = 92.861,27` → **Rp92.800**.

### 8.5 Reimbursement

```
layak(p, aturan, tgl_nota) = masaKerjaBulan(p, tgl_nota) ≥ aturan.min_masa_kerja_bulan
jendela  = [tgl_nota − periode_bulan, tgl_nota]
terpakai = Σ nominal_disetujui (klaim disetujui di jendela) + Σ KlaimReimburseAwal di jendela
disetujui_maks = aturan.plafon ? max(0, plafon − terpakai) : ∞
nominal_bayar  = min(nominal_diajukan × persen_ganti, disetujui_maks)
```

### 8.6 Payroll bulanan (periode `P` = bulan `M`)

**Peserta run.** Saat run dibuat, `PayrollPeserta` diisi dari pegawai yang aktif pada `P` dengan `ikut = pegawai.ikut_payroll`. Admin Payroll boleh mengubah `ikut` selama run di Tahap 2; perubahan itu hanya berlaku untuk run tersebut. Menghitung memproses baris `ikut = Y`. Baris `ikut = N` **tetap diproses bila punya reimbursement disetujui yang belum dibayar**, dan slipnya hanya memuat komponen reimbursement (tanpa gaji, BPJS, DPLK, PPh).

Setiap peserta yang ikut, ditambah ahli waris pegawai yang meninggal dalam 6 bulan terakhir:

```
v        = versi Gaji berlaku pada tanggal terakhir P
dasar    = gapok + (kelompok_jabatan berhak ? tunj_jabatan : 0) + tunjangan lain
faktor   = faktorStatus(status, tgl_mulai_status, P)          # 0,80 probation (≥ UMP), 1/0,75/0,5/0,25 sakit, …
pendapatan:
  gaji & tunjangan      = dasar × faktor
  bantuan keluarga      (bila Ditahan: 25/35/45/50% × gaji terakhir)
  lembur                = RekapKehadiran(M−1).lembur_rp        (disahkan)
  reimbursement         = klaim disetujui, belum dibayar, disetujui sebelum run dihitung
  insentif/bonus        (run khusus)
potongan:
  kehadiran             = RekapKehadiran(M−1).potongan_rp
  BPJS pegawai          = Kes 1% (batas upah), JHT 2%, JP 1% (batas upah)   bila ikut
  DPLK pegawai          = 5% × 85% × (gapok + tunj_jabatan)                  bila aktif
informasi:
  BPJS perusahaan, DPLK perusahaan 10% × PhDP, PPh 21 ditanggung DPJM
neto = Σ pendapatan − Σ potongan
```

**Bulan pertama pemakaian:** belum ada rekap `M−1`. Admin HRD mengesahkan rekap kosong untuk bulan itu. Selisih yang nyata dimasukkan lewat run penyesuaian.

**Potret:** semua baris di atas disalin ke `PayrollSlip` dan `PayrollBaris` beserta kolom `rincian`. Slip hanya dibaca dari potret, tidak pernah dihitung ulang dari master.

### 8.7 PPh 21 (gross-up / ditanggung DPJM)

```
kategori(ptkp): A = TK/0, TK/1, K/0 · B = TK/2, TK/3, K/1, K/2 · C = K/3
bruto_bulan = Σ pendapatan kena_pajak + premi JKK, JKM, BPJS Kes bagian perusahaan

Jan–Nov (gross-up, dihitung iteratif sampai stabil):
  tunjangan_pajak = 0
  ulangi: pph = TER[kategori(ptkp)](bruto_bulan + tunjangan_pajak); tunjangan_pajak = pph
Des / bulan terakhir:
  neto_tahun = Σ (bruto_bulan + tunjangan_pajak) − biaya jabatan (5%, maks 6.000.000)
               − iuran pensiun/JHT/JP pegawai
  pkp = lantaiRibuan(neto_tahun − PTKP)
  pph_tahun = Pasal17(pkp);  pph_des = pph_tahun − Σ pph Jan–Nov
```

Tunjangan pajak **ditambahkan ke bruto**, sehingga pegawai menerima penghasilan utuh: neto **tidak dipotong** PPh 21 di slip. PPh dihitung **iteratif** terhadap bruto yang sudah termasuk tunjangan pajak (`pph = TER[kategori(ptkp)](bruto + tunjangan_pajak)`), lalu dicatat sebagai baris pendapatan `Tunjangan Pajak` dan baris `informasi`, serta masuk rekap pajak.

**Pengecualian insentif/remunerasi kinerja Direksi & Dewan Pengawas.** PPh atas gaji/honorarium dan tunjangan rutin Direksi & Dewas **ditanggung DPJM**; PPh atas **insentif/remunerasi kinerja** menjadi **beban pribadi penerima** dan **dipotong dari neto**, tanpa gross-up.

**Kategori TER dari kode PTKP.** A = TK/0, TK/1, K/0 · B = TK/2, TK/3, K/1, K/2 · C = K/3, dipetakan otomatis dari kolom `ptkp` pegawai. **Tabel TER resmi menunggu fixture hitungan manual Keuangan (PAY-23)**; sampai fixture ada, isian awal memakai PP 58/2023.

Perlakuan pajak per komponen dibaca dari kolom `kena_pajak` di master komponen, termasuk iuran DPLK perusahaan dan premi BPJS. **Semua detail di bagian ini, beserta perlakuan Dewan Pengawas (BP21), dikunci oleh fixture hitungan manual Keuangan** (§11.2). Bila fixture berbeda dari rumus di sini, fixture yang menang dan rumus ini diperbarui.

**Isian awal tarif (diverifikasi Keuangan sebelum Fase 3):** PTKP TK/0 Rp54.000.000, tambahan kawin Rp4.500.000, per tanggungan Rp4.500.000 (maksimal 3). Pasal 17: 5% s.d. Rp60 juta · 15% s.d. Rp250 juta · 25% s.d. Rp500 juta · 30% s.d. Rp5 miliar · 35% di atasnya. Tabel TER A/B/C sesuai PP 58/2023. BPJS: Kesehatan 4%/1% (batas Rp12.000.000), JHT 3,7%/2%, JP 2%/1% (batas upah JP tahun berjalan), JKK sesuai kelas risiko, JKM 0,3%.

### 8.8 THR dan run khusus

```
masa_kerja   = bulan penuh dari tgl_masa_kerja_diakui (bila diisi) atau tgl_masuk ke tgl_acuan run
penghasilan  = gapok + tunj_jabatan pada tgl_acuan run        # tanpa faktor status/probation
THR pegawai  = masa_kerja ≥ 12 bln ? 2 × penghasilan : (bulan_masa_kerja / 12) × 2 × penghasilan
THR Direksi  = 1 × gaji ; THR Dewas = 1 × honorarium dari master remunerasi pegawai
nominal      = hasil aturan di atas ; Admin Payroll boleh menimpanya per pegawai ("Manual")
```

**Tanpa faktor status.** THR selalu memakai penghasilan penuh (gapok + tunjangan jabatan); probation dan status kepegawaian lain tidak mengurangi THR.

**Nominal dapat disesuaikan.** Nilai awal dihitung sistem dari aturan di atas. Admin Payroll boleh mengubah nominal per pegawai dengan penanda **Manual** dan **alasan wajib**; perubahan tercatat di Audit Log, dan tersedia aksi **"kembalikan ke hitungan aturan"**.

**Peserta per run.** Peserta THR dapat diaktif/non-aktifkan per run oleh Admin Payroll **hanya selama run di Tahap 2**, dengan pola yang sama seperti peserta payroll (§8.6). Perubahan hanya berlaku untuk run itu dan alasannya dicatat. Yang non-aktif **tidak masuk total, tidak diterbitkan slip, tidak masuk rekap pajak, dan tidak ikut file transfer bank**.

**Kelayakan bawaan** (sementara menunggu Peraturan Perusahaan): masa kerja **≥ 1 bulan** per tanggal acuan; pegawai yang berhenti **kurang dari 30 hari sebelum hari raya** ditandai tidak berhak. Admin Payroll dapat menyalakan peserta yang tidak berhak dengan **alasan wajib**, tercatat di Audit Log.

**Jadwal serentak.** Setiap run THR memuat field hari raya beserta tanggalnya dan satu tanggal bayar untuk seluruh peserta. Sistem memvalidasi dan memperingatkan bila tanggal bayar **kurang dari H-14, yaitu 14 hari sebelum hari raya**. Jadwal per agama dicatat sebagai kemungkinan menyusul (butuh data agama pegawai + master hari raya per agama).

**PPh ditanggung DPJM.** PPh 21 THR ditanggung DPJM dan dicatat sebagai baris *informasi*; angkanya masih menunggu fixture hitungan manual Keuangan (PAY-23).

Run `insentif_tw`, `insentif_tahunan`, dan `bonus` mengambil nominal dari `InputInsentif`. Run `penyesuaian` merujuk `run_asal_id`, dan barisnya diisi Admin Payroll dengan alasan.

### 8.9 Tahapan run

```
tahap 1 (HRD sahkan rekap) ─► draf ─hitung(tahap 2, Payroll)─► dihitung ─ajukan─►
   tahap 3 (semua Manager yang ditunjuk) ─► tahap 4 (satu Direksi/Dirut) ─► tahap 5 (Finance bayar + terbitkan) ─► final
          ▲                                          │ kembalikan(alasan) dari tahap 3/4/5
          └──────────────────────────────────────────┘   (semua persetujuan tahap 3–4 run itu batal)
```

Setiap transisi diperiksa: pelaku memegang peran tahap itu, **belum pernah mengerjakan tahap lain pada run yang sama** (pemisahan tugas, SRS PAY-06a), dan tahapnya berurutan. Transisi dicatat di `PayrollTahap` dan Audit Log. Pada `final`, reimbursement terkait diubah menjadi *dibayar*, lalu notifikasi slip dikirim.

**Run khusus 3 tahap.** Run `thr`, `insentif_tw`, `insentif_tahunan`, `bonus`, dan `penyesuaian` adalah **run khusus**. Alurnya **3 tahap**: (1) Pengajuan Admin HRD/Admin Payroll → (2) Persetujuan Direksi → (3) Pembayaran & penerbitan slip oleh Admin Finance. **Tahap verifikasi Manager tidak dipakai** pada run khusus. Bila ditolak, pengusul dapat mengajukan ulang. **Run `bulanan` tetap 5 tahap** seperti diagram di atas.

### 8.10 Renbis & serapan anggaran

**Pagu dan serapan.** `Anggaran` menyimpan **pagu per kategori per unit per tahun**; `SerapanAnggaran` menyimpan serapan **per bulan (1–12)**. Pagu adalah batas yang ditetapkan pemilik anggaran; serapan adalah pemakaian nyata.

**Serapan otomatis dari transaksi.** Untuk bulan yang sudah berjalan, serapan dihitung sistem dari transaksi yang sudah final — bukan diketik:

| Kategori | Sumber otomatis |
|---|---|
| Penggajian (gaji & tunjangan) | `PayrollRun` `bulanan` yang final |
| THR/Insentif/Bonus | `PayrollRun` `thr`, `insentif_tw`, `insentif_tahunan`, `bonus`, `penyesuaian` yang final |
| Lembur | baris lembur (`PayrollBaris` sumber `lembur`) pada run bulanan final |
| Diklat | `BerkasBiaya` diklat fase `pertanggungjawaban` yang final |
| Perjalanan Dinas | `BerkasBiaya` dinas fase `pertanggungjawaban` yang final |
| Reimbursement | `DetailReimburse` berstatus `dibayar` |
| Vendor Outsource | `TagihanVendor` berstatus `dibayar` |

**Persen serapan.** `% serapan = terserap ÷ pagu × 100`. Terserap YTD = jumlah `SerapanAnggaran.nominal` bulan 1 sampai bulan berjalan. Bila pagu kosong atau nol, persen ditampilkan "-" (bukan pembagian nol).

**Bulan berjalan dan bulan belum berjalan.** Bulan berjalan dan bulan-bulan sebelumnya terisi `sumber = otomatis`. Bulan yang belum berjalan belum punya transaksi, jadi boleh dilengkapi **angka contoh** (`sumber = contoh`) atau **koreksi** Admin (`sumber = koreksi`). Angka contoh/koreksi **tidak pernah menimpa** baris otomatis.

**Ekspor.** Tersedia **ekspor CSV per bulan, termasuk bulan-bulan sebelumnya**, serta ekspor **seluruh periode** (CSV/XLSX) berisi pagu, terserap, sisa, dan % serapan per kategori/unit/bulan.

**Dashboard.** Menampilkan **Pagu · Terserap YTD · Sisa · % serapan**, tabel per kategori, tabel per bulan (bulan ini, kumulatif, sisa), dan grafik kumulatif vs pagu. Hak lihat: Direksi/Dirut (semua unit), Manager (unitnya), Admin Finance/HRD/Payroll (semua), Auditor (baca).

### 8.11 JMPD

**Pohon workblock.** Setiap penugasan (`Penugasan`) di milestone yang *Approved* melahirkan satu workblock turunan. Turunan bisa dipecah lagi, sehingga terbentuk pohon:

```
WB-12  (Dirut)            milestone M1 40%  → Penugasan: Direktur A 100%   → WB-12.1 (Direktur A)
                                                                              M1 → Manager Keu 60% → WB-12.1.1
                                                                                   Manager Inv 40% → WB-12.1.2
                          milestone M2 60%  → Penugasan: Manager KMR 100% → WB-12.2 (Manager KMR)
```

```
setujui(workblock):
  status = approved
  untuk tiap Penugasan p di milestone-nya:
    buat Workblock{ nomor = nomor + '.' + n, asal = turunan, pemilik = p.pegawai,
                    assigned_from = workblock.pemilik, initiative = milestone.nama,
                    bobot = p.sub_bobot, begin/completion = milik induk, status = approved }

progress_milestone(m) = Σ(p.progress × p.sub_bobot) / 100             # p.progress = progress turunannya
progress_workblock(w) = w.show_milestones
                          ? Σ(m.progress × m.bobot) / 100
                          : Σ(progress laporan disetujui per milestone × bobot) / 100
naikkan(w): setelah laporan disetujui → hitung ulang w → salin ke Penugasan induknya → naik terus sampai akar
```

Progress hanya berubah karena laporan yang **disetujui**. Perhitungan ulang berjalan di dalam kunci tulis yang sama dengan persetujuan laporan, sehingga pohon tidak pernah setengah diperbarui.

**Penyetuju dan penilai:**

```
penyetuju_workblock_buatan_sendiri(pembuat) = atasan(pembuat)           # Dirut: langsung approved
penyetuju_laporan(w) = w.asal = turunan ? w.assigned_from : atasan(w.pemilik)
penilai_workblock(w)  = penyetuju_laporan(w)
penilai_akhir(p)      = atasan(p)                                       # Staff→Manager, Manager→Direktur pembina, Direktur→Dirut
```

**Predikat** (tabel tetap di kode, bukan pengaturan, karena ini aturan penilaian yang sama untuk semua):

```js
const GRID_PREDIKAT = {          //  below_average      average             role_model          guardian
  A: ['below_expectation', 'exceed_expectation', 'exceptional',        'exceptional'],
  B: ['below_expectation', 'meet_expectation',   'exceed_expectation', 'exceptional'],
  C: ['below_expectation', 'meet_expectation',   'meet_expectation',   'exceed_expectation'],
  D: ['unsatisfactory',    'below_expectation',  'below_expectation',  'meet_expectation'],
  E: ['unsatisfactory',    'unsatisfactory',     'below_expectation',  'below_expectation'],
};
```

`PredikatJMPD` dibuat ketika `PenilaianAkhir` result **dan** behaviour untuk (pegawai, tahun, triwulan) sudah ada. Setelah itu kedua penilaian dikunci (`terkunci = Y`).

**Feedback — siapa boleh membaca:**

```
bolehBaca(u, f) = u = f.pengirim  ∨  u = f.penerima  ∨  u ∈ rantaiAtasan(f.penerima)
rantaiAtasan(p) = [atasan(p), atasan(atasan(p)), …] sampai Dirut
```

---

### 8.12 Biaya diklat dan perjalanan dinas

Satu `BerkasBiaya` = satu kegiatan (satu perjalanan dinas atau satu diklat) × satu fase. Alur tahapnya **memakai mesin tahap yang sama dengan payroll** (§8.9): peran per tahap, Manager yang ditunjuk di Tahap 3, dan pemisahan tugas yang sama. Yang berbeda hanya isinya.

```
uang_muka:
  tahap 1 HRD   : buat berkas dari pengajuan dinas/diklat yang disetujui (peserta, tanggal)
  tahap 2 Payroll: isi BiayaRincian per peserta × komponen
                   nominal = jumlah × tarif(TarifDinas berlaku pada tgl_mulai)  | bila tarif kosong: manual + keterangan wajib
  tahap 3–4     : verifikasi & pengesahan
  tahap 5 Finance: catat dibayar_pada + bukti per peserta → notifikasi "uang muka ditransfer"
                   tenggat_pj = tambahHariKerja(tgl_selesai_kegiatan, Pengaturan.tenggat_pj_hari_kerja)

pertanggungjawaban (dikirim peserta, lalu tahap 1–5 yang sama):
  biaya_sebenarnya[p] = Σ nominal rincian bukti peserta p
  selisih[p]          = biaya_sebenarnya[p] − uang_muka[p]
  selisih > 0 → tahap 5 Finance membayar kekurangan
  selisih < 0 → PengembalianUangMuka{ cara = pilihan peserta }
                  transfer_balik : peserta unggah bukti → Finance konfirmasi
                  potong_gaji    : run bulanan pertama setelah final menambah baris potongan
                                   'Pengembalian uang muka BYA-…' (sumber = pengembalian), tepat sekali
```

- Uang muka dan pembayaran kekurangan **tidak** masuk run payroll, dan tidak tampil di slip gaji. Yang masuk slip hanya potongan kelebihan bila peserta memilih potong gaji.
- Realisasi anggaran diklat tahun `Y` = Σ `biaya_sebenarnya` berkas diklat fase pertanggungjawaban yang final dengan `tgl_mulai_kegiatan` di tahun `Y`.

---

### 8.13 Katalog tunjangan, bantuan, dan komponen payroll

Komponen payroll dibaca dari master `KomponenGaji`; tarif yang bergantung grade/kelompok disimpan di `TarifKomponen`; pengecualian per orang (komponen dimatikan atau nominal khusus) disimpan di `KomponenPegawai` (§4.3). Perlakuan pajak setiap komponen dibaca dari kolom `kena_pajak`, bukan ditulis di kode.

| Kode | Nama | Tipe | Kena pajak | Basis | Keterangan |
|---|---|---|---|---|---|
| `GAJI_POKOK` | Gaji Pokok | pendapatan | Ya | versi `Gaji` yang berlaku | Sesuai tabel Grade/Sub Grade (SK) |
| `TUNJ_JABATAN` | Tunjangan Jabatan | pendapatan | Ya | `TabelGrade.tunjangan_jabatan` (P2) | Contoh per grade: Manager Rp 4.000.000 · Specialist Rp 3.000.000 · Assistant Manager Rp 2.250.000 · Bendahara Rp 2.000.000 · Senior Officer Rp 1.850.000 · Officer Rp 1.500.000 · Caraka Rp 1.200.000 |
| `UANG_MAKAN` | Uang Makan | pendapatan | Ya | hari hadir × tarif | Tunjangan operasional; tarif per grade di `TarifKomponen`, diisi HRD |
| `UANG_TRANSPORT` | Uang Transport | pendapatan | Ya | hari hadir × tarif | Tunjangan operasional; tarif per grade di `TarifKomponen`, diisi HRD |
| `UANG_TELEKOM` | Uang Telekomunikasi | pendapatan | Ya | per bulan × tarif | Tunjangan operasional; tarif per grade di `TarifKomponen`, diisi HRD |
| `TUNJ_PERUMAHAN` | Tunjangan Perumahan & Utilitas | pendapatan | Ya | Rp 22.500.000/bulan | Hanya Direksi (Surat Remunerasi) |
| `TUNJ_TRANSPORT_DEWAS` | Tunjangan Transportasi Dewan Pengawas | pendapatan | Ya | Rp 4.000.000/bulan | Hanya Dewan Pengawas (Surat Remunerasi) |
| `THR` | Tunjangan Hari Raya | pendapatan | Ya | 2× penghasilan (masa kerja ≥ 12 bulan; proporsional bila kurang) | Direksi 1× gaji · Dewas 1× honorarium · tenggat bayar **H-14** |
| `ONGKOS_CUTI_TAHUNAN` | Ongkos Cuti Tahunan | pendapatan | Ya | 1× penghasilan | Komponen peristiwa |
| `ONGKOS_CUTI_BESAR` | Ongkos Cuti Besar / Istirahat Panjang | pendapatan | Ya | 1× penghasilan | Komponen peristiwa |
| `LEMBUR` | Upah/Insentif Lembur | pendapatan | Ya | 1/173 × (gapok + tunjangan jabatan) | Lumpsum Rp 100.000/hari minimal 2 jam untuk golongan Manager/Specialist/Assistant Manager (§8.4) |
| `UANG_PIKET` | Uang Kompensasi Piket | pendapatan | Ya | per hari piket | Rp 75.000 (hari kerja) · Rp 150.000 (hari libur) · Rp 250.000 (Idul Fitri & Natal) |
| `INSENTIF_KINERJA` | Insentif Kinerja/Bonus/Jasa Produksi | pendapatan | Ya | nominal `InputInsentif` | Per run khusus; PPh insentif Direksi/Dewas dipotong dari neto (§8.7) |
| `BANTUAN_DUKA` | Bantuan Sumbangan Duka Cita | pendapatan | **Tidak** | nominal pengajuan | Komponen peristiwa; tidak kena pajak |
| `BANTUAN_DITAHAN` | Bantuan Keuangan Keluarga (pegawai ditahan) | pendapatan | Ya | persen × upah | 25% (1 tanggungan) · 35% (2) · 45% (3) · 50% (≥4); maksimal 6 bulan |
| `PURNA_KARYA` | Tambahan Uang Purna Karya | pendapatan | Ya | 5× penghasilan | Pensiun normal dengan masa kerja ≥ 24 tahun |
| `TUNJANGAN_PAJAK` | Tunjangan Pajak (gross-up) | pendapatan | Ya | hasil iterasi TER (§8.7) | Ditambahkan ke bruto; neto tidak dipotong PPh, kecuali insentif Direksi/Dewas |

**Komponen peristiwa.** `ONGKOS_CUTI_TAHUNAN`, `ONGKOS_CUTI_BESAR`, `BANTUAN_DUKA`, `BANTUAN_DITAHAN`, dan `PURNA_KARYA` tidak dihitung rutin setiap bulan. Semuanya diajukan lewat **pengajuan + approval (atasan → direksi)** dengan **bukti wajib**, lalu setelah disetujui **otomatis masuk run payroll berikutnya**. Nominal boleh ditimpa per orang lewat `KomponenPegawai.nominal_khusus` dengan **alasan wajib** yang tercatat di Audit Log.

**Tarif operasional kosong.** Tarif `UANG_MAKAN`, `UANG_TRANSPORT`, dan `UANG_TELEKOM` disiapkan **kosong** dan diisi HRD lewat tab `TarifKomponen` per grade. Selama belum diisi, sistem **memperingatkan** di layar run payroll dan komponen itu tidak dihitung sampai tarifnya lengkap.

## 9. Pekerjaan terjadwal

| Kapan (WIB) | Pekerjaan |
|---|---|
| 01.00 | Backup: `pg_dump` + salinan `/var/lib/hris`, terenkripsi, **dikirim ke luar mesin**, hapus salinan lebih dari 30 hari |
| 02.00 | Hapus foto presensi berumur > 365 hari. Isi `foto_dihapus_pada`. Catat jumlahnya di Audit Log |
| 02.30 | Nonaktifkan akun pegawai yang tanggal berhentinya sudah lewat |
| 03.00 | Hapus berkas `Ekspor/` > 7 hari dan sesi kedaluwarsa > 7 hari |
| 06.00 | Pengingat kontrak (30 hari), sertifikat (60 hari), dan pegawai tanpa kontak darurat |
| 06.15 | Pengingat pertanggungjawaban (3 hari kerja sebelum tenggat dan saat lewat tenggat). Peringatan ke HRD & Finance untuk uang muka yang belum dibayar H-1 keberangkatan |
| 07.00 | Kirim ulang email yang tertunda karena kuota |
| Tiap jam | Bersihkan cache sesi yang dicabut |

**Pekerjaan terjadwal yang gagal tidak mengeluh.** Setiap pekerjaan menulis baris ringkas (waktu, jumlah diproses, galat) ke tab `LogPemicu`. Dashboard Super Admin menampilkan **"Pekerjaan terakhir berhasil pada …"** untuk setiap pekerjaan, dan menandai merah bila lebih dari 26 jam.

---

## 10. Tampilan

**Tata letak mengikuti JM-Click (Jasa Marga) 100%. Warnanya mengikuti tema DPJM.** Acuan visualnya adalah 17 screenshot JM-Click dari pemilik (Workblock, Create Workblock, Milestone, On Going Report, Penilaian, Feedback, Penilaian Akhir, Predikat).

### 10.1 Tata letak

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [≡] [Cari menu…]                        [Feedback] [Lonceng 3] [Tema] [foto]│  bilah atas (warna --topbar)
├───────────────┬──────────────────────────────────────────────────────────────┤
│   NAMA        │  ┌ Individual Workblock Performance ───── Penilai: … / NPP ┐ │
│   NPP         │  │ Need Action │ Approved │ On Progress │ Finished │ Avg % │ │  kartu ringkasan (tint)
│   (foto)      │  └─────────────────────────────────────────────────────────┘ │
│ ▸ Beranda     │  ┌ Daftar Workblock ─────────────────────────────────────┐  │
│ ▾ JMPD        │  │ [Tahun] [Status] [Search]        [Add New Workblock]  │  │
│    Workblock  │  │ ID │ Initiative │ Assigned From │ … │ Status │ Nilai  │  │  tabel, header abu
│    Penilaian▸ │  │ …                                    row per pages: 5 │  │
│ ▸ Presensi …  │  └───────────────────────────────────────────────────────┘  │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

- **Bilah atas:** tombol lipat sidebar, pencarian menu, ikon Feedback, lonceng notifikasi dengan angka, **tombol tema terang/gelap**, dan foto profil (Profil · Ganti Kata Sandi · Keluar).
- **Sidebar (gabungan):** mengikuti gaya UI DPJM sebelumnya, yaitu **latar hijau tua penuh**, menu dikelompokkan dengan **judul seksi** huruf kapital kecil (HARIAN, SAYA, JMPD, PEGAWAI, KEUANGAN, KOMUNIKASI, LAPORAN, SISTEM), ikon garis, **angka badge** di kanan (Approval, Notifikasi), dan sorotan lebih terang pada menu aktif. Di atasnya ada **blok profil ala JM-Click** (nama, NPP, foto bulat).
- **Isi:** latar `--canvas` abu-abu, kartu putih bertajuk dengan radius 8 px, tabel dengan header `--surface`, baris 40 px, dan *row per pages*.
- **Formulir:** label mengambang di dalam kotak, tanda \* untuk wajib, dan pesan galat merah di bawah kolom. Tombol utama di kanan bawah (Submit · Save as Draft · Cancel).
- **Label status:** pil berwarna (UI-04). **Kartu ringkasan** memakai warna *tint* dari token makna.
- **HP (< 600 px):** sidebar menjadi burger, ditambah menu bawah **Beranda · Presensi · Pengajuan · Feedback · Profil**.

### 10.2 Tema DPJM

```css
:root {
  --canvas:#F2F3F3; --bg:#FFFFFF; --surface:#F7F7F7; --ink:#171717; --ink-muted:#5C5C5C;
  --line:#E4E4E4; --line-strong:#8A8A8A; --radius:4px; --radius-card:8px;
  --topbar:#0F3D2E; --topbar-ink:#FFFFFF;             /* hijau institusi menggantikan navy JM-Click */
  --accent:#0F3D2E; --accent-ink:#FFFFFF;
  /* makna + tint untuk pil & kartu ringkasan */
  --danger:#B3261E;   --danger-tint:#FBE9E7;          /* Need Action, Ditolak   */
  --info:#1F5F99;     --info-tint:#E8F0F8;            /* Approved               */
  --progress:#A4480F; --progress-tint:#FBEBDD;        /* On Progress            */
  --warning:#8A5A00;  --warning-tint:#FBF1DE;         /* Waiting for Approval   */
  --success:#2E7D4F;  --success-tint:#E6F2EA;         /* Finished               */
  --neutral-tint:#F2F2F2;                             /* Draft, Average         */
  --c1:#2E9B74; --c2:#B5730A;                          /* grafik (tetap di dua mode) */
}
:root[data-theme="dark"] {
  --canvas:#0E0E0E; --bg:#121212; --surface:#1C1C1C; --ink:#EDEDED; --ink-muted:#A3A3A3;
  --line:#2C2C2C; --line-strong:#6B6B6B; --topbar:#0B1F18; --accent:#4DA98A; --accent-ink:#0B1F18;
  --danger:#F2857C;  --danger-tint:#3A1715;   --info:#7FB2E5;     --info-tint:#15263A;
  --progress:#F0A36B; --progress-tint:#3A2210; --warning:#E8B75A; --warning-tint:#33270E;
  --success:#6FC495; --success-tint:#12291C;  --neutral-tint:#222222;
}
```

- **Grid Predikat JMPD** memakai lima warna tetap yang terbaca di dua mode, dan setiap sel juga bertuliskan nama predikatnya, sehingga warna bukan satu-satunya penanda: Exceptional `--info`, Exceed Expectation `--warning-tint` + teks tebal, Meet Expectation `--danger-tint`, Below Expectation `--success-tint`, Unsatisfactory `--neutral-tint`. Pasangan warnanya mengikuti legenda JM-Click.
- Huruf **IBM Plex Sans**, dan **IBM Plex Mono** untuk NPP, NIK, rekening. Angka `tabular-nums`, dan kolom uang rata kanan.
- **Terang adalah bawaan.** Pilihan tema disimpan di `localStorage` per perangkat. Semua komponen memakai token, tidak ada warna yang ditulis langsung.
- **Semua pasangan warna di atas wajib diuji kontras** (teks ≥ 4,5:1, batas ≥ 3:1) di kedua mode saat Fase 1, lalu nilainya disesuaikan bila ada yang gagal (NFR-05).

### 10.3 Struktur menu dan aturan tampil

Menu **tidak diatur manual per orang**. Setiap menu punya aturan tampil yang dihitung dari **posisi struktural** (jabatan) dan **peran admin**, dan aturan yang sama dipakai server untuk memeriksa izin aksinya. Menu yang tidak berhak **tidak dirender sama sekali**. Mengetik alamat halamannya tetap ditolak server (§5.3).

| Seksi | Menu | Tampil untuk |
|---|---|---|
| HARIAN | Beranda · Presensi · Notifikasi | Semua |
| | Approval (badge = jumlah menunggu saya) | Manager, Direktur, Dirut, Admin HRD, Admin Finance, Super Admin |
| | Rekap Kehadiran | Manager (unitnya), Admin HRD (semua) |
| SAYA | Profil & e-CV · Slip Gaji · Cuti · Lembur · Perjalanan Dinas (termasuk uang muka & pertanggungjawaban) · Reimbursement · Presensi Susulan · Ubah Kata Sandi | Semua |
| JMPD | Workblock · Predikat JMPD · Feedback | Semua kecuali Dewan Pengawas |
| | Penilaian Workblock · Penilaian Akhir Result · Penilaian Akhir Behaviour | Manager, Direktur, Dirut |
| PEGAWAI | Data Pegawai · Gaji Pokok · Diklat | Admin HRD (Gaji Pokok juga dibaca Admin Payroll & Admin Finance) |
| KEUANGAN | Payroll · Biaya Diklat & Dinas | Admin HRD, Admin Payroll, Admin Finance. Manager KSU & Keuangan dan Direksi/Dirut hanya **saat ada run/berkas di tahap mereka** |
| | Rencana Bisnis (pagu & serapan) | Admin Finance (mengisi pagu), Admin HRD & Admin Payroll (baca), Direksi/Dirut (baca) |
| | Verifikasi Reimbursement | Admin Finance |
| | Penetapan Perjalanan Dinas | Admin HRD |
| KOMUNIKASI | Pengumuman · Template Surat | Admin HRD |
| LAPORAN | Report | Admin HRD, Admin Payroll, Admin Finance, Auditor, Super Admin |
| | Audit Log | Auditor, Super Admin |
| SISTEM | User Management | Admin HRD (akun & reset sandi), Super Admin (plus peran admin) |
| | Pengaturan | Admin HRD, Super Admin. Admin Finance hanya bagian kategori & plafon reimbursement |

Seksi yang semua menunya tersembunyi ikut disembunyikan beserta judulnya. Contohnya, Staff tanpa peran admin hanya melihat seksi HARIAN (tanpa Approval dan Rekap), SAYA, dan JMPD.

### 10.4 Layar per peran

Rincian menu dan fitur tiap peran ada di **PRD §12**. Tabel di bawah adalah ringkasannya.

| Menu | Employee | Manager/Atasan | Direksi/Dirut | Admin HRD | Admin Payroll | Admin Finance | Auditor | Super Admin |
|---|---|---|---|---|---|---|---|---|
| Beranda | ● pribadi | + tim | + binaan | + kepegawaian | + payroll | + keuangan | + audit | + sistem |
| Presensi | ● | rekap tim | | ● rekap + koreksi + titik kantor | | | | |
| Pengajuan saya (cuti, lembur, dinas, reimburse, susulan) | ● | | | | | | | |
| Uang muka & pertanggungjawaban saya | ● | | | | | | | |
| Approval | | ● | ● | ● | | ● | | |
| Slip gaji | ● | | | | | | | |
| JMPD: Workblock | ● (Employee: turunan saja) | ● buat + bagi | ● buat + bagi | baca | | | | |
| JMPD: Penilaian & Predikat | predikat sendiri | ● timnya | ● binaannya | baca | | | report | |
| Feedback | ● | ● | ● | | | | | |
| Data Pegawai | profil | | | ● | | | | |
| Payroll | | tahap 3 | tahap 4 | tahap 1 | ● tahap 2 | ● tahap 5 | | |
| Biaya Diklat & Dinas | | tahap 3 | tahap 4 | tahap 1 | ● tahap 2 | ● tahap 5 | | |
| Verifikasi Reimbursement | | | | | | ● | | |
| Diklat · Pengumuman · Surat | baca | | | ● | | anggaran diklat | | |
| Report | | | | ● | ● | ● | ● | ● |
| Pengaturan · User Management | | | | ● | | sebagian | | ● peran |
| Audit Log | | | | | | | ● | ● |

### 10.5 Chart

Chart digambar **oleh kode sendiri sebagai SVG** lewat pembantu kecil `client/chart.html` dengan empat bentuk: `batang`, `batangBertumpuk`, `garis`, dan `progres`. Tidak ada pustaka chart dari luar, sehingga tidak ada ketergantungan CDN dan warnanya selalu mengikuti token tema.

| Aturan | Isi |
|---|---|
| Tempat | Hanya Beranda dan layar modul tertentu (PRD §6.12). Layar transaksi tanpa chart |
| Warna | `--c1` seri utama, `--c2` seri kedua, `--track` bagian tak terisi; sama di kedua tema |
| Sumbu | Satu sumbu nilai; tidak pernah dua skala |
| Bentuk | Garis untuk tren; batang bertumpuk untuk bagian-dari-keseluruhan sepanjang waktu, hanya bila ≥ 10 hari kerja; batang untuk perbandingan; progres untuk realisasi vs target |
| Nilai | Muncul saat disentuh, bukan ditulis di tiap batang. Rupiah penuh |
| Interaksi | Klik membuka layar rinciannya. Semua chart mengikuti filter tanggal layar |
| Data | Diambil dari satu aksi server yang sama dengan angka ringkasan di layar itu, supaya grafik dan tabel tidak bisa berselisih |

### 10.6 Pola interaksi

- **Mobile-first** untuk presensi. Tombol check-in besar, dan jam check-in hari ini menjadi informasi pertama.
- Satu komponen **filter tanggal** dengan 4 mode (Harian / Bulanan / Triwulan / Rentang) dipakai di semua layar berdimensi waktu. Mode Triwulan memilih TW I–IV + tahun mengikuti tahun kalender (TW I 1 Jan–31 Mar, TW II 1 Apr–30 Jun, TW III 1 Jul–30 Sep, TW IV 1 Okt–31 Des), dan menjadi bawaan untuk JMPD (SRS DSH-04).
- **Beranda disusun dari blok per peran** (PRD §6.12, SRS DSH-07 s.d. DSH-15). Setiap blok dimuat lewat satu aksi server sendiri yang memeriksa izinnya, sehingga blok yang bukan hak pengguna tidak pernah dikirim ke browser.
- Satu fungsi `formatRupiah(n) = 'Rp ' + Math.round(n).toLocaleString('id-ID')`, tanpa mode ringkas.
- Setiap tombol tulis: nonaktif saat diproses, lalu notifikasi berhasil atau gagal.
- Peta Leaflet hanya dimuat di layar **Titik Kantor** (admin).
- Galat server ditampilkan sebagai kalimat yang bisa ditindaklanjuti, misalnya *"Anda berada ±240 m dari Kantor Pusat (batas 100 m)."*, bukan kode galat.

---

## 11. Pengujian

### 11.1 Lapis tes

| Lapis | Alat | Membuktikan |
|---|---|---|
| Fungsi murni | **vitest di Node** (`npm test`) | Tanggal WIB, haversine, menit terlambat, potongan, saldo cuti, lembur, plafon, BPJS, DPLK, PPh 21, THR, progress KPI |
| Fixture payroll | vitest + `test/fixtures/payroll/*.json` | Hasil hitung sama persis dengan hitungan manual Keuangan |
| Statis | skrip Node + `tsc` | Tidak ada `INSERT`/`UPDATE`/`DELETE` di luar `repo.ts` dan `audit.ts`. Setiap aksi di `AKSI` punya izin. Tidak ada kredensial di repo. Tipe `Aksi` cocok antara klien dan server |
| Akses | fungsi `tesAkses()` di proyek **UJI** | Setiap aksi × setiap peran: yang tidak berhak **ditolak**. Pegawai A tidak bisa membaca data B. HRD ditolak membaca Audit Log. Admin Payroll tidak bisa menjalankan tahap 3–5 payroll maupun berkas biaya |
| Alur | Skenario UAT di proyek UJI | Login → check-in → cuti → approval → rekap → payroll → slip → cetak ulang identik setelah gaji naik |
| Perangkat | HP Android + iPhone | Check-in GPS + foto, di dalam dan di luar radius |

### 11.2 Fixture payroll

1. Keuangan memilih 4–5 orang contoh: TK/0, K/1, K/3, satu Direksi, dan satu Dewan Pengawas. Minimal satu dengan lembur, satu dengan terlambat, dan satu dengan reimbursement.
2. Keuangan menghitung slip mereka **dengan tangan** untuk satu bulan biasa dan untuk bulan Desember.
3. Angka itu disimpan sebagai JSON di `test/fixtures/payroll/`.
4. `npm test` harus lulus sebelum Fase 3 dianggap selesai. Setelah itu, setiap perubahan yang menggeser satu rupiah pun membuat tes gagal.

Pemeriksaan manusia terjadi sekali lalu hilang; fixture memeriksa selamanya. Untuk satu-satunya modul yang salahnya berarti pegawai menerima uang yang salah, itu selisih yang menentukan.

### 11.3 Perkakas pengembangan

Bagian ini mencatat perkakas yang dipakai **membangun** aplikasi, bukan kebutuhan aplikasinya. Ia ada di sini supaya sesi pengembangan berikutnya tidak mulai dari nol, dan **tidak** masuk PRD, yang menulis apa yang aplikasi lakukan untuk DPJM.

| Perkakas | Dipakai untuk |
|---|---|
| `vitest` | Tes `core/*` dan fixture payroll (§11.1, §11.2) |
| `security-review` | Telaah keamanan sebelum Fase 1 dipakai dan sebelum Fase 3 |
| `webapp-testing` | Uji alur layar dengan Playwright |
| `frontend-design` | Rancangan tampilan baru |
| `superpowers` | Alur brainstorming, rencana, dan TDD |
| `hris-dpjm` | **Pola tetap proyek ini** — lihat peringatan di bawah |

**Peringatan: skill `hris-dpjm` berisi pola yang sudah tidak berlaku.** Isinya masih menyebut Apps Script dan Google Sheets, `repo.tulis` dengan kunci skrip global, `core/*` yang diakhiri `module.exports` bersyarat, dan "daftarkan tabnya di §4". Skill itulah yang dibaca setiap sesi baru sebagai sumber pola proyek ini, jadi selama belum ditulis ulang ia **menyesatkan setiap sesi**. Menulis ulangnya adalah pekerjaan pertama sebelum kode mulai ditulis, dan isinya mengikuti §4.1 (tipe kolom, constraint), §5.3 (menambah aksi), §7.1 (jalur tulis dalam transaksi), serta §10 yang tidak berubah.

**Tentang ECC** (`github.com/affaan-m/ecc`): satu kumpulan agent dan skill untuk harness AI — 71 agent, 311 skill, 97 perintah. Ia mengubah cara pengembangan dikerjakan, bukan apa yang dibangun. **Belum dipasang, dan tidak dipasang sekarang.** Sebabnya: enam skill di atas sudah menutup TDD, telaah keamanan, pengujian web, dan rancangan tampilan; sebagian besar 311 skill ECC adalah paket framework yang tidak dipakai di sini (Django, Laravel, Spring Boot, Rails); dan memasangnya menambah beban konteks di setiap sesi. Nilainya yang nyata ada pada agent dan memory-nya, dan itu baru bisa dinilai jujur setelah stack ini berdiri dan ada kode yang dikerjakan. Keputusannya ditinjau ulang setelah Fase 1 selesai.

---

## 12. Lingkungan, deploy, dan runbook

| | UJI | ASLI |
|---|---|---|
| Tempat | VPS cloud, memakai kredit yang sudah dimiliki | Server kantor DPJM |
| Basis data | `hris_uji` (data contoh) | `hris` |
| Berkas | `/var/lib/hris` di mesin UJI | `/var/lib/hris` di server kantor |
| Rahasia | `/etc/hris/env`, `ENV=uji` | sama, `ENV=asli` |
| Data pegawai sungguhan | **Tidak ada.** Hanya data contoh | Ada |
| Deploy | `npm run deploy:uji` | hanya setelah UJI lulus: `npm run deploy:asli` |

**Versi harus sama di keduanya** — sistem operasi, PostgreSQL mayor, dan Node. Skrip deploy membandingkannya dan **berhenti** bila berbeda, karena "UJI lulus" di atas versi yang berbeda tidak membuktikan apa pun (NFR-13).

**Kenapa UJI di cloud, bukan di server kantor.** Kredit cloud yang sudah ada habis tanpa menjatuhkan apa pun, karena UJI tidak memuat data sungguhan dan tidak dipakai pegawai. Ia juga menghapus halangan yang nyata: pengembang tidak perlu memasang PostgreSQL dan perkakasnya di laptop Windows-nya sendiri. Bila kreditnya habis, UJI pindah ke mesin lain atau dihidupkan hanya saat dipakai; keduanya tercatat sebagai risiko di PRD §8.

Kode disimpan dengan git. Deploy mengambil kode, menjalankan migrasi `skema/*.sql` yang belum diterapkan (dicatat di tabel `skema_versi`), lalu memuat ulang layanan systemd.

**`docs/RUNBOOK.md` (ditulis di Fase 1) memuat:**
1. Menyiapkan server dari nol: paket, pengguna `hris`, folder, PostgreSQL, Nginx, systemd — lihat `PERMINTAAN_IT.md`
2. Deploy ke UJI lalu ke ASLI, dan cara kembali ke versi sebelumnya
3. **Memulihkan dari backup**, beserta tanggal terakhir prosedur ini benar-benar diuji
4. Memperbarui sertifikat TLS, dan apa yang dilakukan bila ia telanjur kedaluwarsa
5. Menambal sistem operasi dan PostgreSQL, beserta **nama orang yang bertanggung jawab**
6. Mencabut akses pegawai yang keluar
7. Payroll telanjur final dengan angka salah → run penyesuaian
8. Memeriksa pekerjaan terjadwal (`log_pemicu`) dan rantai Audit Log
9. **Apa yang dikerjakan manual selama server mati**, dan cara memasukkan datanya setelah hidup kembali

---

## 13. Batas sumber daya

**Tidak ada batas platform.** Yang membatasi hanya mesinnya sendiri, dan untuk 20 orang jaraknya jauh:

| Sumber daya | Kebutuhan nyata | Tersedia (§8 PERMINTAAN_IT) |
|---|---|---|
| CPU | Hitung payroll 20 orang: di bawah satu detik | 2–4 inti |
| RAM | Node + PostgreSQL untuk 20 pengguna | 4–8 GB |
| Cakram | Basis data < 1 GB/tahun · foto ±300 MB/tahun, dihapus setelah 1 tahun | 50–100 GB |
| Koneksi bersamaan | Puncak pagi ±20 orang check-in dalam 30 menit | Pool 10 koneksi sudah berlebih |
| Email | ±20–60/hari lewat SMTP kantor | Tidak ada kuota platform |

**Batas yang sekarang benar-benar perlu dijaga bukan sumber daya, melainkan orang:** siapa yang menambal mesin itu, dan ke mana backup-nya pergi. Keduanya tercatat sebagai risiko di PRD §8 dan sebagai keputusan yang diminta di `PERMINTAAN_IT.md` §5 dan §7.

---

## 14. Yang menunggu masukan

**Dari IT** — memblokir provisioning, bukan perancangan. Daftar lengkapnya di `PERMINTAAN_IT.md`.

| Hal | Dampak pada desain |
|---|---|
| Versi OS, PostgreSQL, dan spesifikasi server | UJI tidak bisa disiapkan; versi UJI harus sama dengan ASLI (§12) |
| Nama domain dan pemegang DNS | Sertifikat TLS tidak bisa diterbitkan (§2.1) |
| Tujuan backup di luar mesin | §12. Backup di cakram yang sama tidak menolong saat cakram itu mati |
| SMTP kantor (host, port, autentikasi) | `notif.ts`. Sampai ada, email mengantre dan notifikasi dalam aplikasi tetap jalan |
| Nama orang yang menambal server | Tidak mengubah desain, tapi tanpa itu risiko PRD §8 tidak tertangani |

**Dari pemilik / Keuangan / HR** — memblokir Fase 3, bukan perancangan. Bentuk tabelnya sudah lengkap; yang kosong hanya isinya.

| Hal | Dampak pada desain |
|---|---|
| Peraturan Perusahaan | Isian tabel `jenis_cuti` dan `aturan_reimburse` |
| Converter Coretax BPMP v.3, BP21 v.4, BPA1 | Susunan kolom ekspor di `modul/report.ts` |
| Fixture hitungan manual Keuangan | §8.7 dan `test/fixtures/payroll/` |
| Batas upah JP & kelas JKK 2026 | Isian tabel `tarif_statutori` |
| Tarif pajak TER A/B/C, Pasal 17, PTKP | Isian tabel `tarif_pajak` |
| Tarif uang harian, transport, penginapan dinas | Isian tabel `tarif_dinas` |
| Prorata pegawai baru | `core/payroll.ts` |
| Uji HP Android + iPhone | Konfirmasi §2.2 |
| Survey NPS 360 (ditunda) | Tabel `survey_nps` dan kartu *Personal NPS Score* di Penilaian Akhir Behaviour belum dibuat |

**Mesin hitung menolak berjalan dengan tabel tarif yang kosong, bukan menebak.** Layar run payroll menampilkan peringatan yang menyebutkan tarif mana yang belum diisi, dan run tidak bisa dihitung sampai diisi.

---

## 15. Lampiran: catatan migrasi

Rancangan 19 September 2026 memakai Google Apps Script dengan Google Sheets sebagai basis data. Keputusan 12 Oktober 2026 memindahkannya ke server milik DPJM, karena empat alasan sekaligus: kepatuhan data, batas platform, server kantor yang sudah ada, dan kebutuhan yang Sheets tidak bisa penuhi.

Badan dokumen ini menulis rancangan yang sekarang, tanpa menoleh ke belakang. Lampiran ini satu-satunya tempat riwayatnya dicatat, supaya keputusan yang sudah diambil tidak diperdebatkan ulang enam bulan lagi.

**Yang pindah tanpa diubah.** `core/*` — tanggal, rupiah, jarak, kehadiran, cuti, lembur, plafon, BPJS, DPLK, PPh 21, THR, payroll, KPI, validasi. Keempat belas berkas itu sejak awal ditulis sebagai fungsi murni dan dites di Node, justru supaya tidak bergantung pada platformnya. Keputusan itu membayar dirinya sendiri di sini.

**Yang hilang karena batasnya hilang.** Tujuh akal-akalan, dan tidak satu pun ditulis karena ia rancangan yang baik:

| Akal-akalan lama | Ada karena | Penggantinya |
|---|---|---|
| Semua kolom diformat teks (`@`) | Sheets mengubah `0812…` jadi angka dan `3174…` jadi notasi ilmiah | Tipe kolom sungguhan (§4.1) |
| Hash kata sandi HMAC-SHA-256 berulang + pepper + `ITERASI` terukur | Tidak tersedia argon2 maupun bcrypt | `argon2id` (§5.1) |
| Lapis cache di depan tabel sesi, `terakhir_aktif` ditulis maks 1×/5 menit | Menulis ke Sheets mahal | Satu `SELECT` berindeks (§5.2) |
| Satu kunci skrip global untuk seluruh penulisan | Tidak ada transaksi | Transaksi + `SELECT … FOR UPDATE` (§7.1) |
| Hash terakhir Audit Log disimpan di luar basis data | Tidak ada tempat lain yang aman | Tabel `audit_rantai` (§7.2) |
| Arsip Audit Log tahunan ke berkas terpisah | Batas 10 juta sel | Satu tabel, satu rantai (§4.7) |
| Varian penyajian cadangan di penyedia lain | Google pernah memblokir izin iframe | Satu jalur, domain sendiri (§2.3) |

**Yang berubah dari janji menjadi penegakan.** Tujuh aturan yang dulu bergantung pada tidak adanya kode yang melanggarnya, sekarang ditolak basis data — daftarnya di §4.1. Yang paling berarti untuk pengawasan OJK: Audit Log append-only, dan data beserta catatannya ditulis dalam satu transaksi.

**Yang menjadi tanggung jawab baru.** HTTPS, patch sistem operasi, backup, dan uptime dulu ditanggung Google. Sekarang ditanggung DPJM, dan keempatnya tercatat sebagai risiko di PRD §8 serta sebagai keputusan yang diminta di `PERMINTAAN_IT.md`.
