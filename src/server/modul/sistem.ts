// Status sistem untuk Super Admin (SRS DSH-15): pekerjaan terjadwal, ukuran
// basis data dan folder berkas, sisa ruang cakram, versi.
import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { StatusSistem } from '../../bersama/aksi.js';
import { bacaSatu } from '../db.js';
import { statusPekerjaan } from './beranda.js';
import { daftarKonflik } from './pengguna.js';

async function ukuranFolder(dir: string): Promise<number> {
  let total = 0;
  const isi = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of isi) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await ukuranFolder(p);
    else if (e.isFile()) total += (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

export async function status(lingkungan: string, dirBerkas: string): Promise<StatusSistem> {
  const [pg, skema, db, cakram] = await Promise.all([
    bacaSatu<{ v: string }>("SELECT current_setting('server_version') AS v"),
    bacaSatu<{ v: number }>('SELECT max(versi)::int AS v FROM skema_versi'),
    bacaSatu<{ n: number }>('SELECT pg_database_size(current_database())::bigint AS n'),
    statfs(dirBerkas).catch(() => null),
  ]);
  return {
    lingkungan,
    versiNode: process.version,
    versiPostgres: pg?.v ?? '',
    versiSkema: skema?.v ?? 0,
    ukuranDbByte: db?.n ?? 0,
    ukuranBerkasByte: await ukuranFolder(dirBerkas),
    cakramSisaByte: cakram ? cakram.bavail * cakram.bsize : null,
    cakramTotalByte: cakram ? cakram.blocks * cakram.bsize : null,
    pekerjaan: await statusPekerjaan(),
    konflikPeran: await daftarKonflik(),
  };
}
