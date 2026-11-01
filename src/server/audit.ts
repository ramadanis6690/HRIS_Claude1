// Audit Log berantai hash (design_final.md §7.2, SRS AUD-01 – AUD-06).
//
//   hash_n = SHA-256( hash_(n-1) | no | waktu | pelaku_id | aksi | tabel | baris_id | sebelum | sesudah | alasan )
//
// Diserialisasi sebagai larik JSON dengan kunci objek terurut, supaya tidak ada
// dua isi berbeda yang menghasilkan teks sama, dan isi yang dibaca balik dari
// jsonb menghasilkan hash yang sama. Hash terakhir disimpan di `audit_rantai`
// dalam transaksi yang sama dengan datanya.
import { createHash } from 'node:crypto';
import { baca, bacaSatu, type Tx } from './db.js';

export type AksiAudit = 'tambah' | 'ubah' | 'nonaktifkan' | string;

export interface EntriAudit {
  pelaku: string | null;
  aksi: AksiAudit;
  tabel: string;
  barisId: string | null;
  sebelum: Record<string, unknown> | null;
  sesudah: Record<string, unknown> | null;
  alasan?: string | null;
}

const KOLOM_RAHASIA = new Set(['hash_sandi', 'hash_token', 'sandi', 'token']);

/** AUD-06: kata sandi, token, dan hash-nya tidak pernah masuk ke nilai sebelum/sesudah. */
export function bersihkan(baris: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!baris) return null;
  const hasil: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(baris)) {
    if (KOLOM_RAHASIA.has(k)) continue;
    hasil[k] = keJson(v);
  }
  return hasil;
}

function keJson(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (Array.isArray(v)) return v.map(keJson);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, keJson(x)]));
  }
  return v;
}

/** JSON dengan kunci objek terurut di semua tingkat. */
export function kanonik(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(kanonik).join(',') + ']';
  const kunci = Object.keys(v as Record<string, unknown>).sort();
  return '{' + kunci.map((k) => JSON.stringify(k) + ':' + kanonik((v as Record<string, unknown>)[k])).join(',') + '}';
}

interface IsiHash {
  hashSebelumnya: Buffer | null;
  no: number;
  waktu: Date;
  pelaku: string | null;
  aksi: string;
  tabel: string;
  barisId: string | null;
  sebelum: unknown;
  sesudah: unknown;
  alasan: string | null;
}

export function hitungHash(i: IsiHash): Buffer {
  const teks =
    '[' +
    [
      JSON.stringify(i.hashSebelumnya ? i.hashSebelumnya.toString('hex') : null),
      JSON.stringify(i.no),
      JSON.stringify(i.waktu.toISOString()),
      JSON.stringify(i.pelaku),
      JSON.stringify(i.aksi),
      JSON.stringify(i.tabel),
      JSON.stringify(i.barisId),
      kanonik(i.sebelum),
      kanonik(i.sesudah),
      JSON.stringify(i.alasan),
    ].join(',') +
    ']';
  return createHash('sha256').update(teks, 'utf8').digest();
}

