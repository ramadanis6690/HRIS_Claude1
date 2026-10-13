#!/usr/bin/env bash
# Deploy ke UJI atau ASLI (design_final.md §12, SRS NFR-13).
#   sudo bash deploy/deploy.sh uji      — di mesin UJI
#   sudo bash deploy/deploy.sh asli     — di server kantor, hanya setelah UJI lulus
#
# Langkah: periksa versi → ambil kode → npm ci → build → migrasi → muat ulang layanan.
# Di ASLI, deploy BERHENTI bila versi OS / PostgreSQL mayor / Node mayor berbeda
# dari yang lulus di UJI ("UJI lulus" di atas versi berbeda tidak membuktikan apa pun).
set -euo pipefail
SASARAN="${1:?pakai: deploy.sh uji|asli}"
APP=/opt/hris
REF="${HRIS_DEPLOY_REF:-main}"
set -a; source /etc/hris/env; set +a

[[ "$HRIS_LINGKUNGAN" == "$SASARAN" ]] || { echo "Berkas /etc/hris/env menyatakan HRIS_LINGKUNGAN=$HRIS_LINGKUNGAN, bukan $SASARAN."; exit 1; }

OS="$(. /etc/os-release && echo "$PRETTY_NAME")"
PG="$(runuser -u postgres -- psql -tAc 'SHOW server_version_num' | cut -c1-2)"
NODE="$(node -p 'process.versions.node.split(".")[0]')"
VERSI="$OS|$PG|$NODE"
echo "Versi mesin ini: $VERSI"
if [[ "$SASARAN" == "asli" ]]; then
  [[ -n "${HRIS_VERSI_UJI:-}" ]] || { echo "HRIS_VERSI_UJI belum diisi di /etc/hris/env. Isi dengan versi yang dicetak deploy di UJI."; exit 1; }
  [[ "$VERSI" == "$HRIS_VERSI_UJI" ]] || { echo "BERHENTI: versi ASLI ($VERSI) berbeda dari UJI ($HRIS_VERSI_UJI)."; exit 1; }
fi

cd "$APP"
H=(runuser -u hris -- env HOME="$APP")   # npm butuh HOME yang bisa ditulis pengguna hris
SEBELUM="$("${H[@]}" git rev-parse HEAD)"
"${H[@]}" git fetch --quiet origin
"${H[@]}" git checkout --quiet "$REF"
"${H[@]}" git pull --quiet --ff-only origin "$REF"
"${H[@]}" npm ci --no-audit --no-fund
"${H[@]}" npm run build
"${H[@]}" DATABASE_URL_PEMILIK="$DATABASE_URL_PEMILIK" HRIS_ENV_FILE=/tidak-ada npx tsx scripts/migrasi.ts
systemctl restart hris.service
sleep 2
if curl -sf "http://127.0.0.1:${HRIS_PORT:-3000}/api/sehat" >/dev/null; then
  echo "Deploy $SASARAN selesai: $("${H[@]}" git rev-parse --short HEAD) (sebelumnya ${SEBELUM:0:7})."
  [[ "$SASARAN" == "uji" ]] && echo "Untuk ASLI, isi HRIS_VERSI_UJI=\"$VERSI\" di /etc/hris/env server kantor."
else
  echo "Layanan tidak sehat setelah deploy. Kembali ke versi sebelumnya: lihat docs/RUNBOOK.md §2." >&2
  exit 1
fi
