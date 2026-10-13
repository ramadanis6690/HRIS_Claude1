-- =============================================================================
-- HRIS DPJM — migrasi 003: sesi kedaluwarsa boleh dibuang
--
-- design_final.md §5.2 dan §9 meminta sesi yang kedaluwarsa lebih dari 7 hari
-- dihapus oleh pekerjaan terjadwal. Migrasi 001 mencabut DELETE dari seluruh
-- tabel, termasuk `sesi`, sehingga pekerjaan itu tidak bisa berjalan.
--
-- Pengecualian ini hanya untuk `sesi`: baris sesi adalah keadaan login, bukan
-- data bisnis, dan tidak ada yang diaudit darinya (token mentah tidak pernah
-- disimpan). Aturan "tidak ada hapus fisik" (AUD-04) tetap berlaku untuk
-- seluruh tabel lain. Satu-satunya DELETE di kode ada di repo.ts
-- (operasional.sesiBuang), dan tes statis memastikannya tetap begitu.
-- =============================================================================

\set ON_ERROR_STOP on

GRANT DELETE ON sesi TO hris_app;

INSERT INTO skema_versi (versi, nama) VALUES (3, '003_buang_sesi');
