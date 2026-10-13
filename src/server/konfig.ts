// Konfigurasi dibaca dari variabel lingkungan. Di server, systemd memasangnya
// dari /etc/hris/env (root, 0600) — tidak pernah ada di repo (NFR-15).
// Saat pengembangan, berkas `.env` di folder proyek dimuat bila ada.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type Lingkungan = 'pengembangan' | 'uji' | 'asli';

export interface Konfig {
  lingkungan: Lingkungan;
  databaseUrl: string;
  port: number;
  host: string;
  dirBerkas: string;
  /** Cookie `Secure`. Wajib true di UJI dan ASLI (selalu HTTPS di belakang Nginx). */
  cookieAman: boolean;
  /** Bila diisi, server ikut menyajikan tampilan statis dari folder ini (tanpa Nginx). */
  dirStatis: string | null;
  /** Asal (origin) yang sah untuk panggilan /api, mis. https://hris.dpjm.co.id. Kosong = sama dengan Host. */
  asalSah: string[];
}

export function muatBerkasEnv(): void {
  const berkas = process.env.HRIS_ENV_FILE ?? join(process.cwd(), '.env');
  if (existsSync(berkas)) process.loadEnvFile(berkas);
}

function wajib(nama: string): string {
  const v = process.env[nama];
  if (!v) throw new Error(`Variabel lingkungan ${nama} belum diisi`);
  return v;
}

export function bacaKonfig(): Konfig {
  const lingkungan = (process.env.HRIS_LINGKUNGAN ?? 'pengembangan') as Lingkungan;
  if (!['pengembangan', 'uji', 'asli'].includes(lingkungan)) {
    throw new Error(`HRIS_LINGKUNGAN tidak dikenal: ${lingkungan}`);
  }
  const cookieAman = process.env.HRIS_COOKIE_AMAN
    ? process.env.HRIS_COOKIE_AMAN === '1'
    : lingkungan !== 'pengembangan';
  if (lingkungan !== 'pengembangan' && !cookieAman) {
    throw new Error('HRIS_COOKIE_AMAN=0 hanya boleh di lingkungan pengembangan');
  }
  return {
    lingkungan,
    databaseUrl: wajib('DATABASE_URL'),
    port: Number(process.env.HRIS_PORT ?? 3000),
    host: process.env.HRIS_HOST ?? '127.0.0.1',
    dirBerkas: process.env.HRIS_DIR_BERKAS ?? join(process.cwd(), 'var', 'berkas'),
    cookieAman,
    dirStatis: process.env.HRIS_DIR_STATIS || null,
    asalSah: (process.env.HRIS_ASAL_SAH ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
