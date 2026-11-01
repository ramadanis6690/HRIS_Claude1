// Galat yang dikirim ke browser berupa kalimat yang bisa ditindaklanjuti
// (design_final.md §10.6). Rinciannya hanya masuk log server.
import type { Galat } from '../bersama/aksi.js';
import { GalatMasukan } from '../core/validasi.js';
import { log } from './log.js';
import { GalatTidakAda } from './repo.js';

export class GalatAplikasi extends Error {
  constructor(
    readonly kode: string,
    pesan: string,
    readonly kolom?: string,
  ) {
    super(pesan);
    this.name = 'GalatAplikasi';
  }
}

export const galat = (kode: string, pesan: string, kolom?: string) => new GalatAplikasi(kode, pesan, kolom);

export const ditolak = () => galat('DITOLAK', 'Anda tidak berhak melakukan ini.');

/** Pesan untuk constraint basis data yang bisa dilanggar pengguna. */
const PESAN_CONSTRAINT: Record<string, { kolom?: string; pesan: string }> = {
  pegawai_npp_unik: { kolom: 'npp', pesan: 'NPP sudah dipakai pegawai lain.' },
  pegawai_email_unik: { kolom: 'email', pesan: 'Email sudah dipakai pegawai lain.' },
  pegawai_nik_16_digit: { kolom: 'nik', pesan: 'NIK harus tepat 16 digit angka.' },
  pegawai_berhenti_wajib_tanggal: { kolom: 'tgl_berhenti', pesan: 'Tanggal berhenti wajib diisi untuk status Berhenti.' },
  keluarga_nik_16_digit: { kolom: 'nik', pesan: 'NIK harus tepat 16 digit angka.' },
  keluarga_kontak_darurat_perlu_hp: { kolom: 'no_hp', pesan: 'Kontak darurat wajib punya nomor HP.' },
  gaji_tanpa_tumpang_tindih: { kolom: 'berlakuMulai', pesan: 'Periode gaji bertumpang tindih dengan versi lain.' },
  gaji_urut: { kolom: 'berlakuMulai', pesan: 'Tanggal berlaku tidak urut.' },
  unit_kode_unik: { kolom: 'kode', pesan: 'Kode unit sudah dipakai.' },
  tabel_grade_unik: { kolom: 'subGrade', pesan: 'Grade, sub grade, dan tanggal berlaku itu sudah ada.' },
  tabel_grade_rentang: { kolom: 'gapokMin', pesan: 'Gapok minimum lebih besar dari maksimum.' },
  jam_kerja_berlaku_unik: { kolom: 'berlakuMulai', pesan: 'Sudah ada jam kerja yang berlaku mulai tanggal itu.' },
  jam_kerja_hari_sah: { kolom: 'hariKerja', pesan: 'Pilih minimal satu hari kerja.' },
  presensi_orang_hari_unik: { pesan: 'Presensi untuk tanggal itu sudah ada.' },
  presensi_koreksi_wajib_alasan: { kolom: 'alasan', pesan: 'Alasan koreksi wajib diisi.' },
  presensi_pulang_setelah_masuk: { kolom: 'jamPulang', pesan: 'Jam pulang harus setelah jam masuk.' },
  hari_libur_pkey: { kolom: 'tanggal', pesan: 'Tanggal itu sudah terdaftar sebagai hari libur.' },
  pengguna_pegawai_unik: { pesan: 'Pegawai ini sudah punya akun.' },
  peran_admin_unik: { pesan: 'Peran itu sudah diberikan.' },
};

interface GalatPg {
  code?: string;
  constraint?: string;
}

export function keGalat(e: unknown, konteks: Record<string, unknown> = {}): Galat {
  if (e instanceof GalatAplikasi) return { kode: e.kode, pesan: e.message, ...(e.kolom ? { kolom: e.kolom } : {}) };
  if (e instanceof GalatMasukan) return { kode: 'MASUKAN', pesan: e.message, kolom: e.kolom };
  if (e instanceof GalatTidakAda) return { kode: 'TIDAK_ADA', pesan: 'Data tidak ditemukan. Muat ulang layar lalu coba lagi.' };

  const pg = e as GalatPg;
  if (pg && typeof pg.code === 'string') {
    const c = pg.constraint ? PESAN_CONSTRAINT[pg.constraint] : undefined;
    if (c && ['23505', '23514', '23P01'].includes(pg.code)) {
      return { kode: pg.code === '23505' ? 'KONFLIK' : 'MASUKAN', pesan: c.pesan, ...(c.kolom ? { kolom: c.kolom } : {}) };
    }
    if (pg.code === '42501') {
      // Basis data menolak (mis. DELETE atau UPDATE audit_log). Ini tanda bug, bukan salah pengguna.
      log.galat('Basis data menolak hak akses', e, konteks);
      return { kode: 'DITOLAK', pesan: 'Basis data menolak perubahan ini.' };
    }
  }
  log.galat('Galat tak terduga', e, konteks);
  return { kode: 'SERVER', pesan: 'Terjadi galat di server. Coba lagi; bila berulang, hubungi Admin.' };
}
