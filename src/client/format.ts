// Format tampilan. Rupiah lewat satu fungsi yang sama dengan server (NFR-07).
export { formatRupiah } from '../core/rupiah.js';
import { jamWIB, tanggalWIB } from '../core/tanggal.js';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const BELUM_DIISI = 'Belum diisi';

export function tanggalPanjang(t: string | null | undefined): string {
  if (!t) return BELUM_DIISI;
  const [y, m, d] = t.split('-').map(Number);
  return `${d} ${BULAN[(m ?? 1) - 1]} ${y}`;
}

export function tanggalPendek(t: string | null | undefined): string {
  if (!t) return BELUM_DIISI;
  const [y, m, d] = t.split('-').map(Number);
  return `${d} ${BULAN_PENDEK[(m ?? 1) - 1]} ${y}`;
}

export function hariTanggal(t: string): string {
  const [y, m, d] = t.split('-').map(Number);
  const hari = HARI[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${hari}, ${tanggalPanjang(t)}`;
}

export const namaBulan = (bulan: string) => {
  const [y, m] = bulan.split('-').map(Number);
  return `${BULAN[(m ?? 1) - 1]} ${y}`;
};

/** Jam WIB dari waktu ISO. */
export const jam = (iso: string | null | undefined) => (iso ? jamWIB(new Date(iso)) : '—');

export const waktuLengkap = (iso: string | null | undefined) =>
  iso ? `${tanggalPendek(tanggalWIB(new Date(iso)))} ${jamWIB(new Date(iso))}` : BELUM_DIISI;

export const isi = (v: unknown) => (v === null || v === undefined || v === '' ? BELUM_DIISI : String(v));

export function ukuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`;
  if (byte < 1024 ** 3) return `${(byte / 1024 / 1024).toFixed(1)} MB`;
  return `${(byte / 1024 ** 3).toFixed(1)} GB`;
}

export const hariIniWIB = () => tanggalWIB(new Date());
