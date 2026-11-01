// Presensi GPS + foto (PRD Fase 1 butir 9–11; SRS ATT-*, LOC-*).
import { beforeAll, describe, expect, test } from 'vitest';
import { baca, bacaSatu } from '../../src/server/db.js';
import { tanggalWIB, tambahHari } from '../../src/core/tanggal.js';
import { KANTOR_CONTOH } from '../../scripts/data-contoh.js';
import { adaDbTes, harus, JPEG_KECIL, masuk, panggil, siapkanDb } from '../bantu.js';

describe.skipIf(!adaDbTes)('presensi', () => {
  beforeAll(siapkanDb);
  const dekat = { lat: KANTOR_CONTOH.lat + 0.0003, lng: KANTOR_CONTOH.lng, akurasi: 15 };
  const jauh = { lat: KANTOR_CONTOH.lat + 0.01, lng: KANTOR_CONTOH.lng, akurasi: 15 };

  test('check-in di dalam radius tersimpan dengan foto dan potret aturan (ATT-01, ATT-10)', async () => {
    const t = await masuk('C0014');
    const p = await harus(t, 'presensi.checkIn', { ...dekat, foto: JPEG_KECIL });
    expect(p.tanggal).toBe(tanggalWIB(new Date()));
    expect(p.dalamRadius).toBe(true);
    expect(p.adaFoto).toBe(true);
    const r = await bacaSatu<{ radius_saat_itu: number; jam_masuk_saat_itu: string }>('SELECT radius_saat_itu, jam_masuk_saat_itu FROM presensi WHERE id = $1', [p.id]);
    expect(r).toEqual({ radius_saat_itu: 100, jam_masuk_saat_itu: '08:00:00' });
    const kedua = await panggil(t, 'presensi.checkIn', { ...dekat, foto: JPEG_KECIL });
    expect(!kedua.ok && kedua.galat.kode).toBe('SUDAH_CHECK_IN');
    const out = await harus(t, 'presensi.checkOut', dekat);
    expect(out.pulangPada).not.toBeNull();
  });

  test('di luar radius ditolak dengan jaraknya, percobaan tersimpan (LOC-06)', async () => {
    const t = await masuk('C0015');
    const r = await panggil(t, 'presensi.checkIn', { ...jauh, foto: JPEG_KECIL });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.galat.kode).toBe('LUAR_RADIUS');
      expect(r.galat.pesan).toMatch(/^Anda berada ±1\.\d{3} m dari Kantor Pusat \(contoh\) \(batas 100 m\)\.$/);
    }
    const c = await baca("SELECT 1 FROM percobaan_check_in c JOIN pegawai p ON p.id = c.pegawai_id WHERE p.npp = 'C0015' AND c.status = 'ditolak' AND c.foto_file_id IS NOT NULL");
    expect(c.length).toBe(1);
  });

  test('akurasi lebih buruk dari 200 m diminta ulang dan tidak dicatat (ATT-15)', async () => {
    const t = await masuk('C0016');
    const r = await panggil(t, 'presensi.checkIn', { ...dekat, akurasi: 450, foto: JPEG_KECIL });
    expect(!r.ok && r.galat.kode).toBe('AKURASI_LEMAH');
    const c = await baca("SELECT 1 FROM percobaan_check_in c JOIN pegawai p ON p.id = c.pegawai_id WHERE p.npp = 'C0016'");
    expect(c.length).toBe(0);
  });

  test('bypass GPS mencatat koordinat asli walau di luar radius (LOC-08)', async () => {
    const t = await masuk('C0002'); // Direksi: bypass ON bawaan
    const p = await harus(t, 'presensi.checkIn', { ...jauh, foto: JPEG_KECIL });
    expect(p.bypass).toBe(true);
    expect(p.dalamRadius).toBe(false);
    expect(p.jarakM).toBeGreaterThan(1000);
  });

  test('ATT-04: dua check-in bersamaan hanya menghasilkan satu baris', async () => {
    const t = await masuk('C0017');
    const hasil = await Promise.all([1, 2, 3].map(() => panggil(t, 'presensi.checkIn', { ...dekat, foto: JPEG_KECIL })));
    expect(hasil.filter((h) => h.ok).length).toBe(1);
    const n = await baca("SELECT 1 FROM presensi pr JOIN pegawai p ON p.id = pr.pegawai_id WHERE p.npp = 'C0017' AND pr.tanggal = $1", [tanggalWIB(new Date())]);
    expect(n.length).toBe(1);
  });

  test('browser tidak bisa mengirim jarak atau foto bukan JPEG', async () => {
    const t = await masuk('C0018');
    const r = await panggil(t, 'presensi.checkIn', { ...dekat, foto: Buffer.from('bukan foto').toString('base64') });
    expect(!r.ok && r.galat.kolom).toBe('foto');
  });

  test('ATT-12: koreksi HRD wajib beralasan dan ditandai koreksi_hr', async () => {
    const hrd = await masuk('C0009');
    const pegawai = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0019'"))!.id;
    const kemarin = tambahHari(tanggalWIB(new Date()), -1);
    const tanpa = await panggil(hrd, 'presensi.koreksi', { pegawaiId: pegawai, tanggal: kemarin, jamMasuk: '08:30', jamPulang: '17:00', alasan: '' });
    expect(!tanpa.ok && tanpa.galat.kolom).toBe('alasan');
    const p = await harus(hrd, 'presensi.koreksi', { pegawaiId: pegawai, tanggal: kemarin, jamMasuk: '08:30', jamPulang: '17:00', alasan: 'Mesin HP rusak, saksi atasan' });
    expect(p.sumber).toBe('koreksi_hr');
    expect(p.alasanKoreksi).toBe('Mesin HP rusak, saksi atasan');
    const rekap = await harus(hrd, 'presensi.daftar', { tanggal: kemarin });
    expect(rekap.find((b) => b.pegawaiId === pegawai)?.presensi?.sumber).toBe('koreksi_hr');
  });
});
