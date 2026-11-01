// Mengisi DATA CONTOH untuk pengembangan dan lingkungan UJI. Tidak ada data
// pegawai sungguhan di sini (PRD K68), dan skrip ini MENOLAK berjalan di ASLI.
//
//   npm run isi-contoh
//
// Semua akun contoh memakai kata sandi `Contoh#2026` dan tidak diwajibkan
// mengganti sandi, supaya uji alur bisa langsung dimulai.
import { sambung, tutup } from '../src/server/db.js';
import { bacaKonfig, muatBerkasEnv } from '../src/server/konfig.js';
import { isiContoh, SANDI_CONTOH } from './data-contoh.js';

muatBerkasEnv();
const konfig = bacaKonfig();
if (konfig.lingkungan === 'asli') {
  console.error('isi-contoh menolak berjalan di lingkungan ASLI.');
  process.exit(1);
}

sambung(konfig.databaseUrl);
try {
  if (!(await isiContoh())) {
    console.log('Data contoh sudah ada. Tidak ada yang diubah.');
  } else {
    console.log('\nData contoh siap: 20 pegawai, 1 titik kantor, presensi 2 minggu terakhir.');
    console.log(`Semua akun contoh memakai kata sandi: ${SANDI_CONTOH}`);
    console.log('  C0010  Super Admin            C0009  Admin HRD');
    console.log('  C0011  Admin Payroll          C0012  Admin Finance');
    console.log('  C0013  Auditor                C0004  Manager KSU');
    console.log('  C0002  Direktur               C0014  Staff (Investasi)\n');
  }
} finally {
  await tutup();
}
