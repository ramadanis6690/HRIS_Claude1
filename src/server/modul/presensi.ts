// Presensi GPS + foto (design_final.md §8.1, SRS ATT-*, LOC-*).
// Waktu, jarak, dan keterlambatan dihitung di sini dari jam server; nilai dari
// browser selain koordinat mentah dan foto diabaikan.
import type { BarisPresensiPegawai, PercobaanLuarRadius, PresensiHariIni, PresensiRingkas } from '../../bersama/aksi.js';
import type { TitikKantor } from '../../core/jarak.js';
import { koordinatSah } from '../../core/jarak.js';
import { hitungCheckOut, hitungMenitPulangCepat, hitungMenitTerlambat, nilaiCheckIn, pesanLuarRadius, type JamKerjaBerlaku } from '../../core/kehadiran.js';
import { akhirBulan, hariKerja, menitDariJam, tanggalWIB, waktuDariWIB, type Tanggal } from '../../core/tanggal.js';
import { angkaWajib, objek, tanggalWajib, teksOpsional, teksWajib, uuidWajib } from '../../core/validasi.js';
import * as berkas from '../berkas.js';
import { baca, bacaSatu, transaksi } from '../db.js';
import { ditolak, galat, GalatAplikasi } from '../galat.js';
import { punyaSalahSatu, unitDiawasi, type Pengguna } from '../izin.js';
import { tulis } from '../repo.js';

// ---------------------------------------------------------------------------
// Bacaan bersama
// ---------------------------------------------------------------------------

export async function jamKerjaPada(tanggal: Tanggal): Promise<JamKerjaBerlaku & { batasSusulanHari: number }> {
  const j = await bacaSatu<{ jam_masuk: string; jam_pulang: string; toleransi_menit: number; hari_kerja: number[]; batas_susulan_hari: number }>(
    'SELECT jam_masuk, jam_pulang, toleransi_menit, hari_kerja, batas_susulan_hari FROM jam_kerja WHERE berlaku_mulai <= $1 ORDER BY berlaku_mulai DESC LIMIT 1',
    [tanggal],
  );
  if (!j) {
    // Tidak menebak: jam kerja wajib diisi di Pengaturan sebelum presensi dinilai.
    throw galat('ATURAN', 'Jam kerja belum ditetapkan untuk tanggal ini. Hubungi Admin HRD.');
  }
  return {
    jamMasuk: j.jam_masuk.slice(0, 5),
    jamPulang: j.jam_pulang.slice(0, 5),
    toleransiMenit: j.toleransi_menit,
    hariKerja: j.hari_kerja,
    batasSusulanHari: j.batas_susulan_hari,
  };
}

export async function liburAntara(mulai: Tanggal, akhir: Tanggal): Promise<Set<Tanggal>> {
  const rows = await baca<{ tanggal: string }>('SELECT tanggal FROM hari_libur WHERE aktif AND tanggal BETWEEN $1 AND $2', [mulai, akhir]);
  return new Set(rows.map((r) => r.tanggal));
}

async function titikAktif(): Promise<TitikKantor[]> {
  const rows = await baca<{ id: string; nama: string; lat: number; lng: number; radius_m: number }>(
    'SELECT id, nama, lat, lng, radius_m FROM titik_kantor WHERE aktif',
  );
  return rows.map((r) => ({ id: r.id, nama: r.nama, lat: r.lat, lng: r.lng, radiusM: r.radius_m }));
}

/** Dinas yang disetujui pada tanggal itu (tabel diisi mulai Fase 2). */
async function dinasAktif(pegawaiId: string, tanggal: Tanggal): Promise<boolean> {
  const r = await bacaSatu(
    `SELECT 1 FROM detail_dinas d JOIN pengajuan p ON p.id = d.pengajuan_id
      WHERE p.pegawai_id = $1 AND p.status = 'disetujui' AND d.aktif AND $2 BETWEEN d.tgl_berangkat AND d.tgl_kembali`,
    [pegawaiId, tanggal],
  );
  return r !== null;
}

interface BarisPresensi {
  id: string;
  pegawai_id: string;
  tanggal: string;
  masuk_pada: Date | null;
  pulang_pada: Date | null;
  sumber: PresensiRingkas['sumber'];
  nama_kantor: string | null;
  jarak_m: number | null;
  dalam_radius: boolean | null;
  bypass_saat_itu: boolean | null;
  menit_terlambat: number;
  menit_pulang_cepat: number;
  foto_file_id: string | null;
  foto_dihapus_pada: Date | null;
  alasan_koreksi: string | null;
  jam_pulang_saat_itu: string | null;
  jam_masuk_saat_itu: string | null;
  toleransi_saat_itu: number | null;
}

