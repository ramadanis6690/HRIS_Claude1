// Satu pintu masuk (design_final.md §5.3): token → izin → handler.
// Setiap aksi WAJIB menyatakan izinnya; aksi tanpa izin = galat saat startup.
// Tipe tabel ini memaksa ada handler untuk setiap kunci di `Aksi`, dengan tipe
// kembalian yang cocok.
import type { Aksi, NamaAksi, Respons } from '../bersama/aksi.js';
import { objek, teksWajib, boolOpsional } from '../core/validasi.js';
import * as auth from './auth.js';
import { bacaSatu } from './db.js';
import { galat, keGalat } from './galat.js';
import { periksa, type Izin, type Pengguna } from './izin.js';
import { log } from './log.js';
import * as beranda from './modul/beranda.js';
import * as impor from './modul/impor.js';
import * as logAudit from './modul/log-audit.js';
import * as pegawai from './modul/pegawai.js';
import * as pengaturan from './modul/pengaturan.js';
import * as pengguna from './modul/pengguna.js';
import * as presensi from './modul/presensi.js';
import * as sistem from './modul/sistem.js';

export interface Konteks {
  perangkat: string | null;
  lingkungan: string;
  dirBerkas: string;
}

type Handler<K extends NamaAksi> = (u: Pengguna, data: unknown, k: Konteks) => Promise<Aksi[K]['terima']>;

interface EntriAksi<K extends NamaAksi> {
  izin: Izin;
  /** Aksi yang mengubah data. Auditor tidak pernah lolos aksi tulis non-pribadi (OTZ-06). */
  tulis: boolean;
  fn: Handler<K>;
}

const HRD: Izin = ['admin_hrd', 'super_admin'];
const ADMIN_BACA_PEGAWAI: Izin = ['admin_hrd', 'super_admin', 'admin_payroll', 'admin_finance', 'auditor'];
const ADMIN_GAJI: Izin = ['admin_hrd', 'admin_payroll', 'admin_finance', 'super_admin'];
const AUDITOR: Izin = ['auditor', 'super_admin'];
const ATASAN_ATAU_HRD: Izin = ['manager', 'direksi', 'dirut', 'admin_hrd', 'super_admin'];

