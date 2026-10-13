// Satu proses Node (design_final.md §1). Di server ia mendengar di 127.0.0.1:3000
// di belakang Nginx; Nginx yang memegang TLS dan menyajikan tampilan statis.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { uuidSah } from '../core/validasi.js';
import { jalankan, penggunaDariToken, periksaTabelAksi, sehat, type Konteks } from './api.js';
import { NAMA_COOKIE } from './auth.js';
import * as berkas from './berkas.js';
import { bacaSatu, sambung, tutup } from './db.js';
import { keGalat } from './galat.js';
import { bisaBacaDokumen, bisaBacaFotoPresensi, punyaSalahSatu, type Pengguna } from './izin.js';
import { bacaKonfig, muatBerkasEnv, type Konfig } from './konfig.js';
import { log } from './log.js';
import { buatEcv } from './modul/ecv.js';
import * as impor from './modul/impor.js';

const BATAS_BODY = 10 * 1024 * 1024; // sama dengan batas unggah Nginx
const UMUR_INGAT_DETIK = 30 * 24 * 60 * 60;

const HEADER_AMAN: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
};

/** CSP untuk halaman: tanpa CDN; peta Titik Kantor memakai ubin dan pencarian OpenStreetMap. */
export const CSP =
  "default-src 'self'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; " +
  "connect-src 'self' https://nominatim.openstreetmap.org; style-src 'self' 'unsafe-inline'; font-src 'self'; " +
  "script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

function bacaCookie(req: IncomingMessage, nama: string): string | null {
  const h = req.headers.cookie;
  if (!h) return null;
  for (const bagian of h.split(';')) {
    const i = bagian.indexOf('=');
    if (i > 0 && bagian.slice(0, i).trim() === nama) return decodeURIComponent(bagian.slice(i + 1).trim());
  }
  return null;
}

function cookieSesi(konfig: Konfig, token: string | null, ingat = false): string {
  const aman = konfig.cookieAman ? '; Secure' : '';
  if (token === null) return `${NAMA_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${aman}`;
  return `${NAMA_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${ingat ? `; Max-Age=${UMUR_INGAT_DETIK}` : ''}${aman}`;
}

function kirimJson(res: ServerResponse, status: number, isi: unknown, header: Record<string, string> = {}): void {
  const teks = JSON.stringify(isi);
  res.writeHead(status, { ...HEADER_AMAN, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...header });
  res.end(teks);
}

