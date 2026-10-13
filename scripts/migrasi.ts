// Menerapkan migrasi skema/NNN_*.sql yang belum tercatat di `skema_versi`.
//
// Dijalankan sebagai PEMILIK basis data (DATABASE_URL_PEMILIK), bukan sebagai
// hris_app: aplikasi tidak punya hak mengubah struktur tabel.
// Setiap berkas dijalankan psql dalam satu transaksi (-1), jadi migrasi yang
// gagal di tengah tidak meninggalkan skema setengah jadi.
// Berkas yang sudah diterapkan tidak pernah dijalankan ulang atau disunting.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { muatBerkasEnv } from '../src/server/konfig.js';

muatBerkasEnv();

const url = process.env.DATABASE_URL_PEMILIK;
if (!url) {
  console.error('DATABASE_URL_PEMILIK belum diisi. Lihat docs/KONFIGURASI_SERVER.md.');
  process.exit(1);
}

const folder = join(process.cwd(), 'skema');
const berkas = readdirSync(folder)
  .filter((n) => /^\d{3}_.+\.sql$/.test(n))
  .sort();

function psql(args: string[]): string {
  return execFileSync('psql', [url!, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

const adaTabel = psql(['-tAc', "SELECT to_regclass('public.skema_versi') IS NOT NULL"]).trim() === 't';
const sudah = new Set<number>(
  adaTabel
    ? psql(['-tAc', 'SELECT versi FROM skema_versi'])
        .split('\n')
        .filter(Boolean)
        .map(Number)
    : [],
);

let diterapkan = 0;
for (const nama of berkas) {
  const versi = Number(nama.slice(0, 3));
  if (sudah.has(versi)) continue;
  process.stdout.write(`menerapkan ${nama} … `);
  psql(['-1', '-f', join(folder, nama)]);
  const tercatat = psql(['-tAc', `SELECT count(*) FROM skema_versi WHERE versi = ${versi}`]).trim();
  if (tercatat !== '1') {
    console.error(`\n${nama} tidak mencatat dirinya di skema_versi. Setiap migrasi wajib diakhiri INSERT INTO skema_versi.`);
    process.exit(1);
  }
  console.log('selesai');
  diterapkan++;
}

console.log(diterapkan === 0 ? 'Skema sudah mutakhir.' : `${diterapkan} migrasi diterapkan.`);