export const AKSI: { [K in NamaAksi]: EntriAksi<K> } = {
  // auth.login ditangani sebelum token diperiksa (lihat jalankan()).
  'auth.login': { izin: 'publik', tulis: false, fn: async () => { throw galat('AKSI_TIDAK_DIKENAL', 'Login lewat jalur khusus.'); } },
  'auth.keluar': { izin: 'masuk', tulis: false, fn: async (u) => { await auth.keluar(u); return null; } },
  'auth.saya': { izin: 'masuk', tulis: false, fn: async (u) => auth.infoSesi(u) },
  'auth.gantiSandi': {
    izin: 'masuk', tulis: false,
    fn: async (u, d) => {
      const o = objek(d);
      await auth.gantiSandi(u, teksWajib(o, 'sandiLama', { maks: 200 }), teksWajib(o, 'sandiBaru', { maks: 200 }));
      return null;
    },
  },

  'beranda.ringkasan': { izin: 'masuk', tulis: false, fn: (u) => beranda.ringkasan(u) },

  'presensi.hariIni': { izin: 'masuk', tulis: false, fn: (u) => presensi.hariIni(u) },
  'presensi.checkIn': { izin: 'masuk', tulis: false, fn: (u, d) => presensi.checkIn(u, d) },
  'presensi.checkOut': { izin: 'masuk', tulis: false, fn: (u, d) => presensi.checkOut(u, d) },
  'presensi.riwayatSaya': { izin: 'masuk', tulis: false, fn: (u, d) => presensi.riwayatSaya(u, d) },
  'presensi.daftar': { izin: ATASAN_ATAU_HRD, tulis: false, fn: (u, d) => presensi.daftar(u, d) },
  'presensi.koreksi': { izin: HRD, tulis: true, fn: (u, d) => presensi.koreksi(u, d) },
  'presensi.percobaan': { izin: HRD, tulis: false, fn: (u, d) => presensi.percobaan(u, d) },

  'pegawai.daftar': { izin: ADMIN_BACA_PEGAWAI, tulis: false, fn: (u, d) => pegawai.daftar(u, d) },
  'pegawai.detail': { izin: 'masuk', tulis: false, fn: (u, d) => pegawai.detail(u, d) },
  'pegawai.saya': { izin: 'masuk', tulis: false, fn: (u) => pegawai.saya(u) },
  'pegawai.simpan': { izin: HRD, tulis: true, fn: (u, d) => pegawai.simpan(u, d) },
  'pegawai.ubahStatus': { izin: HRD, tulis: true, fn: (u, d) => pegawai.ubahStatus(u, d) },
  'pegawai.simpanRiwayat': { izin: HRD, tulis: true, fn: (u, d) => pegawai.simpanRiwayat(u, d) },
  'pegawai.nonaktifkanRiwayat': { izin: HRD, tulis: true, fn: (u, d) => pegawai.nonaktifkanRiwayat(u, d) },
  // OTZ-07: dokumen dan foto profil hanya pegawai ybs dan Admin HRD.
  'pegawai.unggahDokumen': { izin: ['admin_hrd'], tulis: true, fn: (u, d) => pegawai.unggahDokumen(u, d) },
  'pegawai.nonaktifkanDokumen': { izin: ['admin_hrd'], tulis: true, fn: (u, d) => pegawai.nonaktifkanDokumen(u, d) },
  'pegawai.unggahFoto': { izin: ['admin_hrd'], tulis: true, fn: (u, d) => pegawai.unggahFoto(u, d) },
  'pegawai.imporPratinjau': { izin: HRD, tulis: false, fn: (_u, d) => impor.pratinjau(d) },
  'pegawai.imporSimpan': { izin: HRD, tulis: true, fn: (u, d) => impor.simpan(u, d) },

  'gaji.daftar': { izin: 'masuk', tulis: false, fn: (u, d) => pegawai.daftarGaji(u, d) },
  'gaji.ringkasan': { izin: ADMIN_GAJI, tulis: false, fn: () => pegawai.ringkasanGaji() },
  'gaji.tambah': { izin: HRD, tulis: true, fn: (u, d) => pegawai.tambahGaji(u, d) },

  'pengguna.daftar': { izin: HRD, tulis: false, fn: () => pengguna.daftar() },
  'pengguna.buatAkun': { izin: HRD, tulis: true, fn: (u, d) => pengguna.buatAkun(u, d) },
  'pengguna.resetSandi': { izin: HRD, tulis: true, fn: (u, d) => pengguna.resetSandi(u, d) },
  'pengguna.aturAktif': { izin: HRD, tulis: true, fn: (u, d) => pengguna.aturAktif(u, d) },
  'pengguna.aturPeran': { izin: ['super_admin'], tulis: true, fn: (u, d) => pengguna.aturPeran(u, d) },

  'pengaturan.master': { izin: ADMIN_BACA_PEGAWAI, tulis: false, fn: () => pengaturan.master() },
  'pengaturan.simpanUnit': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.simpanUnit(u, d) },
  'pengaturan.simpanJabatan': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.simpanJabatan(u, d) },
  'pengaturan.simpanTitikKantor': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.simpanTitikKantor(u, d) },
  'pengaturan.simpanHariLibur': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.simpanHariLibur(u, d) },
  'pengaturan.nonaktifkanHariLibur': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.nonaktifkanHariLibur(u, d) },
  'pengaturan.tambahJamKerja': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.tambahJamKerja(u, d) },
  'pengaturan.simpanNilai': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.simpanNilai(u, d) },
  'pengaturan.simpanGrade': { izin: HRD, tulis: true, fn: (u, d) => pengaturan.simpanGrade(u, d) },

  // OTZ-05: Admin HRD ditolak membaca Audit Log.
  'audit.baca': { izin: AUDITOR, tulis: false, fn: (_u, d) => logAudit.bacaLog(d) },
  'audit.periksaRantai': { izin: AUDITOR, tulis: false, fn: () => logAudit.periksa() },

  'sistem.status': { izin: ['super_admin'], tulis: false, fn: (_u, _d, k) => sistem.status(k.lingkungan, k.dirBerkas) },
};

