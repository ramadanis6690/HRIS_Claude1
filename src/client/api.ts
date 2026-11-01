// Satu-satunya jalan ke server (design_final.md §2.1). Token ada di cookie
// HttpOnly yang dipasang server; JavaScript tidak pernah menyentuhnya.
import type { Aksi, Galat, Respons } from '../bersama/aksi.js';

export class GalatApi extends Error {
  readonly kode: string;
  readonly kolom?: string;
  constructor(g: Galat) {
    super(g.pesan);
    this.kode = g.kode;
    if (g.kolom) this.kolom = g.kolom;
  }
}

type Pendengar = (g: GalatApi) => void;
let saatSesiBerakhir: Pendengar | null = null;
export const aturSaatSesiBerakhir = (f: Pendengar) => {
  saatSesiBerakhir = f;
};

export async function api<A extends keyof Aksi>(aksi: A, data: Aksi[A]['kirim']): Promise<Aksi[A]['terima']> {
  let r: Response;
  try {
    r = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ aksi, data }),
    });
  } catch {
    throw new GalatApi({ kode: 'JARINGAN', pesan: 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.' });
  }
  let j: Respons<Aksi[A]['terima']>;
  try {
    j = (await r.json()) as Respons<Aksi[A]['terima']>;
  } catch {
    throw new GalatApi({ kode: 'SERVER', pesan: r.status === 413 ? 'Berkas terlalu besar.' : 'Server tidak menjawab dengan benar. Coba lagi.' });
  }
  if (!j.ok) {
    const g = new GalatApi(j.galat);
    if ((g.kode === 'TIDAK_SAH' || g.kode === 'WAJIB_GANTI_SANDI') && aksi !== 'auth.login' && aksi !== 'auth.saya') saatSesiBerakhir?.(g);
    throw g;
  }
  return j.data;
}

/** Alamat unduhan (foto, dokumen, e-CV). Izin diperiksa server dari cookie yang sama. */
export const urlUnduh = (jenis: 'berkas' | 'foto-profil' | 'ecv' | 'templat-impor', id = '') => `/api/unduh/${jenis}/${id}`;

/** Berkas → base64 (tanpa awalan data URL). */
export function keBase64(b: Blob): Promise<string> {
  return new Promise((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] ?? '');
    r.onerror = () => gagal(new Error('Berkas tidak bisa dibaca'));
    r.readAsDataURL(b);
  });
}
