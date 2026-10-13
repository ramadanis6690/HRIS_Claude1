// Layar Audit Log untuk Auditor dan Super Admin (SRS AUD-03, AUD-05, OTZ-05).
import type { BarisAudit, HasilPeriksaRantai } from '../../bersama/aksi.js';
import { objek, tanggalWajib, teksOpsional, uuidOpsional, angkaOpsional } from '../../core/validasi.js';
import * as audit from '../audit.js';
import { baca } from '../db.js';
import { galat } from '../galat.js';

const PER_HALAMAN = 50;

/** AUD-05: filter per modul (tabel), rentang tanggal, pelaku, dan pegawai yang datanya berubah. */
export async function bacaLog(data: unknown): Promise<{ baris: BarisAudit[]; total: number; perHalaman: number }> {
  const d = objek(data);
  const mulai = tanggalWajib(d, 'mulai');
  const akhir = tanggalWajib(d, 'akhir');
  if (mulai > akhir) throw galat('MASUKAN', 'Tanggal mulai setelah tanggal akhir.', 'mulai');
  const tabel = teksOpsional(d, 'tabel', { maks: 50, pola: /^[a-z_]+$/ });
  const pelaku = uuidOpsional(d, 'pelakuId');
  const pegawai = uuidOpsional(d, 'pegawaiId');
  const halaman = angkaOpsional(d, 'halaman', { bulat: true, min: 1, maks: 100000 }) ?? 1;

  const syarat = `
    (a.waktu AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1 AND $2
    AND ($3::text IS NULL OR a.tabel = $3)
    AND ($4::uuid IS NULL OR a.pelaku_id = $4)
    AND ($5::uuid IS NULL OR a.baris_id = $5 OR a.sesudah->>'pegawai_id' = $5::text OR a.sebelum->>'pegawai_id' = $5::text)`;
  const params = [mulai, akhir, tabel, pelaku, pegawai];
  const [rows, total] = await Promise.all([
    baca<{
      no: number; waktu: Date; pelaku: string | null; pelaku_npp: string | null; aksi: string; tabel: string; baris_id: string | null;
      sebelum: Record<string, unknown> | null; sesudah: Record<string, unknown> | null; alasan: string | null;
    }>(
      `SELECT a.no, a.waktu, p.nama_lengkap AS pelaku, p.npp AS pelaku_npp, a.aksi, a.tabel, a.baris_id, a.sebelum, a.sesudah, a.alasan
         FROM audit_log a LEFT JOIN pegawai p ON p.id = a.pelaku_id
        WHERE ${syarat}
        ORDER BY a.no DESC LIMIT ${PER_HALAMAN} OFFSET ${(halaman - 1) * PER_HALAMAN}`,
      params,
    ),
    baca<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log a WHERE ${syarat}`, params),
  ]);
  return {
    baris: rows.map((r) => ({
      no: r.no, waktu: r.waktu.toISOString(), pelaku: r.pelaku, pelakuNpp: r.pelaku_npp, aksi: r.aksi, tabel: r.tabel,
      barisId: r.baris_id, sebelum: r.sebelum, sesudah: r.sesudah, alasan: r.alasan,
    })),
    total: total[0]?.n ?? 0,
    perHalaman: PER_HALAMAN,
  };
}

export async function periksa(): Promise<HasilPeriksaRantai> {
  return audit.periksaRantai();
}
