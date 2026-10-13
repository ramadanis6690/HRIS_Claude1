// Penilaian check-in dan check-out (design_final.md §8.1, SRS ATT-*, LOC-*),
// serta potongan kehadiran (§8.2). Murni: semua keadaan masuk sebagai argumen.
import { titikTerdekat, type Koordinat, type TitikKantor } from './jarak.js';
import { lantaiRatusan } from './rupiah.js';
import { hariKerja, menitDariJam, menitWIB, tanggalWIB, type Tanggal } from './tanggal.js';

/** Akurasi GPS lebih buruk dari ini: minta ulang, tidak dicatat (ATT-15). */
export const BATAS_AKURASI_M = 200;

export interface JamKerjaBerlaku {
  jamMasuk: string; // HH:MM
  jamPulang: string;
  toleransiMenit: number;
  hariKerja: readonly number[]; // ISO 1..7
}

export function hitungMenitTerlambat(masuk: Date, jamMasuk: string, toleransiMenit: number): number {
  return Math.max(0, menitWIB(masuk) - (menitDariJam(jamMasuk) + toleransiMenit));
}

export function hitungMenitPulangCepat(pulang: Date, jamPulang: string): number {
  return Math.max(0, menitDariJam(jamPulang) - menitWIB(pulang));
}

export interface MasukanCheckIn {
  sekarang: Date;
  posisi: Koordinat & { akurasi: number };
  sudahCheckIn: boolean;
  dinasAktif: boolean;
  bypassGps: boolean;
  wajibPresensi: boolean;
  titikTerkunciId: string | null;
  titikAktif: readonly TitikKantor[];
  jamKerja: JamKerjaBerlaku;
  libur: ReadonlySet<Tanggal>;
}

export interface PresensiBaru {
  tanggal: Tanggal;
  sumber: 'check_in' | 'dinas_luar';
  titikKantorId: string | null;
  jarakM: number | null;
  radiusSaatItu: number | null;
  /** null = belum dinilai (tidak ada titik aktif, atau dinas luar). */
  dalamRadius: boolean | null;
  bypassSaatItu: boolean;
  jamMasukSaatItu: string;
  jamPulangSaatItu: string;
  toleransiSaatItu: number;
  menitTerlambat: number;
}

export type HasilCheckIn =
  | { hasil: 'sudah_check_in' }
  | { hasil: 'akurasi_lemah'; akurasi: number }
  | { hasil: 'luar_radius'; titik: TitikKantor; jarakM: number }
  | { hasil: 'simpan'; presensi: PresensiBaru };

export function nilaiCheckIn(m: MasukanCheckIn): HasilCheckIn {
  if (m.sudahCheckIn) return { hasil: 'sudah_check_in' };
  if (!(m.posisi.akurasi <= BATAS_AKURASI_M)) return { hasil: 'akurasi_lemah', akurasi: m.posisi.akurasi };

  const tanggal = tanggalWIB(m.sekarang);
  const potret = {
    tanggal,
    bypassSaatItu: m.bypassGps,
    jamMasukSaatItu: m.jamKerja.jamMasuk,
    jamPulangSaatItu: m.jamKerja.jamPulang,
    toleransiSaatItu: m.jamKerja.toleransiMenit,
  };

  if (m.dinasAktif) {
    // Hari dinas tidak pernah dinilai terlambat maupun radius (PRD §6.4).
    return {
      hasil: 'simpan',
      presensi: { ...potret, sumber: 'dinas_luar', titikKantorId: null, jarakM: null, radiusSaatItu: null, dalamRadius: null, menitTerlambat: 0 },
    };
  }

  const dinilai = m.wajibPresensi && hariKerja(tanggal, m.jamKerja.hariKerja, m.libur);
  const menitTerlambat = dinilai
    ? hitungMenitTerlambat(m.sekarang, m.jamKerja.jamMasuk, m.jamKerja.toleransiMenit)
    : 0;

  // Titik terkunci yang sudah nonaktif tidak boleh membuat check-in mustahil:
  // kembali ke semua titik aktif.
  const terkunci = m.titikTerkunciId ? m.titikAktif.filter((t) => t.id === m.titikTerkunciId) : [];
  const kandidat = terkunci.length > 0 ? terkunci : m.titikAktif;

  const t = titikTerdekat(m.posisi, kandidat);
  if (!t) {
    return {
      hasil: 'simpan',
      presensi: { ...potret, sumber: 'check_in', titikKantorId: null, jarakM: null, radiusSaatItu: null, dalamRadius: null, menitTerlambat },
    };
  }

  const dalamRadius = t.jarakM <= t.titik.radiusM;
  if (!dalamRadius && !m.bypassGps) return { hasil: 'luar_radius', titik: t.titik, jarakM: t.jarakM };

  return {
    hasil: 'simpan',
    presensi: {
      ...potret,
      sumber: 'check_in',
      titikKantorId: t.titik.id,
      jarakM: Math.round(t.jarakM * 100) / 100,
      radiusSaatItu: t.titik.radiusM,
      dalamRadius,
      menitTerlambat,
    },
  };
}

export interface MasukanCheckOut {
  sekarang: Date;
  tanggalPresensi: Tanggal;
  sumber: string;
  wajibPresensi: boolean;
  jamPulangSaatItu: string | null;
  hariKerjaIso: readonly number[];
  libur: ReadonlySet<Tanggal>;
}

export function hitungCheckOut(m: MasukanCheckOut): { menitPulangCepat: number } {
  const dinilai =
    m.wajibPresensi &&
    m.sumber !== 'dinas_luar' &&
    m.jamPulangSaatItu !== null &&
    hariKerja(m.tanggalPresensi, m.hariKerjaIso, m.libur);
  return { menitPulangCepat: dinilai ? hitungMenitPulangCepat(m.sekarang, m.jamPulangSaatItu!) : 0 };
}

/** Pesan penolakan luar radius (LOC-06): "Anda berada ±X m dari [kantor] (batas Y m)." */
export function pesanLuarRadius(namaKantor: string, jarakM: number, radiusM: number): string {
  return `Anda berada ±${Math.round(jarakM).toLocaleString('id-ID')} m dari ${namaKantor} (batas ${radiusM} m).`;
}

/**
 * Potongan kehadiran (REK-03): lantaiRatusan((0,30 × gapok ÷ 10.380) × menit).
 * Menit = terlambat + pulang cepat + 480 × mangkir.
 */
export function hitungPotonganKehadiran(gapok: number, menitTerlambat: number, menitPulangCepat: number, hariMangkir: number): number {
  const tarifMenit = (0.3 * gapok) / 10_380;
  return lantaiRatusan(tarifMenit * (menitTerlambat + menitPulangCepat + 480 * hariMangkir));
}
