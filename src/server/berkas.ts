// Berkas di /var/lib/hris, katalognya di tabel `berkas` (design_final.md §4.8).
// Berkas tidak pernah dilayani lewat tautan: server memeriksa izin, membaca
// dari cakram, lalu mengalirkan isinya.
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { dirname, join, normalize, sep } from 'node:path';
import { bacaSatu, type Tx } from './db.js';
import { galat } from './galat.js';
import { tulis } from './repo.js';

export type Golongan = 'presensi' | 'lampiran' | 'dokumen' | 'foto_profil' | 'surat' | 'ekspor' | 'bukti_bayar' | 'sertifikat';

const FOLDER: Record<Golongan, string> = {
  presensi: 'presensi',
  lampiran: 'lampiran',
  dokumen: 'dokumen',
  foto_profil: 'foto-profil',
  surat: 'surat',
  ekspor: 'ekspor',
  bukti_bayar: 'bukti-bayar',
  sertifikat: 'sertifikat',
};

/** Batas ukuran per golongan. Foto presensi sudah dikompres di HP (ATT-06). */
const BATAS_BYTE: Partial<Record<Golongan, number>> = {
  presensi: 1024 * 1024,
  foto_profil: 2 * 1024 * 1024,
};
const BATAS_BAWAAN = 7 * 1024 * 1024; // Nginx membatasi permintaan 10 MB; base64 menambah ±33%

const MEDIA: { media: string; ext: string; cocok: (b: Buffer) => boolean }[] = [
  { media: 'image/jpeg', ext: 'jpg', cocok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { media: 'image/png', ext: 'png', cocok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { media: 'application/pdf', ext: 'pdf', cocok: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
];

let akar = '';
export function aturAkar(dir: string): void {
  akar = dir;
}

/** Membaca isi base64 (boleh berupa data URL) dan menentukan jenisnya dari isi, bukan dari nama. */
export function bacaBase64(isi: unknown, kolom: string, golongan: Golongan, diizinkan: readonly string[]): { buf: Buffer; media: string; ext: string } {
  if (typeof isi !== 'string' || isi.length === 0) throw galat('MASUKAN', 'Berkas wajib dilampirkan.', kolom);
  const mentah = isi.includes(',') && isi.startsWith('data:') ? isi.slice(isi.indexOf(',') + 1) : isi;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(mentah)) throw galat('MASUKAN', 'Isi berkas tidak sah.', kolom);
  const buf = Buffer.from(mentah, 'base64');
  const batas = BATAS_BYTE[golongan] ?? BATAS_BAWAAN;
  if (buf.length === 0) throw galat('MASUKAN', 'Berkas kosong.', kolom);
  if (buf.length > batas) throw galat('MASUKAN', `Berkas terlalu besar (maksimal ${Math.round(batas / 1024 / 1024)} MB).`, kolom);
  const jenis = MEDIA.find((m) => m.cocok(buf));
  if (!jenis || !diizinkan.includes(jenis.media)) {
    throw galat('MASUKAN', `Jenis berkas tidak diterima. Gunakan ${diizinkan.map((d) => d.split('/')[1]!.toUpperCase()).join(' atau ')}.`, kolom);
  }
  return { buf, media: jenis.media, ext: jenis.ext };
}

function jalurPenuh(relatif: string): string {
  const penuh = normalize(join(akar, relatif));
  if (!penuh.startsWith(normalize(akar) + sep)) throw new Error('Jalur berkas keluar dari folder berkas');
  return penuh;
}

export interface BerkasTersimpan {
  id: string;
  jalur: string;
}

/**
 * Menulis isi ke cakram lalu mencatat barisnya dalam transaksi pemanggil.
 * Pemanggil wajib memanggil `hapusBilaGagal` bila transaksinya batal, supaya
 * tidak ada berkas yatim (design §8.1).
 */
export async function simpan(
  tx: Tx,
  p: { buf: Buffer; media: string; ext: string; golongan: Golongan; namaAsli: string; pelaku: string | null; sekarang: Date },
): Promise<BerkasTersimpan> {
  const bulan = p.sekarang.toISOString().slice(0, 7);
  const relatif = `${FOLDER[p.golongan]}/${bulan}/${randomUUID()}.${p.ext}`;
  const penuh = jalurPenuh(relatif);
  await mkdir(dirname(penuh), { recursive: true, mode: 0o750 });
  await writeFile(penuh, p.buf, { mode: 0o640, flag: 'wx' });
  const baris = await tulis<{ id: string }>(
    'berkas', 'tambah',
    {
      jalur_relatif: relatif,
      nama_asli: p.namaAsli.slice(0, 200),
      media_type: p.media,
      ukuran_byte: p.buf.length,
      sha256: createHash('sha256').update(p.buf).digest(),
      golongan: p.golongan,
    },
    { pelaku: p.pelaku }, tx,
  );
  return { id: baris.id, jalur: penuh };
}

export async function hapusBilaGagal(jalur: string[]): Promise<void> {
  await Promise.all(jalur.map((j) => unlink(j).catch(() => undefined)));
}

/** Menghapus isi berkas di cakram (retensi foto presensi, ekspor). Baris katalognya tetap. */
export async function hapusIsi(jalurRelatif: string): Promise<void> {
  await unlink(jalurPenuh(jalurRelatif)).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== 'ENOENT') throw e;
  });
}

export interface InfoBerkas {
  id: string;
  jalur_relatif: string;
  nama_asli: string;
  media_type: string;
  ukuran_byte: number;
  golongan: Golongan;
  dihapus_pada: Date | null;
}

export async function info(id: string): Promise<InfoBerkas | null> {
  return bacaSatu<InfoBerkas>(
    'SELECT id, jalur_relatif, nama_asli, media_type, ukuran_byte, golongan, dihapus_pada FROM berkas WHERE id = $1',
    [id],
  );
}

/** Mengalirkan isi berkas setelah izinnya diperiksa pemanggil. */
export function alirkan(res: ServerResponse, b: InfoBerkas): void {
  const s = createReadStream(jalurPenuh(b.jalur_relatif));
  s.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('Berkas tidak ditemukan di cakram.');
  });
  s.once('open', () => {
    res.writeHead(200, {
      'Content-Type': b.media_type,
      'Content-Length': String(b.ukuran_byte),
      'Content-Disposition': `inline; filename="${encodeURIComponent(b.nama_asli)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    s.pipe(res);
  });
}
