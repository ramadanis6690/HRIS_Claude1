// Data contoh untuk pengembangan, lingkungan UJI, dan tes integrasi.
// Tidak ada data pegawai sungguhan (PRD K68).
import { tambahHari, tanggalWIB, hariIso, waktuDariWIB } from '../src/core/tanggal.js';
import { hashSandi } from '../src/server/auth.js';
import { bacaSatu, transaksi, type Tx } from '../src/server/db.js';
import { sakelarBawaan } from '../src/bersama/pegawai.js';
import { tulis } from '../src/server/repo.js';
import type { JenisKepegawaian, PeranAdmin } from '../src/bersama/aksi.js';

export const SANDI_CONTOH = 'Contoh#2026';
export const KANTOR_CONTOH = { nama: 'Kantor Pusat (contoh)', alamat: 'Jakarta — koordinat contoh, ganti di Pengaturan', lat: -6.229728, lng: 106.829518 };

interface Contoh {
  npp: string;
  nama: string;
  jabatan: string;
  unit: string | null;
  jenis: JenisKepegawaian;
  kelamin: 'L' | 'P';
  peran?: PeranAdmin[];
  gapok?: number;
  tunj?: number;
  masuk: string;
}

const PEGAWAI: Contoh[] = [
  { npp: 'C0001', nama: 'Bambang Sutrisno', jabatan: 'Direktur Utama', unit: null, jenis: 'Direksi', kelamin: 'L', masuk: '2021-03-01' },
  { npp: 'C0002', nama: 'Ratna Kusumawati', jabatan: 'Direktur', unit: null, jenis: 'Direksi', kelamin: 'P', masuk: '2021-03-01' },
  { npp: 'C0003', nama: 'Hendra Wijaya', jabatan: 'Dewan Pengawas', unit: null, jenis: 'Dewan Pengawas', kelamin: 'L', masuk: '2022-01-10' },
  { npp: 'C0004', nama: 'Siti Rahmawati', jabatan: 'Manager', unit: 'KSU', jenis: 'PKWTT', kelamin: 'P', gapok: 9_500_000, tunj: 4_000_000, masuk: '2015-07-01' },
  { npp: 'C0005', nama: 'Agus Prasetyo', jabatan: 'Manager', unit: 'KEU', jenis: 'PKWTT', kelamin: 'L', gapok: 9_800_000, tunj: 4_000_000, masuk: '2014-02-03' },
  { npp: 'C0006', nama: 'Dewi Lestari', jabatan: 'Manager', unit: 'INV', jenis: 'PKWTT', kelamin: 'P', gapok: 9_600_000, tunj: 4_000_000, masuk: '2016-09-12' },
  { npp: 'C0007', nama: 'Yusuf Hidayat', jabatan: 'Manager', unit: 'KMR', jenis: 'PKWTT', kelamin: 'L', gapok: 9_400_000, tunj: 4_000_000, masuk: '2017-04-18' },
  { npp: 'C0008', nama: 'Rina Marlina', jabatan: 'Manager', unit: 'IA', jenis: 'PKWTT', kelamin: 'P', gapok: 9_300_000, tunj: 4_000_000, masuk: '2018-01-08' },
  { npp: 'C0009', nama: 'Fajar Nugroho', jabatan: 'Senior Officer', unit: 'KSU', jenis: 'PKWTT', kelamin: 'L', peran: ['admin_hrd'], gapok: 6_200_000, tunj: 1_850_000, masuk: '2019-05-06' },
  { npp: 'C0010', nama: 'Maya Anggraini', jabatan: 'Officer', unit: 'KSU', jenis: 'PKWTT', kelamin: 'P', peran: ['super_admin'], gapok: 5_100_000, tunj: 1_500_000, masuk: '2020-08-17' },
  { npp: 'C0011', nama: 'Rudi Hartono', jabatan: 'Specialist', unit: 'KEU', jenis: 'PKWTT', kelamin: 'L', peran: ['admin_payroll'], gapok: 7_400_000, tunj: 3_000_000, masuk: '2016-11-01' },
  { npp: 'C0012', nama: 'Lina Susanti', jabatan: 'Bendahara', unit: 'KEU', jenis: 'PKWTT', kelamin: 'P', peran: ['admin_finance'], gapok: 6_000_000, tunj: 2_000_000, masuk: '2018-06-04' },
  { npp: 'C0013', nama: 'Teguh Santoso', jabatan: 'Senior Officer', unit: 'IA', jenis: 'PKWTT', kelamin: 'L', peran: ['auditor'], gapok: 6_100_000, tunj: 1_850_000, masuk: '2019-02-11' },
  { npp: 'C0014', nama: 'Nur Aisyah', jabatan: 'Officer', unit: 'INV', jenis: 'PKWTT', kelamin: 'P', gapok: 3_090_000, tunj: 1_500_000, masuk: '2023-01-09' },
  { npp: 'C0015', nama: 'Eko Saputra', jabatan: 'Assistant Manager', unit: 'INV', jenis: 'PKWTT', kelamin: 'L', gapok: 8_000_000, tunj: 2_250_000, masuk: '2017-10-02' },
  { npp: 'C0016', nama: 'Putri Handayani', jabatan: 'Officer', unit: 'KMR', jenis: 'PKWT', kelamin: 'P', gapok: 4_800_000, masuk: '2025-02-03' },
  { npp: 'C0017', nama: 'Andi Firmansyah', jabatan: 'Staf', unit: 'KEU', jenis: 'PKWT', kelamin: 'L', gapok: 4_500_000, masuk: '2025-06-02' },
  { npp: 'C0018', nama: 'Wulan Sari', jabatan: 'Officer', unit: 'IA', jenis: 'Penugasan', kelamin: 'P', masuk: '2024-04-01' },
  { npp: 'C0019', nama: 'Joko Susilo', jabatan: 'Caraka', unit: 'KSU', jenis: 'Outsource', kelamin: 'L', masuk: '2022-07-01' },
  { npp: 'C0020', nama: 'Indah Permatasari', jabatan: 'Staf', unit: 'KSU', jenis: 'PKWT', kelamin: 'P', gapok: 4_400_000, masuk: '2026-07-01' },
];