/** Galat saat startup bila ada aksi tanpa izin (§5.3). */
export function periksaTabelAksi(): void {
  for (const [nama, a] of Object.entries(AKSI) as [string, EntriAksi<NamaAksi>][]) {
    if (!a.izin || (Array.isArray(a.izin) && a.izin.length === 0)) throw new Error(`Aksi ${nama} tidak menyatakan izinnya`);
    if (a.tulis && Array.isArray(a.izin) && a.izin.includes('auditor')) throw new Error(`Aksi tulis ${nama} tidak boleh terbuka untuk auditor`);
  }
}

const AKSI_SAAT_WAJIB_GANTI = new Set<string>(['auth.gantiSandi', 'auth.saya', 'auth.keluar']);

export interface HasilApi {
  respons: Respons<unknown>;
  /** Untuk login/keluar: cookie yang harus dipasang atau dihapus. */
  cookie?: { token: string; ingat: boolean } | { hapus: true };
}

export async function jalankan(req: { aksi: unknown; data: unknown; token: string | null }, k: Konteks): Promise<HasilApi> {
  const nama = typeof req.aksi === 'string' ? req.aksi : '';
  try {
    if (nama === 'auth.login') {
      const d = objek(req.data);
      const h = await auth.login(
        teksWajib(d, 'username', { maks: 150 }),
        typeof d.sandi === 'string' ? d.sandi.slice(0, 200) : '',
        boolOpsional(d, 'ingat', false),
        k.perangkat,
      );
      return { respons: { ok: true, data: h.info }, cookie: { token: h.token, ingat: h.ingat } };
    }
    const u = await auth.dariToken(req.token); // AUTH-10: sebelum apa pun
    if (u.wajibGantiSandi && !AKSI_SAAT_WAJIB_GANTI.has(nama)) {
      throw galat('WAJIB_GANTI_SANDI', 'Ganti kata sandi Anda lebih dulu.');
    }
    const a = Object.hasOwn(AKSI, nama) ? (AKSI as Record<string, EntriAksi<NamaAksi>>)[nama] : undefined;
    if (!a) throw galat('AKSI_TIDAK_DIKENAL', 'Aksi tidak dikenal.');
    periksa(u, a.izin);
    const data = await a.fn(u, req.data ?? {}, k);
    if (nama === 'auth.keluar') return { respons: { ok: true, data }, cookie: { hapus: true } };
    return { respons: { ok: true, data } };
  } catch (e) {
    const g = keGalat(e, { aksi: nama });
    if (g.kode === 'TIDAK_SAH') return { respons: { ok: false, galat: g }, cookie: { hapus: true } };
    return { respons: { ok: false, galat: g } };
  }
}

/** Untuk unduhan (foto, dokumen, e-CV): token diperiksa sama seperti /api. */
export async function penggunaDariToken(token: string | null): Promise<Pengguna> {
  const u = await auth.dariToken(token);
  if (u.wajibGantiSandi) throw galat('WAJIB_GANTI_SANDI', 'Ganti kata sandi Anda lebih dulu.');
  return u;
}

export async function sehat(): Promise<boolean> {
  try {
    await bacaSatu('SELECT 1');
    return true;
  } catch (e) {
    log.galat('Basis data tidak bisa dihubungi', e);
    return false;
  }
}
