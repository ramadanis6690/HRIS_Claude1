#!/usr/bin/env bash
# Memulihkan satu backup ke basis data dan folder berkas sasaran (SRS NFR-12).
# Uji pemulihan dilakukan tiap 3 bulan ke lingkungan UJI, dan tanggalnya dicatat
# di docs/RUNBOOK.md. Backup yang belum pernah dipulihkan dianggap belum ada.
#
#   sudo bash deploy/pulihkan.sh /mnt/backup-hris/hris-20261014-0100.tar.gpg hris_uji /var/lib/hris
#
# Butuh kunci privat GPG penerima di mesin tempat pemulihan dijalankan.
# Basis data diganti dalam SATU transaksi: bila pemulihan gagal di tengah,
# isi lama tetap utuh.
set -euo pipefail
umask 077
ARSIP="${1:?pakai: pulihkan.sh <berkas.tar.gpg> <basis data sasaran> [folder berkas]}"
DB="${2:?basis data sasaran, mis. hris_uji}"
DIR_BERKAS="${3:-/var/lib/hris}"
KERJA="$(mktemp -d /var/tmp/hris-pulih.XXXXXX)"
trap 'rm -rf "$KERJA"' EXIT

# 1. Periksa arsip sebelum menyentuh apa pun.
if [[ -f "$ARSIP.sha256" ]]; then (cd "$(dirname "$ARSIP")" && sha256sum -c "$(basename "$ARSIP").sha256"); fi
gpg --batch --decrypt "$ARSIP" | tar -C "$KERJA" -xf -
DUMP="$(ls "$KERJA"/*.dump)"
TAR="$(ls "$KERJA"/*-berkas.tar)"
pg_restore --list "$DUMP" > /dev/null
tar -tf "$TAR" > /dev/null
echo "Arsip utuh: $(basename "$DUMP"), $(tar -tf "$TAR" | wc -l) entri berkas."

read -r -p "Basis data '$DB' dan folder '$DIR_BERKAS' akan DITIMPA. Ketik nama basis data untuk lanjut: " jawab
[[ "$jawab" == "$DB" ]] || { echo "Dibatalkan."; exit 1; }

systemctl stop hris.service 2>/dev/null || true

# 2. Basis data: hapus skema, pulihkan, pasang hak akses — semuanya satu transaksi.
#    Objek dibuat sebagai hris_pemilik supaya migrasi berikutnya tetap bisa berjalan.
{
  echo 'DROP SCHEMA public CASCADE;'
  echo 'CREATE SCHEMA public AUTHORIZATION hris_pemilik;'
  echo 'SET ROLE hris_pemilik;'
  pg_restore --no-owner --file=- "$DUMP"
  # Hak hris_app persis seperti migrasi 001 dan 003 (juga ikut dari ACL di dump).
  cat <<'SQL'
SET search_path = public;
GRANT USAGE ON SCHEMA public TO hris_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO hris_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hris_app;
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM hris_app;
REVOKE UPDATE ON audit_log FROM hris_app;
REVOKE INSERT, UPDATE ON tarif_statutori, tarif_pajak FROM hris_app;
GRANT DELETE ON sesi TO hris_app;
SQL
} | runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$DB"

# 3. Berkas: isi folder sasaran diganti isi arsip.
mkdir -p "$DIR_BERKAS"
find "$DIR_BERKAS" -mindepth 1 -delete
tar -C "$DIR_BERKAS" --strip-components=1 -xf "$TAR"
chown -R hris:hris "$DIR_BERKAS"
chmod 0750 "$DIR_BERKAS"

systemctl start hris.service 2>/dev/null || true
echo "Pemulihan selesai. Masuk sebagai Auditor dan jalankan 'Periksa rantai' untuk memastikan Audit Log utuh."