const PILIH_PRESENSI = `
  SELECT pr.id, pr.pegawai_id, pr.tanggal, pr.masuk_pada, pr.pulang_pada, pr.sumber, tk.nama AS nama_kantor,
         pr.jarak_m, pr.dalam_radius, pr.bypass_saat_itu, pr.menit_terlambat, pr.menit_pulang_cepat,
         pr.foto_file_id, pr.foto_dihapus_pada, pr.alasan_koreksi, pr.jam_pulang_saat_itu, pr.jam_masuk_saat_itu,
         pr.toleransi_saat_itu
    FROM presensi pr LEFT JOIN titik_kantor tk ON tk.id = pr.titik_kantor_id`;

export function keRingkas(r: BarisPresensi): PresensiRingkas {
  const adaFoto = r.foto_file_id !== null && r.foto_dihapus_pada === null;
  return {
    id: r.id,
    tanggal: r.tanggal,
    masukPada: r.masuk_pada?.toISOString() ?? null,
    pulangPada: r.pulang_pada?.toISOString() ?? null,
    sumber: r.sumber,
    namaKantor: r.nama_kantor,
    jarakM: r.jarak_m,
    dalamRadius: r.dalam_radius,
    bypass: r.bypass_saat_itu,
    menitTerlambat: r.menit_terlambat,
    menitPulangCepat: r.menit_pulang_cepat,
    adaFoto,
    fotoBerkasId: adaFoto ? r.foto_file_id : null,
    alasanKoreksi: r.alasan_koreksi,
  };
}

async function presensiPada(pegawaiId: string, tanggal: Tanggal): Promise<BarisPresensi | null> {
  return bacaSatu<BarisPresensi>(`${PILIH_PRESENSI} WHERE pr.pegawai_id = $1 AND pr.tanggal = $2`, [pegawaiId, tanggal]);
}

async function presensiId(id: string): Promise<BarisPresensi> {
  const r = await bacaSatu<BarisPresensi>(`${PILIH_PRESENSI} WHERE pr.id = $1`, [id]);
  if (!r) throw galat('TIDAK_ADA', 'Presensi tidak ditemukan.');
  return r;
}

interface FlagPegawai {
  wajib_presensi: boolean;
  bypass_gps: boolean;
  titik_kantor_id: string | null;
}

async function flagPegawai(pegawaiId: string): Promise<FlagPegawai> {
  const p = await bacaSatu<FlagPegawai>('SELECT wajib_presensi, bypass_gps, titik_kantor_id FROM pegawai WHERE id = $1', [pegawaiId]);
  if (!p) throw galat('TIDAK_ADA', 'Data pegawai tidak ditemukan.');
  return p;
}

function posisiDari(data: Record<string, unknown>) {
  const lat = angkaWajib(data, 'lat', { min: -90, maks: 90 });
  const lng = angkaWajib(data, 'lng', { min: -180, maks: 180 });
  const akurasi = angkaWajib(data, 'akurasi', { min: 0 });
  if (!koordinatSah({ lat, lng })) throw galat('MASUKAN', 'Koordinat tidak sah.', 'lat');
  return { lat, lng, akurasi };
}

// ---------------------------------------------------------------------------
// Aksi pegawai
// ---------------------------------------------------------------------------

export async function hariIni(u: Pengguna, sekarang = new Date()): Promise<PresensiHariIni> {
  const tanggal = tanggalWIB(sekarang);
  const [jk, libur, flag, pr] = await Promise.all([
    jamKerjaPada(tanggal), liburAntara(tanggal, tanggal), flagPegawai(u.pegawaiId), presensiPada(u.pegawaiId, tanggal),
  ]);
  const tombol = !pr ? 'check_in' : pr.masuk_pada && !pr.pulang_pada ? 'check_out' : null;
  return {
    tanggal,
    waktuServer: sekarang.toISOString(),
    hariKerja: hariKerja(tanggal, jk.hariKerja, libur),
    wajibPresensi: flag.wajib_presensi,
    jamMasuk: jk.jamMasuk,
    jamPulang: jk.jamPulang,
    presensi: pr ? keRingkas(pr) : null,
    tombol,
  };
}

