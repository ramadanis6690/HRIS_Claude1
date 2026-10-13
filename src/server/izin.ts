// Izin per peran & posisi struktural (design_final.md §6, SRS OTZ-*).
// Menu dan izin aksi memakai aturan yang sama (§10.3): menu yang tidak berhak
// tidak dirender, dan aksinya tetap ditolak di sini.
import type { KunciMenu, Peran, PeranAdmin, PeranStruktural } from '../bersama/aksi.js';
import { baca, bacaSatu } from './db.js';
import { ditolak } from './galat.js';

export type Posisi = 'Staff' | 'Manager' | 'Direksi' | 'Dirut' | 'Dewas';

export interface Pengguna {
  penggunaId: string;
  pegawaiId: string;
  nama: string;
  npp: string;
  email: string;
  posisi: Posisi | null;
  unitId: string | null;
  jabatan: string | null;
  unit: string | null;
  fotoFileId: string | null;
  peranStruktural: PeranStruktural;
  peranAdmin: PeranAdmin[];
  wajibGantiSandi: boolean;
  /** SHA-256 token sesi yang sedang dipakai. */
  hashToken: Buffer;
}

/** 'publik' hanya untuk login; 'masuk' = setiap pengguna yang login (cakupan datanya diperiksa di handler). */
export type Izin = 'publik' | 'masuk' | readonly Peran[];

export function peranStrukturalDari(posisi: Posisi | null): PeranStruktural {
  switch (posisi) {
    case 'Manager':
      return 'manager';
    case 'Direksi':
      return 'direksi';
    case 'Dirut':
      return 'dirut';
    default:
      return 'employee'; // Staff, Dewan Pengawas, atau jabatan belum diisi
  }
}

export function punya(u: Pengguna, peran: Peran): boolean {
  if (peran === 'employee') return true; // semua akun adalah Employee
  if (peran === 'manager' || peran === 'direksi' || peran === 'dirut') return u.peranStruktural === peran;
  return u.peranAdmin.includes(peran);
}

export function punyaSalahSatu(u: Pengguna, peran: readonly Peran[]): boolean {
  return peran.some((p) => punya(u, p));
}

export function periksa(u: Pengguna, izin: Izin): void {
  if (izin === 'publik' || izin === 'masuk') return;
  if (!punyaSalahSatu(u, izin)) throw ditolak();
}

// ---------------------------------------------------------------------------
// Cakupan data
// ---------------------------------------------------------------------------

/** Unit binaan Direksi/Dirut: unit yang direktur pembinanya orang ini. */
async function unitBinaan(u: Pengguna): Promise<string[]> {
  const rows = await baca<{ id: string }>('SELECT id FROM unit WHERE direktur_pembina_id = $1 AND aktif', [u.pegawaiId]);
  return rows.map((r) => r.id);
}

/**
 * Atasan boleh membaca profil dasar dan rekap presensi bawahannya (OTZ-03):
 * Manager → pegawai di unitnya; Direksi/Dirut → pegawai di unit binaannya;
 * Dirut → juga para Direktur.
 */
export async function atasanDari(u: Pengguna, pegawaiId: string): Promise<boolean> {
  if (u.peranStruktural === 'employee') return false;
  const p = await bacaSatu<{ unit_id: string | null; posisi: Posisi | null }>(
    `SELECT p.unit_id, j.posisi_struktural AS posisi FROM pegawai p LEFT JOIN jabatan j ON j.id = p.jabatan_id WHERE p.id = $1`,
    [pegawaiId],
  );
  if (!p) return false;
  if (u.peranStruktural === 'dirut' && p.posisi === 'Direksi') return true;
  if (p.unit_id === null) return false;
  if (u.peranStruktural === 'manager') return u.unitId !== null && p.unit_id === u.unitId && p.posisi === 'Staff';
  return (await unitBinaan(u)).includes(p.unit_id);
}

/** Unit yang presensinya boleh dilihat atasan ini. Kosong = tidak ada. */
export async function unitDiawasi(u: Pengguna): Promise<string[]> {
  if (u.peranStruktural === 'manager') return u.unitId ? [u.unitId] : [];
  if (u.peranStruktural === 'direksi' || u.peranStruktural === 'dirut') return unitBinaan(u);
  return [];
}

export const bisaKelolaPegawai = (u: Pengguna) => punyaSalahSatu(u, ['admin_hrd', 'super_admin']);

/** Profil penuh: diri sendiri, HRD, Super Admin, Admin Payroll (baca), Auditor (baca). */
export const bisaBacaProfilPenuh = (u: Pengguna, pegawaiId: string) =>
  u.pegawaiId === pegawaiId || punyaSalahSatu(u, ['admin_hrd', 'super_admin', 'admin_payroll', 'auditor']);

/** OTZ-04 (master gaji): pegawai ybs, HRD, Payroll, Finance, Super Admin. Atasan tidak. */
export const bisaBacaGaji = (u: Pengguna, pegawaiId: string) =>
  u.pegawaiId === pegawaiId || punyaSalahSatu(u, ['admin_hrd', 'admin_payroll', 'admin_finance', 'super_admin']);

/** OTZ-07: scan dokumen dan foto profil hanya pegawai ybs dan Admin HRD. */
export const bisaBacaDokumen = (u: Pengguna, pegawaiId: string) => u.pegawaiId === pegawaiId || punya(u, 'admin_hrd');

/** OTZ-07: foto presensi hanya pegawai ybs, Admin HRD, dan Manager unitnya. */
export async function bisaBacaFotoPresensi(u: Pengguna, pegawaiId: string): Promise<boolean> {
  if (u.pegawaiId === pegawaiId || punya(u, 'admin_hrd')) return true;
  if (u.peranStruktural !== 'manager') return false;
  return atasanDari(u, pegawaiId);
}

// ---------------------------------------------------------------------------
// Menu (design_final.md §10.3) — hanya modul yang sudah dibangun
// ---------------------------------------------------------------------------

export function menuUntuk(u: Pengguna): KunciMenu[] {
  const m: KunciMenu[] = ['beranda', 'presensi'];
  if (punyaSalahSatu(u, ['manager', 'direksi', 'dirut', 'admin_hrd', 'super_admin'])) m.push('rekap_kehadiran');
  m.push('profil', 'ubah_sandi');
  if (bisaKelolaPegawai(u)) m.push('data_pegawai');
  if (punyaSalahSatu(u, ['admin_hrd', 'admin_payroll', 'admin_finance', 'super_admin'])) m.push('gaji_pokok');
  if (punyaSalahSatu(u, ['auditor', 'super_admin'])) m.push('audit_log');
  if (bisaKelolaPegawai(u)) m.push('user_management', 'pengaturan');
  if (punya(u, 'super_admin')) m.push('status_sistem');
  return m;
}
