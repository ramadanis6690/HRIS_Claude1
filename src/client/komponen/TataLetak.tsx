// Bilah atas, sidebar, dan menu bawah HP (SRS UI-01, UI-02, UI-02a, UI-07).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, urlUnduh } from '../api.js';
import { MENU, SEKSI } from '../menu.js';
import { navigasi, Tautan, useJalur } from '../rute.js';
import { inisial, useSesi } from '../Sesi.js';
import { Ikon } from './Ikon.js';

const KUNCI_TEMA = 'hris-tema';

export function bacaTema(): 'light' | 'dark' {
  try {
    return localStorage.getItem(KUNCI_TEMA) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function useTema(): ['light' | 'dark', () => void] {
  const [tema, setTema] = useState(bacaTema);
  useEffect(() => {
    // NFR-06: terang bawaan; gelap hanya lewat tombol, tidak mengikuti sistem operasi.
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem(KUNCI_TEMA, tema);
    } catch {
      /* penyimpanan ditolak: tema tetap berlaku sampai halaman ditutup */
    }
  }, [tema]);
  return [tema, () => setTema((t) => (t === 'dark' ? 'light' : 'dark'))];
}

function FotoSaya({ kelas }: { kelas: string }) {
  const { sesi } = useSesi();
  const [gagal, setGagal] = useState(false);
  if (!sesi) return null;
  if (sesi.adaFoto && !gagal) return <img className={kelas} src={urlUnduh('foto-profil', sesi.pegawaiId)} alt="" onError={() => setGagal(true)} />;
  return <span className={kelas}>{inisial(sesi.nama)}</span>;
}

export function TataLetak({ children }: { children: ReactNode }) {
  const { sesi, aturSesi, boleh } = useSesi();
  const { jalur } = useJalur();
  const [tema, gantiTema] = useTema();
  const [sidebarBuka, setSidebarBuka] = useState(false);
  const [profilBuka, setProfilBuka] = useState(false);
  const [cari, setCari] = useState('');
  const refProfil = useRef<HTMLDivElement>(null);

  const menu = useMemo(() => MENU.filter((m) => boleh(m.kunci)), [boleh]);
  const hasilCari = cari.trim() ? menu.filter((m) => m.label.toLowerCase().includes(cari.trim().toLowerCase())) : [];

  useEffect(() => {
    if (!profilBuka) return;
    const tutup = (e: MouseEvent) => {
      if (!refProfil.current?.contains(e.target as Node)) setProfilBuka(false);
    };
    document.addEventListener('mousedown', tutup);
    return () => document.removeEventListener('mousedown', tutup);
  }, [profilBuka]);

  const keluar = async () => {
    try {
      await api('auth.keluar', {}); // AUTH-15: sesi dicabut di server
    } finally {
      aturSesi(null);
      navigasi('/', true);
    }
  };

  const aktif = (j: string) => (j === '/' ? jalur === '/' : jalur === j || jalur.startsWith(j + '/'));

  return (
    <div className="tata">
      <header className="topbar">
        <button className="ikon-tombol" onClick={() => setSidebarBuka((b) => !b)} aria-label="Buka atau tutup menu"><Ikon nama="menu" /></button>
        <div className="merek">
          <img src="/logo-dpjm.png" alt="" />
          <span>HRIS DPJM</span>
        </div>
        <div className="cari">
          <Ikon nama="cari" ukuran={16} />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari menu…" aria-label="Cari menu" />
          {hasilCari.length > 0 && (
            <div className="cari-hasil">
              {hasilCari.map((m) => (
                <button key={m.kunci} onClick={() => { setCari(''); navigasi(m.jalur); }}>{m.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="isi-kanan">
          {/* Feedback aktif mulai Fase 4, notifikasi mulai Fase 2 (PRD §5). */}
          <button className="ikon-tombol" disabled title="Feedback — tersedia mulai Fase 4" aria-label="Feedback"><Ikon nama="pesan" /></button>
          <button className="ikon-tombol" disabled title="Notifikasi — tersedia mulai Fase 2" aria-label="Notifikasi"><Ikon nama="lonceng" /></button>
          <button className="ikon-tombol" onClick={gantiTema} aria-label={tema === 'dark' ? 'Tema terang' : 'Tema gelap'} title={tema === 'dark' ? 'Tema terang' : 'Tema gelap'}>
            <Ikon nama={tema === 'dark' ? 'matahari' : 'bulan'} />
          </button>
          <div ref={refProfil} style={{ position: 'relative' }}>
            <button className="ikon-tombol" onClick={() => setProfilBuka((b) => !b)} aria-label="Menu profil" aria-expanded={profilBuka}>
              <FotoSaya kelas="foto-bulat" />
            </button>
            {profilBuka && (
              <div className="menu-profil" role="menu">
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontWeight: 600 }}>{sesi?.nama}</div>
                  <div className="redup kecil mono">{sesi?.npp}</div>
                </div>
                <button role="menuitem" onClick={() => { setProfilBuka(false); navigasi('/profil'); }}><Ikon nama="profil" /> Profil</button>
                <button role="menuitem" onClick={() => { setProfilBuka(false); navigasi('/ubah-sandi'); }}><Ikon nama="kunci" /> Ganti Kata Sandi</button>
                <button role="menuitem" onClick={keluar}><Ikon nama="keluar" /> Keluar</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav className={`sidebar${sidebarBuka ? ' terbuka' : ''}`} aria-label="Menu utama">
        <div className="profil">
          <FotoSaya kelas="foto" />
          <div className="nama">{sesi?.nama}</div>
          <div className="npp">{sesi?.npp}</div>
          {sesi?.jabatan && <div className="kecil" style={{ opacity: 0.8 }}>{sesi.jabatan}</div>}
        </div>
        {SEKSI.map((s) => {
          const isi = menu.filter((m) => m.seksi === s);
          if (isi.length === 0) return null; // seksi yang kosong ikut disembunyikan (UI-02a)
          return (
            <div key={s}>
              <div className="seksi">{s}</div>
              {isi.map((m) => (
                <Tautan key={m.kunci} ke={m.jalur} className={`item${aktif(m.jalur) ? ' aktif' : ''}`} onClick={() => setSidebarBuka(false)}>
                  <Ikon nama={m.ikon} />
                  <span>{m.label}</span>
                </Tautan>
              ))}
            </div>
          );
        })}
      </nav>
      <div className={`tirai${sidebarBuka ? ' terbuka' : ''}`} onClick={() => setSidebarBuka(false)} />

      <main className="isi">{children}</main>

      {/* UI-07: menu bawah HP. Pengajuan (Fase 2) dan Feedback (Fase 4) ditambahkan saat modulnya ada. */}
      <nav className="nav-bawah" aria-label="Menu bawah">
        <Tautan ke="/" className={aktif('/') ? 'aktif' : ''}><Ikon nama="beranda" />Beranda</Tautan>
        <Tautan ke="/presensi" className={aktif('/presensi') ? 'aktif' : ''}><Ikon nama="jam" />Presensi</Tautan>
        <Tautan ke="/profil" className={aktif('/profil') ? 'aktif' : ''}><Ikon nama="profil" />Profil</Tautan>
        <button onClick={() => setSidebarBuka(true)}><Ikon nama="menu" />Menu</button>
      </nav>
    </div>
  );
}