export async function checkIn(u: Pengguna, data: unknown): Promise<PresensiRingkas> {
  const d = objek(data);
  const posisi = posisiDari(d);
  const foto = berkas.bacaBase64(d.foto, 'foto', 'presensi', ['image/jpeg']);
  const sekarang = new Date(); // ATT-02: jam server, bukan jam HP
  const tanggal = tanggalWIB(sekarang);

  const [flag, jk, libur, titik, dinas, ada] = await Promise.all([
    flagPegawai(u.pegawaiId), jamKerjaPada(tanggal), liburAntara(tanggal, tanggal), titikAktif(),
    dinasAktif(u.pegawaiId, tanggal), presensiPada(u.pegawaiId, tanggal),
  ]);

  const h = nilaiCheckIn({
    sekarang, posisi, sudahCheckIn: ada !== null, dinasAktif: dinas, bypassGps: flag.bypass_gps,
    wajibPresensi: flag.wajib_presensi, titikTerkunciId: flag.titik_kantor_id, titikAktif: titik, jamKerja: jk, libur,
  });

  if (h.hasil === 'sudah_check_in') throw galat('SUDAH_CHECK_IN', 'Anda sudah check-in hari ini.');
  if (h.hasil === 'akurasi_lemah') {
    throw galat('AKURASI_LEMAH', `Sinyal GPS lemah (±${Math.round(h.akurasi)} m). Coba lagi di dekat jendela atau di luar ruangan.`);
  }

  const dibuat: string[] = [];
  try {
    if (h.hasil === 'luar_radius') {
      // LOC-06: percobaannya tetap disimpan beserta fotonya, lalu ditolak dengan jaraknya.
      await transaksi(async (tx) => {
        const f = await berkas.simpan(tx, { ...foto, golongan: 'presensi', namaAsli: `percobaan-${tanggal}.jpg`, pelaku: u.pegawaiId, sekarang });
        dibuat.push(f.jalur);
        await tulis('percobaan_check_in', 'tambah', {
          pegawai_id: u.pegawaiId, waktu: sekarang, lat: posisi.lat, lng: posisi.lng, akurasi: posisi.akurasi,
          titik_kantor_id: h.titik.id, jarak_m: Math.round(h.jarakM * 100) / 100, radius: h.titik.radiusM,
          foto_file_id: f.id, status: 'ditolak',
        }, { pelaku: u.pegawaiId }, tx);
      });
      throw galat('LUAR_RADIUS', pesanLuarRadius(h.titik.nama, h.jarakM, h.titik.radiusM));
    }

    const p = h.presensi;
    const id = await transaksi(async (tx) => {
      const f = await berkas.simpan(tx, { ...foto, golongan: 'presensi', namaAsli: `presensi-${tanggal}.jpg`, pelaku: u.pegawaiId, sekarang });
      dibuat.push(f.jalur);
      const baris = await tulis<{ id: string }>('presensi', 'tambah', {
        pegawai_id: u.pegawaiId, tanggal: p.tanggal, masuk_pada: sekarang, masuk_lat: posisi.lat, masuk_lng: posisi.lng,
        masuk_akurasi: posisi.akurasi, foto_file_id: f.id, titik_kantor_id: p.titikKantorId, jarak_m: p.jarakM,
        radius_saat_itu: p.radiusSaatItu, dalam_radius: p.dalamRadius, bypass_saat_itu: p.bypassSaatItu,
        jam_masuk_saat_itu: p.jamMasukSaatItu, jam_pulang_saat_itu: p.jamPulangSaatItu, toleransi_saat_itu: p.toleransiSaatItu,
        menit_terlambat: p.menitTerlambat, sumber: p.sumber,
      }, { pelaku: u.pegawaiId }, tx);
      return baris.id;
    });
    return keRingkas(await presensiId(id));
  } catch (e) {
    // Percobaan luar radius sudah tersimpan bersama fotonya; selain itu, foto yang
    // telanjur ditulis ke cakram dibuang supaya tidak ada berkas yatim.
    if (!(e instanceof GalatAplikasi && e.kode === 'LUAR_RADIUS')) await berkas.hapusBilaGagal(dibuat);
    // ATT-04: dua permintaan bersamaan — yang kedua ditolak indeks unik.
    const pg = e as { code?: string; constraint?: string };
    if (pg.code === '23505' && pg.constraint === 'presensi_orang_hari_unik') {
      throw galat('SUDAH_CHECK_IN', 'Anda sudah check-in hari ini.');
    }
    throw e;
  }
}

