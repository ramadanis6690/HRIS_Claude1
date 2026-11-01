// Validasi masukan di batas sistem. Server tidak pernah mempercayai bentuk data
// dari browser: setiap aksi membaca masukannya lewat fungsi di sini.
// Galat menyebut kolomnya, supaya layar bisa menaruh pesan di bawah kolom yang salah (UI-08).
import { tanggalSah, type Tanggal } from './tanggal.js';

export class GalatMasukan extends Error {
  constructor(
    readonly kolom: string,
    pesan: string,
  ) {
    super(pesan);
    this.name = 'GalatMasukan';
  }
}

type Data = Record<string, unknown>;

export function objek(v: unknown, kolom = 'data'): Data {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new GalatMasukan(kolom, 'Data tidak sah');
  return v as Data;
}

interface OpsiTeks {
  maks?: number;
  pola?: RegExp;
  pesanPola?: string;
}

export function teksWajib(d: Data, kolom: string, opsi: OpsiTeks = {}): string {
  const v = teksOpsional(d, kolom, opsi);
  if (v === null) throw new GalatMasukan(kolom, 'Wajib diisi');
  return v;
}

export function teksOpsional(d: Data, kolom: string, opsi: OpsiTeks = {}): string | null {
  const v = d[kolom];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new GalatMasukan(kolom, 'Harus berupa teks');
  const t = v.trim();
  if (t === '') return null;
  if (t.length > (opsi.maks ?? 500)) throw new GalatMasukan(kolom, `Maksimal ${opsi.maks ?? 500} karakter`);
  if (opsi.pola && !opsi.pola.test(t)) throw new GalatMasukan(kolom, opsi.pesanPola ?? 'Format tidak sah');
  return t;
}

export function tanggalOpsional(d: Data, kolom: string): Tanggal | null {
  const v = teksOpsional(d, kolom, { maks: 10 });
  if (v === null) return null;
  if (!tanggalSah(v)) throw new GalatMasukan(kolom, 'Tanggal tidak sah');
  return v;
}

export function tanggalWajib(d: Data, kolom: string): Tanggal {
  const v = tanggalOpsional(d, kolom);
  if (v === null) throw new GalatMasukan(kolom, 'Wajib diisi');
  return v;
}

export function jamWajib(d: Data, kolom: string): string {
  return teksWajib(d, kolom, { maks: 5, pola: /^([01]\d|2[0-3]):[0-5]\d$/, pesanPola: 'Format jam HH:MM' });
}

export function boolWajib(d: Data, kolom: string): boolean {
  const v = d[kolom];
  if (typeof v !== 'boolean') throw new GalatMasukan(kolom, 'Harus ya atau tidak');
  return v;
}

export function boolOpsional(d: Data, kolom: string, bawaan: boolean): boolean {
  return d[kolom] === undefined ? bawaan : boolWajib(d, kolom);
}

interface OpsiAngka {
  min?: number;
  maks?: number;
  bulat?: boolean;
}

export function angkaOpsional(d: Data, kolom: string, opsi: OpsiAngka = {}): number | null {
  const v = d[kolom];
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new GalatMasukan(kolom, 'Harus berupa angka');
  if (opsi.bulat && !Number.isInteger(n)) throw new GalatMasukan(kolom, 'Harus bilangan bulat');
  if (opsi.min !== undefined && n < opsi.min) throw new GalatMasukan(kolom, `Minimal ${opsi.min}`);
  if (opsi.maks !== undefined && n > opsi.maks) throw new GalatMasukan(kolom, `Maksimal ${opsi.maks}`);
  return n;
}

export function angkaWajib(d: Data, kolom: string, opsi: OpsiAngka = {}): number {
  const n = angkaOpsional(d, kolom, opsi);
  if (n === null) throw new GalatMasukan(kolom, 'Wajib diisi');
  return n;
}

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidSah(v: unknown): v is string {
  return typeof v === 'string' && POLA_UUID.test(v);
}

export function uuidWajib(d: Data, kolom: string): string {
  const v = d[kolom];
  if (!uuidSah(v)) throw new GalatMasukan(kolom, 'Pengenal tidak sah');
  return v.toLowerCase();
}