/** Ditulis dalam transaksi pemanggil. Baris audit_rantai dikunci sampai transaksi selesai. */
export async function catat(tx: Tx, e: EntriAudit): Promise<void> {
  const [rantai] = await tx.query<{ no_terakhir: number; hash_terakhir: Buffer | null }>(
    'SELECT no_terakhir, hash_terakhir FROM audit_rantai WHERE satu_baris FOR UPDATE',
  );
  if (!rantai) throw new Error('Tabel audit_rantai kosong');
  const isi: IsiHash = {
    hashSebelumnya: rantai.hash_terakhir,
    no: rantai.no_terakhir + 1,
    waktu: new Date(),
    pelaku: e.pelaku,
    aksi: e.aksi,
    tabel: e.tabel,
    barisId: e.barisId,
    sebelum: bersihkan(e.sebelum),
    sesudah: bersihkan(e.sesudah),
    alasan: e.alasan ?? null,
  };
  const hash = hitungHash(isi);
  await tx.query(
    `INSERT INTO audit_log (no, waktu, pelaku_id, aksi, tabel, baris_id, sebelum, sesudah, alasan, hash_sebelumnya, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      isi.no, isi.waktu, isi.pelaku, isi.aksi, isi.tabel, isi.barisId,
      isi.sebelum === null ? null : JSON.stringify(isi.sebelum),
      isi.sesudah === null ? null : JSON.stringify(isi.sesudah),
      isi.alasan, isi.hashSebelumnya, hash,
    ],
  );
  await tx.query(
    'UPDATE audit_rantai SET no_terakhir = $1, hash_terakhir = $2, diperbarui = now() WHERE satu_baris',
    [isi.no, hash],
  );
}

export interface HasilPeriksaRantai {
  utuh: boolean;
  jumlahBaris: number;
  /** Nomor baris pertama yang tidak cocok, bila ada. */
  barisRusak: number | null;
  pesan: string;
}

/** AUD-03: hitung ulang dari baris 1 dan laporkan baris pertama yang tidak cocok. */
export async function periksaRantai(): Promise<HasilPeriksaRantai> {
  const rows = await baca<{
    no: number; waktu: Date; pelaku_id: string | null; aksi: string; tabel: string; baris_id: string | null;
    sebelum: unknown; sesudah: unknown; alasan: string | null; hash_sebelumnya: Buffer | null; hash: Buffer;
  }>('SELECT no, waktu, pelaku_id, aksi, tabel, baris_id, sebelum, sesudah, alasan, hash_sebelumnya, hash FROM audit_log ORDER BY no');

  let sebelumnya: Buffer | null = null;
  let noHarapan = 1;
  for (const r of rows) {
    if (r.no !== noHarapan) {
      return { utuh: false, jumlahBaris: rows.length, barisRusak: noHarapan, pesan: `Baris ${noHarapan} hilang dari Audit Log.` };
    }
    const cocokSebelumnya =
      (sebelumnya === null && r.hash_sebelumnya === null) ||
      (sebelumnya !== null && r.hash_sebelumnya !== null && sebelumnya.equals(r.hash_sebelumnya));
    const hash = hitungHash({
      hashSebelumnya: sebelumnya, no: r.no, waktu: r.waktu, pelaku: r.pelaku_id, aksi: r.aksi, tabel: r.tabel,
      barisId: r.baris_id, sebelum: r.sebelum, sesudah: r.sesudah, alasan: r.alasan,
    });
    if (!cocokSebelumnya || !hash.equals(r.hash)) {
      return { utuh: false, jumlahBaris: rows.length, barisRusak: r.no, pesan: `Baris ${r.no} tidak cocok dengan rantai hash.` };
    }
    sebelumnya = r.hash;
    noHarapan++;
  }

  const rantai = await bacaSatu<{ no_terakhir: number; hash_terakhir: Buffer | null }>(
    'SELECT no_terakhir, hash_terakhir FROM audit_rantai WHERE satu_baris',
  );
  const akhirCocok =
    rantai !== null &&
    rantai.no_terakhir === rows.length &&
    ((rantai.hash_terakhir === null && sebelumnya === null) ||
      (rantai.hash_terakhir !== null && sebelumnya !== null && rantai.hash_terakhir.equals(sebelumnya)));
  if (!akhirCocok) {
    return {
      utuh: false, jumlahBaris: rows.length, barisRusak: rows.length,
      pesan: 'Hash terakhir di audit_rantai berbeda dari baris terakhir Audit Log: ada baris yang ditambah atau dihapus di luar aplikasi.',
    };
  }
  return { utuh: true, jumlahBaris: rows.length, barisRusak: null, pesan: `Rantai utuh: ${rows.length} baris diperiksa.` };
}