function kirimTeks(res: ServerResponse, status: number, teks: string): void {
  res.writeHead(status, { ...HEADER_AMAN, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(teks);
}

async function bacaBody(req: IncomingMessage): Promise<string> {
  const bagian: Buffer[] = [];
  let ukuran = 0;
  for await (const b of req) {
    ukuran += (b as Buffer).length;
    if (ukuran > BATAS_BODY) throw Object.assign(new Error('Body terlalu besar'), { status: 413 });
    bagian.push(b as Buffer);
  }
  return Buffer.concat(bagian).toString('utf8');
}

/** Permintaan dari situs lain ditolak walau cookie SameSite=Lax sudah menahannya. */
function asalSah(req: IncomingMessage, konfig: Konfig): boolean {
  const asal = req.headers.origin;
  if (!asal) return true;
  if (konfig.asalSah.length > 0) return konfig.asalSah.includes(asal);
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  try {
    return new URL(asal).host === host;
  } catch {
    return false;
  }
}

async function tanganiApi(req: IncomingMessage, res: ServerResponse, konfig: Konfig): Promise<void> {
  if (!asalSah(req, konfig)) return kirimJson(res, 403, { ok: false, galat: { kode: 'DITOLAK', pesan: 'Asal permintaan tidak sah.' } });
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
    return kirimJson(res, 415, { ok: false, galat: { kode: 'MASUKAN', pesan: 'Permintaan harus JSON.' } });
  }
  let isi: { aksi?: unknown; data?: unknown };
  try {
    isi = JSON.parse(await bacaBody(req)) as { aksi?: unknown; data?: unknown };
  } catch (e) {
    const besar = (e as { status?: number }).status === 413;
    return kirimJson(res, besar ? 413 : 400, { ok: false, galat: { kode: 'MASUKAN', pesan: besar ? 'Berkas terlalu besar (maksimal 10 MB).' : 'Permintaan tidak bisa dibaca.' } });
  }
  const k: Konteks = { perangkat: req.headers['user-agent'] ?? null, lingkungan: konfig.lingkungan, dirBerkas: konfig.dirBerkas };
  const h = await jalankan({ aksi: isi?.aksi, data: isi?.data, token: bacaCookie(req, NAMA_COOKIE) }, k);
  const header: Record<string, string> = {};
  if (h.cookie) header['Set-Cookie'] = 'hapus' in h.cookie ? cookieSesi(konfig, null) : cookieSesi(konfig, h.cookie.token, h.cookie.ingat);
  kirimJson(res, 200, h.respons, header);
}

async function izinBerkas(u: Pengguna, b: berkas.InfoBerkas): Promise<boolean> {
  switch (b.golongan) {
    case 'presensi': {
      const r = await bacaSatu<{ pegawai_id: string }>(
        `SELECT pegawai_id FROM presensi WHERE foto_file_id = $1 UNION ALL SELECT pegawai_id FROM percobaan_check_in WHERE foto_file_id = $1 LIMIT 1`,
        [b.id],
      );
      return r !== null && (await bisaBacaFotoPresensi(u, r.pegawai_id));
    }
    case 'foto_profil': {
      const r = await bacaSatu<{ id: string }>('SELECT id FROM pegawai WHERE foto_file_id = $1', [b.id]);
      return r !== null && bisaBacaDokumen(u, r.id);
    }
    case 'dokumen': {
      const r = await bacaSatu<{ pegawai_id: string }>('SELECT pegawai_id FROM dokumen WHERE berkas_id = $1', [b.id]);
      return r !== null && bisaBacaDokumen(u, r.pegawai_id);
    }
    default:
      return false;
  }
}

async function tanganiUnduhan(req: IncomingMessage, res: ServerResponse, url: URL, konfig: Konfig): Promise<void> {
  let u: Pengguna;
  try {
    u = await penggunaDariToken(bacaCookie(req, NAMA_COOKIE));
  } catch {
    return kirimTeks(res, 401, 'Sesi Anda sudah berakhir. Silakan masuk lagi.');
  }
  const [, , jenis, id] = url.pathname.split('/');
  try {
    if (jenis === 'berkas' && uuidSah(id)) {
      const b = await berkas.info(id);
      if (!b || !(await izinBerkas(u, b))) return kirimTeks(res, 404, 'Berkas tidak ditemukan.');
      if (b.dihapus_pada) return kirimTeks(res, 410, 'Berkas ini sudah dihapus sesuai masa simpan.');
      return berkas.alirkan(res, b);
    }
    if (jenis === 'foto-profil' && uuidSah(id)) {
      const r = await bacaSatu<{ foto_file_id: string | null }>('SELECT foto_file_id FROM pegawai WHERE id = $1', [id]);
      if (!r?.foto_file_id || !bisaBacaDokumen(u, id)) return kirimTeks(res, 404, 'Foto tidak ada.');
      const b = await berkas.info(r.foto_file_id);
      if (!b) return kirimTeks(res, 404, 'Foto tidak ada.');
      return berkas.alirkan(res, b);
    }
    if (jenis === 'ecv' && uuidSah(id)) {
      if (!bisaBacaDokumen(u, id)) return kirimTeks(res, 404, 'Tidak ditemukan.');
      const pdf = await buatEcv(id, konfig.dirBerkas);
      res.writeHead(200, { ...HEADER_AMAN, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="e-CV.pdf"', 'Cache-Control': 'private, no-store' });
      return void res.end(pdf);
    }
    if (jenis === 'templat-impor') {
      if (!punyaSalahSatu(u, ['admin_hrd', 'super_admin'])) return kirimTeks(res, 404, 'Tidak ditemukan.');
      const xlsx = await impor.templat();
      res.writeHead(200, {
        ...HEADER_AMAN,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${impor.NAMA_TEMPLAT}"`,
        'Cache-Control': 'no-store',
      });
      return void res.end(xlsx);
    }
    return kirimTeks(res, 404, 'Tidak ditemukan.');
  } catch (e) {
    const g = keGalat(e, { unduhan: url.pathname });
    return kirimTeks(res, 500, g.pesan);
  }
}

const MEDIA_STATIS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** Tanpa Nginx (pengembangan/UJI cepat): tampilan statis disajikan proses ini, dengan fallback ke index.html. */
async function sajikanStatis(res: ServerResponse, url: URL, dir: string): Promise<void> {
  let jalur = normalize(join(dir, decodeURIComponent(url.pathname)));
  if (!jalur.startsWith(normalize(dir) + sep) && jalur !== normalize(dir)) return kirimTeks(res, 404, 'Tidak ditemukan.');
  let s = await stat(jalur).catch(() => null);
  if (!s || s.isDirectory()) {
    jalur = join(dir, 'index.html');
    s = await stat(jalur).catch(() => null);
    if (!s) return kirimTeks(res, 404, 'Tampilan belum dibangun. Jalankan npm run build.');
  }
  const ext = extname(jalur);
  const abadi = url.pathname.startsWith('/assets/');
  res.writeHead(200, {
    ...HEADER_AMAN,
    'Content-Type': MEDIA_STATIS[ext] ?? 'application/octet-stream',
    'Content-Length': String(s.size),
    'Cache-Control': abadi ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...(ext === '.html' ? { 'Content-Security-Policy': CSP } : {}),
  });
  createReadStream(jalur).pipe(res);
}

export function buatServer(konfig: Konfig) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://lokal');
    const kerja = (async () => {
      if (url.pathname === '/api' && req.method === 'POST') return tanganiApi(req, res, konfig);
      if (url.pathname === '/api/sehat' && req.method === 'GET') {
        const ok = await sehat();
        return kirimJson(res, ok ? 200 : 503, { ok });
      }
      if (url.pathname.startsWith('/api/unduh/') && req.method === 'GET') return tanganiUnduhan(req, res, url, konfig);
      if (url.pathname.startsWith('/api')) return kirimTeks(res, 404, 'Tidak ditemukan.');
      if (konfig.dirStatis && (req.method === 'GET' || req.method === 'HEAD')) return sajikanStatis(res, url, konfig.dirStatis);
      return kirimTeks(res, 404, 'Tidak ditemukan.');
    })();
    kerja.catch((e) => {
      log.galat('Permintaan gagal', e, { jalur: url.pathname });
      if (!res.headersSent) kirimTeks(res, 500, 'Terjadi galat di server.');
      else res.end();
    });
  });
}

export async function mulai(): Promise<void> {
  muatBerkasEnv();
  const konfig = bacaKonfig();
  periksaTabelAksi();
  sambung(konfig.databaseUrl);
  berkas.aturAkar(konfig.dirBerkas);
  const server = buatServer(konfig);
  server.listen(konfig.port, konfig.host, () => {
    log.info('HRIS berjalan', { host: konfig.host, port: konfig.port, lingkungan: konfig.lingkungan, statis: konfig.dirStatis });
  });
  const henti = () => {
    log.info('Menghentikan HRIS');
    server.close(() => void tutup().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', henti);
  process.on('SIGINT', henti);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  mulai().catch((e) => {
    log.galat('Gagal memulai HRIS', e);
    process.exit(1);
  });
}
