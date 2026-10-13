#!/usr/bin/env bash
# Menyiapkan PostgreSQL di mesin pengembang atau lingkungan UJI:
# dua role (pemilik untuk migrasi, hris_app untuk aplikasi) dan dua basis data
# (hris dan hris_uji). Di server ASLI langkah ini dikerjakan IT —
# lihat docs/KONFIGURASI_SERVER.md.
#
# Pemakaian:  sudo -u postgres bash scripts/siapkan-db.sh
#   atau      PGHOST=... PGUSER=postgres bash scripts/siapkan-db-lokal.sh
#
# Kata sandi diambil dari variabel lingkungan bila ada, dan dibuat acak bila
# tidak. Nilainya dicetak sekali di akhir untuk disalin ke berkas env.
set -euo pipefail

SANDI_PEMILIK="${SANDI_PEMILIK:-$(openssl rand -hex 24)}"
SANDI_APP="${SANDI_APP:-$(openssl rand -hex 24)}"
DATABASES="${DATABASES:-hris hris_uji}"

psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_pemilik') THEN
    CREATE ROLE hris_pemilik LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hris_app') THEN
    CREATE ROLE hris_app LOGIN;
  END IF;
END
\$\$;
ALTER ROLE hris_pemilik PASSWORD '${SANDI_PEMILIK}';
ALTER ROLE hris_app PASSWORD '${SANDI_APP}';
-- 001 menjalankan ALTER ROLE hris_app SET timezone. Di PostgreSQL 16 itu butuh
-- CREATEROLE ditambah ADMIN atas hris_app. INHERIT/SET FALSE: pemilik tidak
-- ikut memakai hak hris_app, hanya boleh mengatur role itu.
ALTER ROLE hris_pemilik CREATEROLE;
GRANT hris_app TO hris_pemilik WITH ADMIN TRUE, INHERIT FALSE, SET FALSE;
SQL

for db in $DATABASES; do
  if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db}'" | grep -q 1; then
    psql -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE ${db} OWNER hris_pemilik ENCODING 'UTF8' TEMPLATE template0"
  fi
  # Ekstensi btree_gist dipasang superuser sekali per basis data.
  psql -v ON_ERROR_STOP=1 -q -d "$db" -c "CREATE EXTENSION IF NOT EXISTS btree_gist"
  psql -v ON_ERROR_STOP=1 -q -d "$db" -c "ALTER SCHEMA public OWNER TO hris_pemilik"
done

cat <<EOF

Role dan basis data siap. Salin ke berkas env (jangan masuk git):

  DATABASE_URL=postgres://hris_app:${SANDI_APP}@127.0.0.1:5432/hris
  DATABASE_URL_PEMILIK=postgres://hris_pemilik:${SANDI_PEMILIK}@127.0.0.1:5432/hris

Lalu jalankan:  npm run migrasi
EOF