export async function checkOut(u: Pengguna, data: unknown): Promise<PresensiRingkas> {
  const posisi = posisiDari(objek(data));
  const sekarang = new Date();
  const tanggal = tanggalWIB(sekarang);
  const pr = await presensiPada(u.pegawaiId, tanggal);
  if (!pr || !pr.masuk_pada) throw galat('BELUM_CHECK_IN', 'Anda belum check-in hari ini.');
  if (pr.pulang_pada) throw galat('SUDAH_LENGKAP', 'Presensi hari ini sudah lengkap.');
  const [flag, jk, libur] = await Promise.all([flagPegawai(u.pegawaiId), jamKerjaPada(tanggal), liburAntara(tanggal, tanggal)]);
  const { menitPulangCepat } = hitungCheckOut({
    sekarang, tanggalPresensi: tanggal, sumber: pr.sumber, wajibPresensi: flag.wajib_presensi,
    jamPulangSaatItu: pr.jam_pulang_saat_itu?.slice(0, 5) ?? null, hariKerjaIso: jk.hariKerja, libur,
  });
  await tulis('presensi', 'ubah', {
    id: pr.id, pulang_pada: sekarang, pulang_lat: posisi.lat, pulang_lng: posisi.lng, menit_pulang_cepat: menitPulangCepat,
  }, { pelaku: u.pegawaiId });
  return keRingkas(await presensiId(pr.id));
}

export async function riwayatSaya(u: Pengguna, data: unknown): Promise<PresensiRingkas[]> {
  const bulan = teksWajib(objek(data), 'bulan', { maks: 7, pola: /^\d{4}-(0[1-9]|1[0-2])$/, pesanPola: 'Format bulan yyyy-MM' });
  const mulai = `${bulan}-01`;
  const rows = await baca<BarisPresensi>(
    `${PILIH_PRESENSI} WHERE pr.pegawai_id = $1 AND pr.tanggal BETWEEN $2 AND $3 ORDER BY pr.tanggal DESC`,
    [u.pegawaiId, mulai, akhirBulan(mulai)],
  );
  return rows.map(keRingkas);
}

// ---------------------------------------------------------------------------
// Aksi HRD dan atasan
// ---------------------------------------------------------------------------

/** HRD dan Super Admin melihat semua; atasan hanya unit yang diawasinya (OTZ-03). */
export async function daftar(u: Pengguna, data: unknown): Promise<BarisPresensiPegawai[]> {
  const tanggal = tanggalWajib(objek(data), 'tanggal');
  const semua = punyaSalahSatu(u, ['admin_hrd', 'super_admin']);
  const unit = semua ? null : await unitDiawasi(u);
  if (!semua && unit!.length === 0) throw ditolak();

  const [jk, libur] = await Promise.all([jamKerjaPada(tanggal), liburAntara(tanggal, tanggal)]);
  const kerja = hariKerja(tanggal, jk.hariKerja, libur);
  const pegawai = await baca<{ id: string; nama: string; npp: string; unit: string | null; wajib_presensi: boolean }>(
    `SELECT p.id, p.nama_lengkap AS nama, p.npp, un.nama AS unit, p.wajib_presensi
       FROM pegawai p LEFT JOIN unit un ON un.id = p.unit_id LEFT JOIN jabatan j ON j.id = p.jabatan_id
      WHERE p.aktif AND ($1::uuid[] IS NULL OR (p.unit_id = ANY($1::uuid[]) AND p.id <> $2))
      ORDER BY un.nama NULLS LAST, p.nama_lengkap`,
    [unit, u.pegawaiId],
  );
  const pr = await baca<BarisPresensi>(`${PILIH_PRESENSI} WHERE pr.tanggal = $1`, [tanggal]);
  const perPegawai = new Map(pr.map((r) => [r.pegawai_id, r]));
  return pegawai.map((p) => {
    const r = perPegawai.get(p.id) ?? null;
    const keadaan: BarisPresensiPegawai['keadaan'] = r
      ? r.pulang_pada || r.sumber === 'dinas_luar' ? 'lengkap' : 'tanpa_check_out'
      : !kerja ? 'libur' : !p.wajib_presensi ? 'tidak_wajib' : 'belum_masuk';
    return { pegawaiId: p.id, nama: p.nama, npp: p.npp, unit: p.unit, wajibPresensi: p.wajib_presensi, presensi: r ? keRingkas(r) : null, keadaan };
  });
}

/**
 * ATT-12: koreksi atau pembuatan presensi oleh Admin HRD, alasan wajib.
 * Barisnya ditandai `koreksi_hr`; nilai sebelumnya tetap terbaca di Audit Log.
 */
