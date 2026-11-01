// Struktur menu (design_final.md §10.3). Yang tampil dihitung server dari
// posisi struktural dan peran admin (InfoSesi.menu); server tetap menolak aksinya
// bila alamatnya dibuka langsung.
import type { KunciMenu } from '../bersama/aksi.js';

export interface ItemMenu {
  kunci: KunciMenu;
  label: string;
  jalur: string;
  ikon: string;
  seksi: 'HARIAN' | 'SAYA' | 'PEGAWAI' | 'LAPORAN' | 'SISTEM';
}

export const MENU: readonly ItemMenu[] = [
  { kunci: 'beranda', label: 'Beranda', jalur: '/', ikon: 'beranda', seksi: 'HARIAN' },
  { kunci: 'presensi', label: 'Presensi', jalur: '/presensi', ikon: 'jam', seksi: 'HARIAN' },
  { kunci: 'rekap_kehadiran', label: 'Rekap Kehadiran', jalur: '/rekap-kehadiran', ikon: 'rekap', seksi: 'HARIAN' },
  { kunci: 'profil', label: 'Profil & e-CV', jalur: '/profil', ikon: 'profil', seksi: 'SAYA' },
  { kunci: 'ubah_sandi', label: 'Ubah Kata Sandi', jalur: '/ubah-sandi', ikon: 'kunci', seksi: 'SAYA' },
  { kunci: 'data_pegawai', label: 'Data Pegawai', jalur: '/pegawai', ikon: 'pegawai', seksi: 'PEGAWAI' },
  { kunci: 'gaji_pokok', label: 'Gaji Pokok', jalur: '/gaji-pokok', ikon: 'uang', seksi: 'PEGAWAI' },
  { kunci: 'audit_log', label: 'Audit Log', jalur: '/audit-log', ikon: 'perisai', seksi: 'LAPORAN' },
  { kunci: 'user_management', label: 'User Management', jalur: '/pengguna', ikon: 'pengguna', seksi: 'SISTEM' },
  { kunci: 'pengaturan', label: 'Pengaturan', jalur: '/pengaturan', ikon: 'gir', seksi: 'SISTEM' },
  { kunci: 'status_sistem', label: 'Status Sistem', jalur: '/status-sistem', ikon: 'server', seksi: 'SISTEM' },
];

export const SEKSI = ['HARIAN', 'SAYA', 'PEGAWAI', 'LAPORAN', 'SISTEM'] as const;
