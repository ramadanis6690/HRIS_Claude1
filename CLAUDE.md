# HRIS Dana Pensiun Jasa Marga

Sistem kepegawaian internal 20 orang: presensi, cuti, lembur, payroll, JMPD. PostgreSQL 16 + Node 22 + React 19/Vite/TypeScript, berjalan di server milik DPJM.

**Sebelum menulis kode, baca skill `hris-dpjm`** (`.claude/skills/hris-dpjm/SKILL.md`). Skill itu memuat pola tetap proyek ini dan daftar pola lama Apps Script/Sheets yang tidak berlaku lagi.

## Sumber kebenaran

- `SRS_final.md`, `PRD_final.md`: apa yang dilakukan aplikasi
- `design_final.md`: cara membangunnya
- `skema/*.sql`: tipe, constraint, hak akses. Untuk soal tipe kolom, berkas SQL yang menentukan
- Fixture Keuangan di `test/fixtures/payroll/`: angka uang. Bila berbeda dari rumus, fixture yang menang
- `brainstorming_HRIS.md` hanya riwayat, bukan rancangan

## Alur kerja: ECC saja

Plugin `ecc@ecc` aktif untuk proyek ini (`.claude/settings.json`), dan rules-nya ada di `.claude/rules/ecc/`. Superpowers **tidak** dipakai. Urutannya: `/ecc:plan` → `ecc:tdd-workflow` → `ecc:code-reviewer` (+ `ecc:database-reviewer` untuk SQL, `ecc:security-reviewer` untuk auth/izin/repo/audit/berkas/payroll) → `ecc:verification-loop` sebelum PR. Pemetaan lengkapnya ada di skill `hris-dpjm` §13.

## Bila rules ECC bertentangan dengan proyek, proyek yang menang

| Rule ECC | Yang berlaku di sini |
|---|---|
| `patterns.md`: repository dengan `delete` | Tidak ada hapus fisik. `repo.tulis` hanya `tambah`/`ubah`/`nonaktifkan`, dan `hris_app` tidak punya hak `DELETE` |
| `patterns.md`: amplop respons API generik | Satu endpoint `POST /api {aksi, data}` → `{ok:true, data}` atau `{ok:false, galat}` (design §2.1, §5.3) |
| `patterns.md`: kloning skeleton project | Struktur mengikuti design §3 |
| `development-workflow.md`: membuat dokumen PRD/arsitektur baru | Dokumennya sudah ada. Perbarui `design_final.md`, jangan membuat dokumen tandingan |
| `development-workflow.md`: utamakan pustaka jadi | Kecuali hitungan uang (`core/*`, diikat fixture), chart (SVG sendiri, §10.5), dan layanan pihak ketiga di jalur data (dilarang, §1) |
| `postgres-patterns`: RLS ala Supabase | Tidak memakai RLS. Izin di `izin.ts` + hak role `hris_app` |
| Contoh penamaan berbahasa Inggris | Pengenal berbahasa Indonesia seperti di dokumen |
| `testing.md`: cakupan 80% | Minimum. Fungsi uang di `core/*` harus lulus fixture sampai rupiah terakhir |

Hook ECC `doc-file-warning` akan memperingatkan berkas `.md` di root (`PRD_final.md` dst.). Itu wajar. Jangan memindahkan dokumen hanya karena peringatan itu. Pesan commit memakai format conventional commit (`feat: …`, `docs: …`), yang juga diperiksa hook ECC.