export async function koreksi(u: Pengguna, data: unknown): Promise<PresensiRingkas> {
  const d = objek(data);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const tanggal = tanggalWajib(d, 'tanggal');
  const jamMasuk = teksOpsional(d, 'jamMasuk', { maks: 5, pola: /^([01]\d|2[0-3]):[0-5]\d$/, pesanPola: 'Format jam HH:MM' });
  const jamPulang = teksOpsional(d, 'jamPulang', { maks: 5, pola: /^([01]\d|2[0-3]):[0-5]\d$/, pesanPola: 'Format jam HH:MM' });
  const alasan = teksWajib(d, 'alasan', { maks: 500 });
  if (!jamMasuk && !jamPulang) throw galat('MASUKAN', 'Isi jam masuk atau jam pulang.', 'jamMasuk');
  if (jamMasuk && jamPulang && menitDariJam(jamPulang) < menitDariJam(jamMasuk)) {
    throw galat('MASUKAN', 'Jam pulang harus setelah jam masuk.', 'jamPulang');
  }
  if (tanggal > tanggalWIB(new Date())) throw galat('MASUKAN', 'Tanggal koreksi tidak boleh di masa depan.', 'tanggal');

  const [flag, jk, libur, ada] = await Promise.all([
    flagPegawai(pegawaiId), jamKerjaPada(tanggal), liburAntara(tanggal, tanggal), presensiPada(pegawaiId, tanggal),
  ]);
  const dinilai = flag.wajib_presensi && hariKerja(tanggal, jk.hariKerja, libur);
  const potretMasuk = ada?.jam_masuk_saat_itu?.slice(0, 5) ?? jk.jamMasuk;
  const potretPulang = ada?.jam_pulang_saat_itu?.slice(0, 5) ?? jk.jamPulang;
  const potretToleransi = ada?.toleransi_saat_itu ?? jk.toleransiMenit;

  const masukPada = jamMasuk ? waktuDariWIB(tanggal, jamMasuk) : ada?.masuk_pada ?? null;
  const pulangPada = jamPulang ? waktuDariWIB(tanggal, jamPulang) : ada?.pulang_pada ?? null;
  if (masukPada && pulangPada && pulangPada < masukPada) throw galat('MASUKAN', 'Jam pulang harus setelah jam masuk.', 'jamPulang');

  const nilai = {
    masuk_pada: masukPada,
    pulang_pada: pulangPada,
    menit_terlambat: dinilai && masukPada ? hitungMenitTerlambat(masukPada, potretMasuk, potretToleransi) : 0,
    menit_pulang_cepat: dinilai && pulangPada ? hitungMenitPulangCepat(pulangPada, potretPulang) : 0,
    sumber: 'koreksi_hr',
    alasan_koreksi: alasan,
  };
  const jejak = { pelaku: u.pegawaiId, alasan };
  const id = ada
    ? (await tulis<{ id: string }>('presensi', 'ubah', { id: ada.id, ...nilai }, jejak)).id
    : (
        await tulis<{ id: string }>('presensi', 'tambah', {
          pegawai_id: pegawaiId, tanggal, ...nilai, jam_masuk_saat_itu: potretMasuk, jam_pulang_saat_itu: potretPulang,
          toleransi_saat_itu: potretToleransi, bypass_saat_itu: flag.bypass_gps,
        }, jejak)
      ).id;
  return keRingkas(await presensiId(id));
}

export async function percobaan(_u: Pengguna, data: unknown): Promise<PercobaanLuarRadius[]> {
  const d = objek(data);
  const mulai = tanggalWajib(d, 'mulai');
  const akhir = tanggalWajib(d, 'akhir');
  if (mulai > akhir) throw galat('MASUKAN', 'Tanggal mulai setelah tanggal akhir.', 'mulai');
  const rows = await baca<{
    id: string; pegawai_id: string; nama: string; npp: string; waktu: Date; lat: number; lng: number; akurasi: number | null;
    nama_kantor: string | null; jarak_m: number | null; radius: number | null; foto_file_id: string | null; status: string;
  }>(
    `SELECT c.id, c.pegawai_id, p.nama_lengkap AS nama, p.npp, c.waktu, c.lat, c.lng, c.akurasi, tk.nama AS nama_kantor,
            c.jarak_m, c.radius, c.foto_file_id, c.status
       FROM percobaan_check_in c JOIN pegawai p ON p.id = c.pegawai_id LEFT JOIN titik_kantor tk ON tk.id = c.titik_kantor_id
      WHERE (c.waktu AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1 AND $2
      ORDER BY c.waktu DESC LIMIT 500`,
    [mulai, akhir],
  );
  return rows.map((r) => ({
    id: r.id, pegawaiId: r.pegawai_id, nama: r.nama, npp: r.npp, waktu: r.waktu.toISOString(), lat: r.lat, lng: r.lng,
    akurasi: r.akurasi, namaKantor: r.nama_kantor, jarakM: r.jarak_m, radius: r.radius, fotoBerkasId: r.foto_file_id, status: r.status,
  }));
}
