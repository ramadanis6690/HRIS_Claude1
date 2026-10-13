// Membuat Super Admin pertama di basis data yang masih kosong (ASLI maupun UJI).
// Kata sandi sementara dicetak SEKALI ke layar dan wajib diganti saat login pertama.
//
//   npm run buat-super-admin -- --npp 19870001 --nama "Nama Lengkap" --email nama@dpjm.co.id
//
// Bila NPP sudah ada di data pegawai, pegawai itu yang diberi akun dan peran.
import { parseArgs } from 'node:util';
import { JENIS_KEPEGAWAIAN, type JenisKepegawaian } from '../src/bersama/aksi.js';
import { sakelarBawaan } from '../src/bersama/pegawai.js';
import { tanggalWIB } from '../src/core/tanggal.js';
import { POLA_EMAIL, POLA_NPP } from '../src/core/validasi.js';
import { buatSandiSementara, hashSandi } from '../src/server/auth.js';
import { bacaSatu, sambung, transaksi, tutup } from '../src/server/db.js';
import { bacaKonfig, muatBerkasEnv } from '../src/server/konfig.js';
import { tulis } from '../src/server/repo.js';

muatBerkasEnv();
const { values } = parseArgs({
  options: {
    npp: { type: 'string' },
    nama: { type: 'string' },
    email: { type: 'string' },
    jenis: { type: 'string', default: 'PKWTT' },
  },
});

function gagal(pesan: string): never {
  console.error(pesan);
  process.exit(1);
}

const npp = values.npp?.trim() ?? gagal('Wajib: --npp');
if (!POLA_NPP.test(npp)) gagal('NPP tidak sah');
const jenis = values.jenis as JenisKepegawaian;
if (!JENIS_KEPEGAWAIAN.includes(jenis)) gagal(`--jenis harus salah satu: ${JENIS_KEPEGAWAIAN.join(', ')}`);

sambung(bacaKonfig().databaseUrl);
try {
  const ada = await bacaSatu<{ id: string; nama_lengkap: string }>('SELECT id, nama_lengkap FROM pegawai WHERE npp = $1', [npp]);
  if (!ada) {
    if (!values.nama || !values.email) gagal('Pegawai dengan NPP itu belum ada: --nama dan --email wajib diisi.');
    if (!POLA_EMAIL.test(values.email)) gagal('Email tidak sah');
  }
  const sandi = buatSandiSementara();
  const hash = await hashSandi(sandi);
  const jejak = { pelaku: null, alasan: 'Penyiapan Super Admin pertama (skrip)' };
  const nama = await transaksi(async (tx) => {
    const p = ada ?? (await tulis<{ id: string; nama_lengkap: string }>('pegawai', 'tambah', {
      npp, nama_lengkap: values.nama!.trim(), email: values.email!.trim().toLowerCase(), jenis_kepegawaian: jenis,
      status_pegawai: 'aktif', ...sakelarBawaan(jenis),
    }, jejak, tx));
    if (!ada) {
      await tulis('riwayat_status', 'tambah', { pegawai_id: p.id, status: 'aktif', tgl_mulai: tanggalWIB(new Date()), keterangan: 'Status awal' }, jejak, tx);
    }
    const [akun] = await tx.query<{ id: string }>('SELECT id FROM pengguna WHERE pegawai_id = $1', [p.id]);
    if (akun) {
      await tulis('pengguna', 'ubah', { id: akun.id, hash_sandi: hash, wajib_ganti_sandi: true, aktif: true, gagal_login: 0, terkunci_sampai: null }, jejak, tx);
    } else {
      await tulis('pengguna', 'tambah', { pegawai_id: p.id, hash_sandi: hash, wajib_ganti_sandi: true }, jejak, tx);
    }
    const [peran] = await tx.query<{ id: string; aktif: boolean }>("SELECT id, aktif FROM peran_admin WHERE pegawai_id = $1 AND peran = 'super_admin'", [p.id]);
    if (!peran) await tulis('peran_admin', 'tambah', { pegawai_id: p.id, peran: 'super_admin' }, jejak, tx);
    else if (!peran.aktif) await tulis('peran_admin', 'ubah', { id: peran.id, aktif: true }, jejak, tx);
    return p.nama_lengkap;
  });
  console.log(`\nSuper Admin siap: ${nama} (NPP ${npp})`);
  console.log(`Kata sandi sementara (tampil sekali, wajib diganti saat login): ${sandi}\n`);
} finally {
  await tutup();
}
