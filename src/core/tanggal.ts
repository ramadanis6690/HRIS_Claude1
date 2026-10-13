// Tanggal dan jam selalu WIB (UTC+7, tanpa musim panas). Fungsi di sini murni:
// waktu "sekarang" selalu masuk sebagai argumen, tidak pernah dibaca sendiri.

/** Tanggal ISO `yyyy-MM-dd`. */
export type Tanggal = string;

const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;
const MENIT_SEHARI = 24 * 60;

export function tanggalWIB(waktu: Date): Tanggal {
  return new Date(waktu.getTime() + OFFSET_WIB_MS).toISOString().slice(0, 10);
}

/** Menit sejak tengah malam WIB, dibulatkan ke bawah (detik diabaikan). */
export function menitWIB(waktu: Date): number {
  const menit = Math.floor((waktu.getTime() + OFFSET_WIB_MS) / 60000);
  return ((menit % MENIT_SEHARI) + MENIT_SEHARI) % MENIT_SEHARI;
}

/** `HH:MM` atau `HH:MM:SS` → menit sejak tengah malam. */
export function menitDariJam(jam: string): number {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(jam);
  if (!m) throw new Error(`Format jam tidak dikenal: ${jam}`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Jam di luar rentang: ${jam}`);
  return h * 60 + mi;
}

/** Jam WIB `HH:MM` dari sebuah waktu. */
export function jamWIB(waktu: Date): string {
  const m = menitWIB(waktu);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Waktu absolut untuk tanggal + jam WIB. */
export function waktuDariWIB(tanggal: Tanggal, jam: string): Date {
  const [y, mo, d] = pecahTanggal(tanggal);
  const menit = menitDariJam(jam);
  return new Date(Date.UTC(y, mo - 1, d, 0, menit) - OFFSET_WIB_MS);
}

export function pecahTanggal(tanggal: Tanggal): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) throw new Error(`Format tanggal tidak dikenal: ${tanggal}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const cek = new Date(Date.UTC(y, mo - 1, d));
  if (cek.getUTCFullYear() !== y || cek.getUTCMonth() !== mo - 1 || cek.getUTCDate() !== d) {
    throw new Error(`Tanggal tidak ada: ${tanggal}`);
  }
  return [y, mo, d];
}

export function tanggalSah(tanggal: string): boolean {
  try {
    pecahTanggal(tanggal);
    return true;
  } catch {
    return false;
  }
}

/** Hari ISO: 1 = Senin … 7 = Minggu. */
export function hariIso(tanggal: Tanggal): number {
  const [y, mo, d] = pecahTanggal(tanggal);
  const h = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return h === 0 ? 7 : h;
}

export function tambahHari(tanggal: Tanggal, n: number): Tanggal {
  const [y, mo, d] = pecahTanggal(tanggal);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

export function tambahBulan(tanggal: Tanggal, n: number): Tanggal {
  const [y, mo, d] = pecahTanggal(tanggal);
  // Tanggal 31 + 1 bulan → akhir bulan berikutnya, bukan meluap ke bulan sesudahnya.
  const akhir = new Date(Date.UTC(y, mo - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, mo - 1 + n, Math.min(d, akhir))).toISOString().slice(0, 10);
}

export function selisihHari(dari: Tanggal, sampai: Tanggal): number {
  const [y1, m1, d1] = pecahTanggal(dari);
  const [y2, m2, d2] = pecahTanggal(sampai);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Jumlah bulan penuh dari `mulai` sampai `acuan`. Nol bila acuan sebelum mulai. */
export function bulanPenuh(mulai: Tanggal, acuan: Tanggal): number {
  const [y1, m1, d1] = pecahTanggal(mulai);
  const [y2, m2, d2] = pecahTanggal(acuan);
  const bulan = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return Math.max(0, bulan);
}

export interface MasaKerja {
  tahun: number;
  bulan: number;
}

/** EMP-06: masa kerja dihitung dari tanggal masa kerja diakui, atau tanggal masuk. */
export function masaKerja(
  tglMasuk: Tanggal | null,
  tglDiakui: Tanggal | null,
  acuan: Tanggal,
): MasaKerja | null {
  const mulai = tglDiakui ?? tglMasuk;
  if (!mulai) return null;
  const b = bulanPenuh(mulai, acuan);
  return { tahun: Math.floor(b / 12), bulan: b % 12 };
}

export function formatMasaKerja(m: MasaKerja | null): string {
  if (!m) return 'Belum diisi';
  return `${m.tahun} tahun ${m.bulan} bulan`;
}

/** Hari kerja = termasuk hari kerja pengaturan dan bukan hari libur (WRK-03). */
export function hariKerja(tanggal: Tanggal, hariKerjaIso: readonly number[], libur: ReadonlySet<Tanggal>): boolean {
  return hariKerjaIso.includes(hariIso(tanggal)) && !libur.has(tanggal);
}

export function daftarTanggal(mulai: Tanggal, akhir: Tanggal): Tanggal[] {
  const hasil: Tanggal[] = [];
  for (let t = mulai; t <= akhir; t = tambahHari(t, 1)) hasil.push(t);
  return hasil;
}

export function awalBulan(tanggal: Tanggal): Tanggal {
  return tanggal.slice(0, 8) + '01';
}

export function akhirBulan(tanggal: Tanggal): Tanggal {
  const [y, mo] = pecahTanggal(tanggal);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Filter tanggal empat mode (SRS DSH-04)
// ---------------------------------------------------------------------------

export type FilterTanggal =
  | { mode: 'harian'; tanggal: Tanggal }
  | { mode: 'bulanan'; bulan: string } // yyyy-MM
  | { mode: 'triwulan'; tahun: number; tw: 1 | 2 | 3 | 4 }
  | { mode: 'rentang'; mulai: Tanggal; akhir: Tanggal };

export interface Rentang {
  mulai: Tanggal;
  akhir: Tanggal;
}

export function rentangDariFilter(f: FilterTanggal): Rentang {
  switch (f.mode) {
    case 'harian':
      pecahTanggal(f.tanggal);
      return { mulai: f.tanggal, akhir: f.tanggal };
    case 'bulanan': {
      const awal = `${f.bulan}-01`;
      return { mulai: awal, akhir: akhirBulan(awal) };
    }
    case 'triwulan': {
      const bulanAwal = (f.tw - 1) * 3 + 1;
      const awal = `${f.tahun}-${String(bulanAwal).padStart(2, '0')}-01`;
      return { mulai: awal, akhir: akhirBulan(tambahBulan(awal, 2)) };
    }
    case 'rentang':
      pecahTanggal(f.mulai);
      pecahTanggal(f.akhir);
      if (f.mulai > f.akhir) throw new Error('Tanggal mulai setelah tanggal akhir');
      return { mulai: f.mulai, akhir: f.akhir };
  }
}

export function triwulanDari(tanggal: Tanggal): { tahun: number; tw: 1 | 2 | 3 | 4 } {
  const [y, mo] = pecahTanggal(tanggal);
  return { tahun: y, tw: (Math.floor((mo - 1) / 3) + 1) as 1 | 2 | 3 | 4 };
}