export function uuidOpsional(d: Data, kolom: string): string | null {
  const v = d[kolom];
  if (v === undefined || v === null || v === '') return null;
  return uuidWajib(d, kolom);
}

export function pilihanWajib<T extends string>(d: Data, kolom: string, opsi: readonly T[]): T {
  const v = d[kolom];
  if (typeof v !== 'string' || !(opsi as readonly string[]).includes(v)) {
    throw new GalatMasukan(kolom, 'Pilihan tidak sah');
  }
  return v as T;
}

export function pilihanOpsional<T extends string>(d: Data, kolom: string, opsi: readonly T[]): T | null {
  const v = d[kolom];
  if (v === undefined || v === null || v === '') return null;
  return pilihanWajib(d, kolom, opsi);
}

export function daftarUuid(d: Data, kolom: string, maks = 200): string[] {
  const v = d[kolom];
  if (!Array.isArray(v) || v.length === 0 || v.length > maks || !v.every(uuidSah)) {
    throw new GalatMasukan(kolom, 'Daftar pengenal tidak sah');
  }
  return [...new Set(v.map((x: string) => x.toLowerCase()))];
}

// ---------------------------------------------------------------------------
// Aturan bidang (SRS EMP-02, AUTH-04)
// ---------------------------------------------------------------------------

export const POLA_NIK = /^\d{16}$/;
export const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const POLA_NPP = /^[A-Za-z0-9.\-/]{1,30}$/;
export const POLA_NO_HP = /^\+?[0-9 -]{8,20}$/;

/** AUTH-04: minimal 8 karakter, berisi huruf dan angka. */
export function periksaSandi(sandi: string): string | null {
  if (sandi.length < 8) return 'Kata sandi minimal 8 karakter';
  if (sandi.length > 200) return 'Kata sandi terlalu panjang';
  if (!/[A-Za-z]/.test(sandi) || !/\d/.test(sandi)) return 'Kata sandi harus mengandung huruf dan angka';
  return null;
}

// ---------------------------------------------------------------------------
// Tabel Grade (SRS EMP-08)
// ---------------------------------------------------------------------------

export interface BarisGrade {
  grade: string;
  subGrade: string;
  masaKerjaMinThn: number | null;
  masaKerjaMaxThn: number | null;
  gapokMin: number | null;
  gapokMax: number | null;
}

export interface HasilPeriksaGapok {
  usulanSubGrade: string | null;
  peringatan: string | null;
}

/**
 * Usulan Sub Grade dari masa kerja, dan peringatan bila gapok di luar rentang.
 * Peringatan tidak memblokir penyimpanan (EMP-08).
 */
export function periksaGapok(
  baris: readonly BarisGrade[],
  grade: string | null,
  masaKerjaTahun: number,
  gapok: number,
  subGradeSekarang: string | null,
): HasilPeriksaGapok {
  if (!grade) return { usulanSubGrade: null, peringatan: 'Grade pegawai belum diisi; rentang gaji tidak bisa diperiksa.' };
  const segrade = baris.filter((b) => b.grade === grade);
  if (segrade.length === 0) {
    return { usulanSubGrade: null, peringatan: `Tabel Grade untuk grade ${grade} belum diisi; rentang gaji tidak bisa diperiksa.` };
  }
  const usulan =
    segrade.find(
      (b) =>
        (b.masaKerjaMinThn === null || masaKerjaTahun >= b.masaKerjaMinThn) &&
        (b.masaKerjaMaxThn === null || masaKerjaTahun < b.masaKerjaMaxThn),
    ) ?? null;
  const acuan = segrade.find((b) => b.subGrade === (subGradeSekarang ?? usulan?.subGrade)) ?? usulan;
  let peringatan: string | null = null;
  if (acuan && acuan.gapokMin !== null && gapok < acuan.gapokMin) {
    peringatan = `Gaji pokok di bawah minimum Grade ${acuan.grade}/${acuan.subGrade}.`;
  } else if (acuan && acuan.gapokMax !== null && gapok > acuan.gapokMax) {
    peringatan = `Gaji pokok di atas maksimum Grade ${acuan.grade}/${acuan.subGrade}.`;
  }
  return { usulanSubGrade: usulan?.subGrade ?? null, peringatan };
}
