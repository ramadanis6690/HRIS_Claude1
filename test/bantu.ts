// Bantuan tes integrasi: basis data uji yang dikosongkan dan dimigrasi ulang per berkas tes.
// Butuh HRIS_TES_DATABASE_URL (role hris_app) dan HRIS_TES_DATABASE_URL_PEMILIK (pemilik).
// Bila keduanya tidak ada, tes integrasi dilewati dengan pesan yang jelas.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Aksi, NamaAksi, Respons } from '../src/bersama/aksi.js';
import { jalankan, type Konteks } from '../src/server/api.js';
import * as berkas from '../src/server/berkas.js';
import { sambung } from '../src/server/db.js';
import { muatBerkasEnv } from '../src/server/konfig.js';
import { isiContoh, SANDI_CONTOH } from '../scripts/data-contoh.js';

muatBerkasEnv();
export const URL_TES = process.env.HRIS_TES_DATABASE_URL ?? '';
export const URL_TES_PEMILIK = process.env.HRIS_TES_DATABASE_URL_PEMILIK ?? '';
export const adaDbTes = URL_TES !== '' && URL_TES_PEMILIK !== '';
export const dirBerkasTes = mkdtempSync(join(tmpdir(), 'hris-tes-'));
export const konteks: Konteks = { perangkat: 'vitest', lingkungan: 'pengembangan', dirBerkas: dirBerkasTes };

/** Kosongkan skema, migrasi ulang, isi data contoh. */
export async function siapkanDb(): Promise<void> {
  execFileSync('psql', [URL_TES_PEMILIK, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'], { stdio: 'pipe' });
  execFileSync('npx', ['tsx', 'scripts/migrasi.ts'], {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL_PEMILIK: URL_TES_PEMILIK, HRIS_ENV_FILE: '/tidak-ada' },
  });
  sambung(URL_TES);
  berkas.aturAkar(dirBerkasTes);
  await isiContoh();
}

export function psqlPemilik(sql: string): string {
  return execFileSync('psql', [URL_TES_PEMILIK, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
}

export async function masuk(username: string, sandi = SANDI_CONTOH): Promise<string> {
  const h = await jalankan({ aksi: 'auth.login', data: { username, sandi, ingat: false }, token: null }, konteks);
  if (!h.respons.ok || !h.cookie || !('token' in h.cookie)) throw new Error(`Login ${username} gagal: ${JSON.stringify(h.respons)}`);
  return h.cookie.token;
}

export async function panggil<A extends NamaAksi>(token: string | null, aksi: A, data: Aksi[A]['kirim'] | Record<string, unknown>): Promise<Respons<Aksi[A]['terima']>> {
  const h = await jalankan({ aksi, data, token }, konteks);
  return h.respons as Respons<Aksi[A]['terima']>;
}

export async function harus<A extends NamaAksi>(token: string | null, aksi: A, data: Aksi[A]['kirim'] | Record<string, unknown>): Promise<Aksi[A]['terima']> {
  const r = await panggil(token, aksi, data);
  if (!r.ok) throw new Error(`${aksi} gagal: ${r.galat.kode} ${r.galat.pesan}`);
  return r.data;
}

/** JPEG terkecil yang lolos pemeriksaan jenis berkas di server. */
export const JPEG_KECIL = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]).toString('base64');
