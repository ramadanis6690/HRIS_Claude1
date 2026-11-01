// Komponen dasar tata letak JM-Click (SRS UI-03 – UI-08, NFR-08 – NFR-11).
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GalatApi } from '../api.js';
import { Ikon } from './Ikon.js';

// ---------------------------------------------------------------------------
// Memuat data dari server, dengan pembatalan saat layar ditutup
// ---------------------------------------------------------------------------

export interface Muatan<T> {
  data: T | null;
  galat: string | null;
  sedangMuat: boolean;
  muatUlang: () => void;
}

export function useMuat<T>(ambil: () => Promise<T>, kunci: readonly unknown[]): Muatan<T> {
  const [data, setData] = useState<T | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangMuat, setSedangMuat] = useState(true);
  const [putaran, setPutaran] = useState(0);
  useEffect(() => {
    let batal = false;
    setSedangMuat(true);
    setGalat(null);
    ambil()
      .then((d) => {
        if (!batal) setData(d);
      })
      .catch((e: unknown) => {
        if (!batal) setGalat(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setSedangMuat(false);
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `kunci` adalah daftar dependensi pemanggil
  }, [...kunci, putaran]);
  return { data, galat, sedangMuat, muatUlang: useCallback(() => setPutaran((p) => p + 1), []) };
}

export function Memuat({ muatan, children }: { muatan: Muatan<unknown>; children: ReactNode }) {
  if (muatan.galat) {
    return (
      <div className="galat-umum baris-antara">
        <span>{muatan.galat}</span>
        <button className="tombol sekunder kecil" onClick={muatan.muatUlang}>Coba lagi</button>
      </div>
    );
  }
  if (muatan.sedangMuat && muatan.data === null) return <div className="kosong">Memuat…</div>;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Toast (NFR-08: setiap tombol aksi memberi tahu berhasil atau gagal)
// ---------------------------------------------------------------------------

interface ItemToast {
  id: number;
  pesan: string;
  jenis: 'berhasil' | 'gagal' | 'info';
}
let tambahToast: ((t: Omit<ItemToast, 'id'>) => void) | null = null;

export const toast = {
  berhasil: (pesan: string) => tambahToast?.({ pesan, jenis: 'berhasil' }),
  gagal: (pesan: string) => tambahToast?.({ pesan, jenis: 'gagal' }),
  info: (pesan: string) => tambahToast?.({ pesan, jenis: 'info' }),
};

export function WadahToast() {
  const [daftar, setDaftar] = useState<ItemToast[]>([]);
  useEffect(() => {
    let n = 0;
    tambahToast = (t) => {
      const id = ++n;
      setDaftar((d) => [...d, { ...t, id }]);
      setTimeout(() => setDaftar((d) => d.filter((x) => x.id !== id)), t.jenis === 'gagal' ? 7000 : 4000);
    };
    return () => {
      tambahToast = null;
    };
  }, []);
  return (
    <div className="toast-wadah" role="status" aria-live="polite">
      {daftar.map((t) => (
        <div key={t.id} className={`toast ${t.jenis}`}>{t.pesan}</div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tombol aksi: nonaktif selama proses, lalu berhasil/gagal (NFR-08)
// ---------------------------------------------------------------------------

type GayaTombol = 'utama' | 'sekunder' | 'bahaya' | 'hantu';

export function Tombol({
  children, onClick, gaya = 'utama', kecil, besar, penuh, type = 'button', disabled, pesanBerhasil, ikon, judul,
}: {
  children: ReactNode;
  onClick?: () => Promise<unknown> | void;
  gaya?: GayaTombol;
  kecil?: boolean;
  besar?: boolean;
  penuh?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  pesanBerhasil?: string;
  ikon?: string;
  judul?: string;
}) {
  const [sedangProses, setSedangProses] = useState(false);
  const kelas = ['tombol', gaya === 'utama' ? '' : gaya, kecil ? 'kecil' : '', besar ? 'besar' : '', penuh ? 'penuh' : ''].join(' ').trim();
  const klik = async () => {
    if (!onClick || sedangProses) return;
    const h = onClick();
    if (!(h instanceof Promise)) return;
    setSedangProses(true);
    try {
      await h;
      if (pesanBerhasil) toast.berhasil(pesanBerhasil);
    } catch (e) {
      if (!(e instanceof GalatApi && e.kolom)) toast.gagal(e instanceof Error ? e.message : 'Gagal.');
    } finally {
      setSedangProses(false);
    }
  };
  return (
    <button type={type} className={kelas} onClick={type === 'button' ? klik : undefined} disabled={disabled || sedangProses} title={judul} aria-busy={sedangProses}>
      {ikon && <Ikon nama={ikon} ukuran={16} />}
      {sedangProses ? 'Memproses…' : children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Isian dengan label mengambang (UI-08)
// ---------------------------------------------------------------------------

export function Isian({
  label, value, onChange, jenis = 'text', wajib, salah, bantuan, maks, otomatis, mode, pola, disabled, autoFocus, baris,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  jenis?: 'text' | 'password' | 'email' | 'date' | 'time' | 'number' | 'tel' | 'month';
  wajib?: boolean;
  salah?: string | null;
  bantuan?: string;
  maks?: number;
  otomatis?: string;
  mode?: 'numeric' | 'decimal' | 'email' | 'tel' | 'text';
  pola?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  baris?: number;
}) {
  const id = useId();
  const [lihat, setLihat] = useState(false);
  const tipe = jenis === 'password' && lihat ? 'text' : jenis;
  const isiTetap = ['date', 'time', 'month'].includes(jenis);
  return (
    <div className={`isian${salah ? ' salah' : ''}${isiTetap ? ' terisi' : ''}`}>
      {baris ? (
        <textarea id={id} value={value} placeholder=" " onChange={(e) => onChange(e.target.value)} maxLength={maks} disabled={disabled} rows={baris} aria-invalid={!!salah} />
      ) : (
        <input
          id={id} type={tipe} value={value} placeholder=" " onChange={(e) => onChange(e.target.value)} maxLength={maks}
          autoComplete={otomatis} inputMode={mode} pattern={pola} disabled={disabled} autoFocus={autoFocus} aria-invalid={!!salah}
          style={jenis === 'password' ? { paddingRight: 44 } : undefined}
        />
      )}
      <label htmlFor={id}>
        {label}
        {wajib && <span className="wajib"> *</span>}
      </label>
      {jenis === 'password' && (
        // AUTH-14: tombol perlihatkan kata sandi, nonaktif secara default.
        <button type="button" className="ikon-tombol mata" onClick={() => setLihat((l) => !l)} aria-label={lihat ? 'Sembunyikan kata sandi' : 'Perlihatkan kata sandi'} style={{ color: 'var(--ink-muted)' }}>
          <Ikon nama={lihat ? 'mataTutup' : 'mata'} />
        </button>
      )}
      {salah && <div className="pesan-salah">{salah}</div>}
      {!salah && bantuan && <div className="bantuan">{bantuan}</div>}
    </div>
  );
}

export function Pilihan({
  label, value, onChange, opsi, wajib, salah, kosong = 'Pilih…', disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opsi: readonly (string | { nilai: string; label: string })[];
  wajib?: boolean;
  salah?: string | null;
  kosong?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`isian terisi${salah ? ' salah' : ''}`}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={!!salah}>
        {kosong !== null && <option value="">{kosong}</option>}
        {opsi.map((o) => {
          const n = typeof o === 'string' ? o : o.nilai;
          return <option key={n} value={n}>{typeof o === 'string' ? o : o.label}</option>;
        })}
      </select>
      <label htmlFor={id}>
        {label}
        {wajib && <span className="wajib"> *</span>}
      </label>
      {salah && <div className="pesan-salah">{salah}</div>}
    </div>
  );
}

export function Saklar({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="saklar">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Kartu, pil, ringkas
// ---------------------------------------------------------------------------

export function Kartu({ judul, aksi, children, rapat }: { judul?: ReactNode; aksi?: ReactNode; children: ReactNode; rapat?: boolean }) {
  return (
    <section className="kartu">
      {(judul || aksi) && (
        <div className="kartu-kepala">
          {typeof judul === 'string' ? <h2>{judul}</h2> : judul}
          {aksi && <div className="baris">{aksi}</div>}
        </div>
      )}
      <div className={`kartu-isi${rapat ? ' rapat' : ''}`}>{children}</div>
    </section>
  );
}

export type JenisPil = 'draf' | 'menunggu' | 'disetujui' | 'proses' | 'selesai' | 'ditolak' | 'final';
export function Pil({ jenis, children }: { jenis: JenisPil; children: ReactNode }) {
  return <span className={`pil ${jenis === 'draf' ? '' : jenis}`}>{children}</span>;
}

export function Ringkas({ angka, label, nada, onClick }: { angka: ReactNode; label: string; nada?: 'info' | 'sukses' | 'peringatan' | 'bahaya' | 'proses'; onClick?: () => void }) {
  return (
    <div className={`ringkas ${nada ?? ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="angka">{angka}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export function JudulLayar({ judul, keterangan, aksi }: { judul: string; keterangan?: ReactNode; aksi?: ReactNode }) {
  useEffect(() => {
    document.title = `${judul} — HRIS DPJM`;
  }, [judul]);
  return (
    <div className="judul-layar">
      <div>
        <h1>{judul}</h1>
        {keterangan && <p>{keterangan}</p>}
      </div>
      {aksi && <div className="baris">{aksi}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog (NFR-11: Escape, klik di luar, fokus ke kolom pertama) dan konfirmasi (NFR-10)
// ---------------------------------------------------------------------------

export function Dialog({ judul, onTutup, children, lebar }: { judul: string; onTutup: () => void; children: ReactNode; lebar?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup();
    };
    document.addEventListener('keydown', tekan);
    const pertama = ref.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.ikon-tombol)');
    pertama?.focus();
    return () => document.removeEventListener('keydown', tekan);
  }, [onTutup]);
  return createPortal(
    <div className="dialog-latar" onMouseDown={(e) => e.target === e.currentTarget && onTutup()}>
      <div className={`dialog${lebar ? ' lebar' : ''}`} role="dialog" aria-modal="true" aria-label={judul} ref={ref}>
        <div className="dialog-kepala">
          <h2>{judul}</h2>
          <button className="ikon-tombol" onClick={onTutup} aria-label="Tutup" style={{ color: 'var(--ink-muted)' }}><Ikon nama="silang" /></button>
        </div>
        <div className="dialog-isi">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Konfirmasi({
  judul, akibat, label = 'Ya, lanjutkan', bahaya, onYa, onTutup,
}: {
  judul: string;
  akibat: ReactNode;
  label?: string;
  bahaya?: boolean;
  onYa: () => Promise<unknown>;
  onTutup: () => void;
}) {
  return (
    <Dialog judul={judul} onTutup={onTutup}>
      <div className="tumpuk">
        <div>{akibat}</div>
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol gaya={bahaya ? 'bahaya' : 'utama'} onClick={async () => { await onYa(); onTutup(); }}>{label}</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Tabel dengan pencarian dan "row per pages" (UI-03, NFR-04)
// ---------------------------------------------------------------------------

export interface Kolom<T> {
  judul: string;
  isi: (b: T) => ReactNode;
  cari?: (b: T) => string;
  uang?: boolean;
  lebar?: number;
}

export function Tabel<T>({
  data, kolom, kunci, onKlik, kosong, alat, cari = true, perHalamanAwal = 10,
}: {
  data: readonly T[];
  kolom: readonly Kolom<T>[];
  kunci: (b: T) => string;
  onKlik?: (b: T) => void;
  kosong: ReactNode;
  alat?: ReactNode;
  cari?: boolean;
  perHalamanAwal?: number;
}) {
  const [teks, setTeks] = useState('');
  const [perHalaman, setPerHalaman] = useState(perHalamanAwal);
  const [halaman, setHalaman] = useState(1);
  const tersaring = useMemo(() => {
    const t = teks.trim().toLowerCase();
    if (!t) return data;
    return data.filter((b) => kolom.some((k) => (k.cari?.(b) ?? '').toLowerCase().includes(t)));
  }, [data, kolom, teks]);
  const jumlahHalaman = Math.max(1, Math.ceil(tersaring.length / perHalaman));
  const hal = Math.min(halaman, jumlahHalaman);
  const tampil = tersaring.slice((hal - 1) * perHalaman, hal * perHalaman);
  return (
    <>
      {(cari || alat) && (
        <div className="tabel-alat">
          {cari ? (
            <div style={{ flex: '1 1 220px', maxWidth: 320 }}>
              <Isian label="Cari" value={teks} onChange={(v) => { setTeks(v); setHalaman(1); }} />
            </div>
          ) : <span />}
          {alat && <div className="baris">{alat}</div>}
        </div>
      )}
      <div className="tabel-wadah">
        <table className="tabel">
          <thead>
            <tr>{kolom.map((k) => <th key={k.judul} className={k.uang ? 'uang' : undefined} style={k.lebar ? { width: k.lebar } : undefined}>{k.judul}</th>)}</tr>
          </thead>
          <tbody>
            {tampil.map((b) => (
              <tr key={kunci(b)} className={onKlik ? 'klik' : undefined} onClick={onKlik ? () => onKlik(b) : undefined} tabIndex={onKlik ? 0 : undefined} onKeyDown={onKlik ? (e) => e.key === 'Enter' && onKlik(b) : undefined}>
                {kolom.map((k) => <td key={k.judul} className={k.uang ? 'uang' : undefined}>{k.isi(b)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {tampil.length === 0 && <div className="kosong">{teks ? 'Tidak ada yang cocok dengan pencarian.' : kosong}</div>}
      </div>
      {tersaring.length > 0 && (
        <div className="tabel-kaki">
          <label className="baris">
            Baris per halaman
            <select value={perHalaman} onChange={(e) => { setPerHalaman(Number(e.target.value)); setHalaman(1); }}>
              {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span>{(hal - 1) * perHalaman + 1}–{Math.min(hal * perHalaman, tersaring.length)} dari {tersaring.length}</span>
          <button className="tombol hantu kecil" disabled={hal <= 1} onClick={() => setHalaman(hal - 1)}>‹ Sebelumnya</button>
          <button className="tombol hantu kecil" disabled={hal >= jumlahHalaman} onClick={() => setHalaman(hal + 1)}>Berikutnya ›</button>
        </div>
      )}
    </>
  );
}

/** Galat per kolom dari GalatApi, untuk ditaruh di bawah kolom yang salah (UI-08). */
export function useGalatKolom() {
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [umum, setUmum] = useState<string | null>(null);
  const tangkap = useCallback(async <T,>(f: () => Promise<T>): Promise<T> => {
    setGalat({});
    setUmum(null);
    try {
      return await f();
    } catch (e) {
      if (e instanceof GalatApi && e.kolom) setGalat({ [e.kolom]: e.message });
      else setUmum(e instanceof Error ? e.message : 'Gagal.');
      throw e;
    }
  }, []);
  return { galat, umum, tangkap, bersihkan: () => { setGalat({}); setUmum(null); } };
}