const jejak = { pelaku: null, alasan: 'Data contoh (isi-contoh)' };

async function idDari(tx: Tx, tabel: 'unit' | 'jabatan', kolom: 'kode' | 'nama', nilai: string): Promise<string> {
  const [r] = await tx.query<{ id: string }>(`SELECT id FROM ${tabel} WHERE ${kolom} = $1`, [nilai]);
  if (!r) throw new Error(`${tabel} ${nilai} tidak ada — jalankan npm run migrasi lebih dulu`);
  return r.id;
}

/** NIK contoh: 16 digit, jelas palsu (diawali 9999). */
const nikContoh = (i: number) => `9999${String(i).padStart(12, '0')}`;


/** Mengisi data contoh. Mengembalikan false bila sudah ada (tidak mengubah apa pun). */
export async function isiContoh(): Promise<boolean> {
  if (await bacaSatu("SELECT 1 FROM pegawai WHERE npp = 'C0001'")) return false;
  const hash = await hashSandi(SANDI_CONTOH);
  const hariIni = tanggalWIB(new Date());

  await transaksi(async (tx) => {
    const kantor = await tulis<{ id: string }>('titik_kantor', 'tambah', { ...KANTOR_CONTOH, radius_m: 100 }, jejak, tx);
    const id = new Map<string, string>();
    for (const [i, c] of PEGAWAI.entries()) {
      const p = await tulis<{ id: string }>('pegawai', 'tambah', {
        npp: c.npp, nama_lengkap: c.nama, email: `${c.npp.toLowerCase()}@contoh.dpjm.test`, nik: nikContoh(i + 1),
        jenis_kelamin: c.kelamin, jenis_kepegawaian: c.jenis, status_pegawai: 'aktif',
        unit_id: c.unit ? await idDari(tx, 'unit', 'kode', c.unit) : null,
        jabatan_id: await idDari(tx, 'jabatan', 'nama', c.jabatan),
        tgl_masuk: c.masuk, tempat_lahir: 'Jakarta', tanggal_lahir: `${1975 + (i % 20)}-0${(i % 9) + 1}-1${i % 9}`,
        agama: 'Islam', kewarganegaraan: 'Indonesia', no_hp: `08120000${String(i + 1).padStart(4, '0')}`,
        alamat_domisili: 'Alamat contoh, Jakarta', pendidikan_terakhir: 'S1', ptkp: i % 3 === 0 ? 'K/1' : 'TK/0',
        ...sakelarBawaan(c.jenis),
        tgl_akhir_kontrak: c.jenis === 'PKWT' ? tambahHari(hariIni, 20 + i) : null,
      }, jejak, tx);
      id.set(c.npp, p.id);
      await tulis('riwayat_status', 'tambah', { pegawai_id: p.id, status: 'aktif', tgl_mulai: c.masuk, keterangan: 'Status awal' }, jejak, tx);
      await tulis('pengguna', 'tambah', { pegawai_id: p.id, hash_sandi: hash, wajib_ganti_sandi: false }, jejak, tx);
      for (const r of c.peran ?? []) await tulis('peran_admin', 'tambah', { pegawai_id: p.id, peran: r }, jejak, tx);
      if (i % 4 !== 3) {
        await tulis('keluarga', 'tambah', {
          pegawai_id: p.id, nama: `Keluarga ${c.nama.split(' ')[0]}`, hubungan: c.kelamin === 'L' ? 'Istri' : 'Suami',
          no_hp: `08130000${String(i + 1).padStart(4, '0')}`, kontak_darurat: true, ditanggung: true, ahli_waris: true,
        }, jejak, tx);
      }
      await tulis('pendidikan', 'tambah', { pegawai_id: p.id, jenjang: 'S1', institusi: 'Universitas Contoh', jurusan: 'Manajemen', tahun_lulus: 2000 + (i % 15) }, jejak, tx);
      const komponen = async (kode: string, nominal: number) => {
        const [k] = await tx.query<{ id: string }>('SELECT id FROM komponen_gaji WHERE kode = $1', [kode]);
        await tulis('gaji', 'tambah', { pegawai_id: p.id, komponen_id: k!.id, nominal, berlaku_mulai: c.masuk, no_sk: 'SK-CONTOH' }, jejak, tx);
      };
      if (c.gapok) await komponen('GAJI_POKOK', c.gapok);
      if (c.tunj) await komponen('TUNJ_JABATAN', c.tunj);
    }

    // Direktur pembina (PRD §4.1): Dirut untuk KMR & IA, Direktur untuk KSU, KEU, INV.
    for (const [kode, npp] of [['KMR', 'C0001'], ['IA', 'C0001'], ['KSU', 'C0002'], ['KEU', 'C0002'], ['INV', 'C0002']] as const) {
      const u = await idDari(tx, 'unit', 'kode', kode);
      await tulis('unit', 'ubah', { id: u, direktur_pembina_id: id.get(npp) }, jejak, tx);
    }

    // Presensi 10 hari kerja terakhir untuk pegawai wajib presensi (tanpa foto).
    for (let h = 14; h >= 1; h--) {
      const t = tambahHari(hariIni, -h);
      if (hariIso(t) > 5) continue;
      for (const [i, c] of PEGAWAI.entries()) {
        if (c.jenis === 'Dewan Pengawas' || (i + h) % 9 === 0) continue; // sesekali tidak hadir
        const telat = (i + h) % 5 === 0 ? 7 + ((i * h) % 25) : 0;
        const masuk = waktuDariWIB(t, `07:${String(40 + (i % 15)).padStart(2, '0')}`);
        const masukPada = new Date(masuk.getTime() + telat * 60_000 + (telat ? 20 * 60_000 : 0));
        const lupaPulang = (i + h) % 13 === 0;
        await tulis('presensi', 'tambah', {
          pegawai_id: id.get(c.npp), tanggal: t, masuk_pada: masukPada, masuk_lat: KANTOR_CONTOH.lat + 0.0002, masuk_lng: KANTOR_CONTOH.lng, masuk_akurasi: 12,
          pulang_pada: lupaPulang ? null : waktuDariWIB(t, `17:${String(5 + (i % 40)).padStart(2, '0')}`),
          pulang_lat: lupaPulang ? null : KANTOR_CONTOH.lat, pulang_lng: lupaPulang ? null : KANTOR_CONTOH.lng,
          titik_kantor_id: kantor.id, jarak_m: 22.24, radius_saat_itu: 100, dalam_radius: true,
          bypass_saat_itu: c.jenis === 'Direksi', jam_masuk_saat_itu: '08:00', jam_pulang_saat_itu: '17:00', toleransi_saat_itu: 0,
          menit_terlambat: telat ? Math.max(0, Math.floor((masukPada.getTime() - waktuDariWIB(t, '08:00').getTime()) / 60000)) : 0,
          sumber: 'check_in',
        }, jejak, tx);
      }
    }
  });

  return true;
}
