import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import { cssTema } from '../bersama/tema.js';
import type { KunciMenu } from '../bersama/aksi.js';
import './gaya.css';
import { WadahToast } from './komponen/dasar.js';
import { bacaTema, TataLetak } from './komponen/TataLetak.js';
import { Beranda } from './layar/Beranda.js';
import { DataPegawai } from './layar/DataPegawai.js';
import { DetailPegawai } from './layar/DetailPegawai.js';
import { AuditLog, GajiPokok, StatusSistem } from './layar/Lainnya.js';
import { GantiSandi, Masuk } from './layar/Masuk.js';
import { Pengaturan } from './layar/Pengaturan.js';
import { Pengguna } from './layar/Pengguna.js';
import { Presensi } from './layar/Presensi.js';
import { RekapKehadiran } from './layar/RekapKehadiran.js';
import { Tautan, useJalur } from './rute.js';
import { PenyediaSesi, useSesi } from './Sesi.js';

// Token tema dari satu sumber (src/bersama/tema.ts).
const gaya = document.createElement('style');
gaya.textContent = cssTema();
document.head.appendChild(gaya);
document.documentElement.dataset.theme = bacaTema();

function TidakAda() {
  return (
    <div className="kartu kartu-isi kosong">
      <h2>Halaman tidak ditemukan</h2>
      <p>Menu ini tidak ada atau bukan hak Anda.</p>
      <Tautan ke="/" className="tombol">Kembali ke Beranda</Tautan>
    </div>
  );
}

const RUTE: { pola: RegExp; menu: KunciMenu; layar: (m: RegExpMatchArray) => ReactNode }[] = [
  { pola: /^\/$/, menu: 'beranda', layar: () => <Beranda /> },
  { pola: /^\/presensi$/, menu: 'presensi', layar: () => <Presensi /> },
  { pola: /^\/rekap-kehadiran$/, menu: 'rekap_kehadiran', layar: () => <RekapKehadiran /> },
  { pola: /^\/profil$/, menu: 'profil', layar: () => <DetailPegawai id={null} /> },
  { pola: /^\/ubah-sandi$/, menu: 'ubah_sandi', layar: () => <GantiSandi /> },
  { pola: /^\/pegawai$/, menu: 'data_pegawai', layar: () => <DataPegawai /> },
  { pola: /^\/pegawai\/([0-9a-f-]{36})$/, menu: 'data_pegawai', layar: (m) => <DetailPegawai key={m[1]} id={m[1]!} /> },
  { pola: /^\/gaji-pokok$/, menu: 'gaji_pokok', layar: () => <GajiPokok /> },
  { pola: /^\/audit-log$/, menu: 'audit_log', layar: () => <AuditLog /> },
  { pola: /^\/pengguna$/, menu: 'user_management', layar: () => <Pengguna /> },
  { pola: /^\/pengaturan$/, menu: 'pengaturan', layar: () => <Pengaturan /> },
  { pola: /^\/status-sistem$/, menu: 'status_sistem', layar: () => <StatusSistem /> },
];

function Aplikasi() {
  const { sesi, siap, boleh } = useSesi();
  const { jalur } = useJalur();
  if (!siap) return <div className="kosong">Memuat…</div>;
  if (!sesi) return <Masuk />;
  // AUTH-06: selama kata sandi masih sementara, hanya layar ganti sandi yang terbuka.
  if (sesi.wajibGantiSandi) {
    return <TataLetak><GantiSandi /></TataLetak>;
  }
  const rute = RUTE.map((r) => ({ r, m: jalur.match(r.pola) })).find((x) => x.m);
  // Menu yang tidak berhak tidak dirender; server tetap menolak aksinya (UI-02a).
  const isi = rute && boleh(rute.r.menu) ? rute.r.layar(rute.m!) : <TidakAda />;
  return <TataLetak>{isi}</TataLetak>;
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <PenyediaSesi>
      <Aplikasi />
      <WadahToast />
    </PenyediaSesi>
  </StrictMode>,
);
