#!/usr/bin/env bash
# Backup harian (design_final.md §12, SRS NFR-12): pg_dump + salinan /var/lib/hris,
# dienkripsi dengan kunci publik GPG, dikirim ke LUAR mesin ini, disimpan 30 hari.
# Hasilnya dicatat ke log_pemicu supaya tampil di Beranda Super Admin.
#
# Dijalankan systemd (hris-backup.service) sebagai root, dengan /etc/hris/env.
set -euo pipefail
umask 077   # arsip dan berkas kerja hanya terbaca root

: "${HRIS_BACKUP_TUJUAN:?HRIS_BACKUP_TUJUAN belum diisi di /etc/hris/env}"
: "${HRIS_BACKUP_GPG_PENERIMA:?HRIS_BACKUP_GPG_PENERIMA belum diisi di /etc/hris/env}"
SIMPAN_HARI="${HRIS_BACKUP_SIMPAN_HARI:-30}"
DIR_BERKAS="${HRIS_DIR_BERKAS:-/var/lib/hris}"
DB="${HRIS_BACKUP_DB:-hris}"
APP="${HRIS_APP:-/opt/hris}"
STEMPEL="$(TZ=Asia/Jakarta date +%Y%m%d-%H%M)"
KERJA="$(mktemp -d /var/tmp/hris-backup.XXXXXX)"
NAMA="hris-${STEMPEL}"

catat() { # berhasil|gagal pesan
  # runuser mempertahankan variabel lingkungan dari EnvironmentFile systemd.
  runuser -u hris -- node "$APP/dist/server/server/pekerjaan/jalankan.js" catat-backup "$@" || true
}
gagal() {
  catat gagal "$1"
  echo "BACKUP GAGAL: $1" >&2
  rm -rf "$KERJA"
  exit 1
}
trap 'gagal "baris $LINENO"' ERR

chmod 0700 "$KERJA"
# 1. Basis data, format custom (bisa dipulihkan per tabel).
runuser -u postgres -- pg_dump --format=custom --no-owner --dbname="$DB" > "$KERJA/$NAMA.dump"
# 2. Berkas: foto, dokumen, lampiran.
tar -C "$(dirname "$DIR_BERKAS")" -cf "$KERJA/$NAMA-berkas.tar" "$(basename "$DIR_BERKAS")"
# 3. Satu arsip, dienkripsi untuk penerima. Kunci privat tidak pernah ada di server ini.
tar -C "$KERJA" -cf - "$NAMA.dump" "$NAMA-berkas.tar" \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$HRIS_BACKUP_GPG_PENERIMA" --output "$KERJA/$NAMA.tar.gpg"
sha256sum "$KERJA/$NAMA.tar.gpg" | sed "s#$KERJA/##" > "$KERJA/$NAMA.tar.gpg.sha256"

# 4. Kirim ke luar mesin.
if [[ "$HRIS_BACKUP_TUJUAN" == *:* ]]; then
  rsync -a "$KERJA/$NAMA.tar.gpg" "$KERJA/$NAMA.tar.gpg.sha256" "$HRIS_BACKUP_TUJUAN"
  echo "Retensi ${SIMPAN_HARI} hari dikelola di tujuan rsync (NAS)."
else
  # Folder NAS yang di-mount. Tolak bila ternyata folder biasa di cakram yang sama.
  mountpoint -q "$HRIS_BACKUP_TUJUAN" || [[ "$(stat -c %d "$HRIS_BACKUP_TUJUAN")" != "$(stat -c %d /)" ]] \
    || gagal "Tujuan $HRIS_BACKUP_TUJUAN ada di cakram yang sama dengan server — backup tidak menolong saat cakram ini mati."
  cp "$KERJA/$NAMA.tar.gpg" "$KERJA/$NAMA.tar.gpg.sha256" "$HRIS_BACKUP_TUJUAN/"
  (cd "$HRIS_BACKUP_TUJUAN" && sha256sum -c "$NAMA.tar.gpg.sha256" >/dev/null) || gagal "Salinan di tujuan tidak cocok sha256"
  find "$HRIS_BACKUP_TUJUAN" -maxdepth 1 -name 'hris-*.tar.gpg*' -mtime "+$SIMPAN_HARI" -delete
fi

UKURAN="$(du -h "$KERJA/$NAMA.tar.gpg" | cut -f1)"
rm -rf "$KERJA"
trap - ERR
catat berhasil
echo "Backup selesai: $NAMA.tar.gpg ($UKURAN) → $HRIS_BACKUP_TUJUAN"
