# HRIS Dana Pensiun Jasa Marga

Sistem kepegawaian internal untuk 20 orang: presensi GPS + foto, data pegawai, dan (fase berikutnya) pengajuan, payroll, serta JMPD. PostgreSQL 16 + Node 22 + React 19, berjalan di server milik DPJM.

| Dokumen | Isi |
|---|---|
| `PRD_final.md`, `SRS_final.md` | Apa yang dilakukan aplikasi, per fase |
| `design_final.md` | Cara membangunnya |
| `PERMINTAAN_IT.md` | Kebutuhan server dan alasannya |
| `docs/KONFIGURASI_SERVER.md` | **Langkah memasang di server UJI/ASLI** |
| `docs/RUNBOOK.md` | Deploy, backup & pemulihan, tambalan, server mati |
| `CLAUDE.md`, `.claude/skills/hris-dpjm` | Pola tetap proyek untuk sesi pengembangan |

## Status

**Fase 1 — Fondasi & harian** sudah dibangun: login & User Management (9 peran), Pengaturan, Data Pegawai (riwayat, dokumen, foto, gaji berversi, impor Excel, e-CV PDF), Presensi GPS + foto, Rekap harian & koreksi HRD, Audit Log berantai hash, Beranda per peran, pekerjaan terjadwal, dan backup.

Fase 2 (pengajuan & approval, notifikasi, rekap bulanan), Fase 3 (payroll), dan Fase 4 (JMPD) belum dibangun. Tabelnya sudah ada di skema.

## Menjalankan di komputer pengembang

Butuh Node 22 dan PostgreSQL 16.

```bash
npm install
sudo -u postgres SANDI_PEMILIK=... SANDI_APP=... DATABASES="hris hris_tes" bash scripts/siapkan-db.sh
cp deploy/env.contoh .env     # lalu sesuaikan: HRIS_LINGKUNGAN=pengembangan, DATABASE_URL..., HRIS_DIR_BERKAS=./var/berkas
npm run migrasi
npm run isi-contoh            # 20 pegawai contoh, sandi Contoh#2026
npm run dev                   # server :3000 + tampilan :5173
```

Akun contoh: `C0010` Super Admin, `C0009` Admin HRD, `C0011` Admin Payroll, `C0012` Admin Finance, `C0013` Auditor, `C0004` Manager KSU, `C0002` Direktur, `C0014` Staff.

Menjalankan hasil build tanpa Nginx (mis. UJI cepat): `npm run build && HRIS_DIR_STATIS=./dist/client npm start`.

## Tes

```bash
npm run typecheck
npm test                      # core murni, statis, dan integrasi
```

Tes integrasi butuh basis data uji kosong yang boleh dihapus isinya: isi `HRIS_TES_DATABASE_URL` (role `hris_app`) dan `HRIS_TES_DATABASE_URL_PEMILIK` di `.env`. Tanpa keduanya, tes integrasi dilewati.
