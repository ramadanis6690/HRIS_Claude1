import { describe, expect, test } from 'vitest';
import {
  hitungCheckOut, hitungMenitTerlambat, hitungPotonganKehadiran, nilaiCheckIn, pesanLuarRadius,
  type MasukanCheckIn,
} from '../../src/core/kehadiran.js';
import { waktuDariWIB } from '../../src/core/tanggal.js';

const kantor = { id: 'k1', nama: 'Kantor Pusat', lat: -6.2, lng: 106.8, radiusM: 100 };
const kantor2 = { id: 'k2', nama: 'Kantor Cabang', lat: -6.3, lng: 106.9, radiusM: 100 };

function masukan(ubah: Partial<MasukanCheckIn> = {}): MasukanCheckIn {
  return {
    sekarang: waktuDariWIB('2026-10-13', '08:10'), // Selasa
    posisi: { lat: -6.2, lng: 106.8003, akurasi: 15 },
    sudahCheckIn: false,
    dinasAktif: false,
    bypassGps: false,
    wajibPresensi: true,
    titikTerkunciId: null,
    titikAktif: [kantor],
    jamKerja: { jamMasuk: '08:00', jamPulang: '17:00', toleransiMenit: 0, hariKerja: [1, 2, 3, 4, 5] },
    libur: new Set(),
    ...ubah,
  };
}

describe('menit terlambat (ATT-11)', () => {
  test('detik diabaikan: 08.00.59 belum terlambat, 08.01 terlambat 1 menit', () => {
    expect(hitungMenitTerlambat(new Date(waktuDariWIB('2026-10-13', '08:00').getTime() + 59_000), '08:00', 0)).toBe(0);
    expect(hitungMenitTerlambat(waktuDariWIB('2026-10-13', '08:01'), '08:00', 0)).toBe(1);
  });
  test('toleransi menggeser batas', () => {
    expect(hitungMenitTerlambat(waktuDariWIB('2026-10-13', '08:06'), '08:00', 5)).toBe(1);
    expect(hitungMenitTerlambat(waktuDariWIB('2026-10-13', '08:05'), '08:00', 5)).toBe(0);
  });
});

describe('penilaian check-in (design §8.1)', () => {
  test('sudah check-in hari ini ditolak (ATT-04)', () => {
    expect(nilaiCheckIn(masukan({ sudahCheckIn: true })).hasil).toBe('sudah_check_in');
  });

  test('akurasi lebih buruk dari 200 m diminta ulang (ATT-15); tepat 200 m diterima', () => {
    expect(nilaiCheckIn(masukan({ posisi: { lat: -6.2, lng: 106.8, akurasi: 201 } })).hasil).toBe('akurasi_lemah');
    expect(nilaiCheckIn(masukan({ posisi: { lat: -6.2, lng: 106.8, akurasi: Number.NaN } })).hasil).toBe('akurasi_lemah');
    expect(nilaiCheckIn(masukan({ posisi: { lat: -6.2, lng: 106.8, akurasi: 200 } })).hasil).toBe('simpan');
  });

  test('di dalam radius disimpan dengan potret jam kerja dan radius (ATT-10)', () => {
    const h = nilaiCheckIn(masukan());
    expect(h.hasil).toBe('simpan');
    if (h.hasil !== 'simpan') return;
    expect(h.presensi).toMatchObject({
      tanggal: '2026-10-13', sumber: 'check_in', titikKantorId: 'k1', radiusSaatItu: 100,
      dalamRadius: true, bypassSaatItu: false, jamMasukSaatItu: '08:00', toleransiSaatItu: 0, menitTerlambat: 10,
    });
    expect(h.presensi.jarakM).toBeGreaterThan(0);
  });

  test('di luar radius ditolak dengan jaraknya (LOC-06)', () => {
    const h = nilaiCheckIn(masukan({ posisi: { lat: -6.21, lng: 106.8, akurasi: 10 } }));
    expect(h.hasil).toBe('luar_radius');
    if (h.hasil !== 'luar_radius') return;
    expect(Math.round(h.jarakM)).toBeGreaterThan(1000);
    expect(pesanLuarRadius(h.titik.nama, 240.4, 100)).toBe('Anda berada ±240 m dari Kantor Pusat (batas 100 m).');
  });

  test('bypass GPS: radius diabaikan tetapi koordinat dan jarak dicatat (LOC-08)', () => {
    const h = nilaiCheckIn(masukan({ bypassGps: true, posisi: { lat: -6.21, lng: 106.8, akurasi: 10 } }));
    expect(h.hasil).toBe('simpan');
    if (h.hasil !== 'simpan') return;
    expect(h.presensi.dalamRadius).toBe(false);
    expect(h.presensi.bypassSaatItu).toBe(true);
    expect(h.presensi.jarakM).toBeGreaterThan(1000);
  });

  test('belum ada titik aktif: dalam_radius kosong, bukan "di luar" (LOC-09)', () => {
    const h = nilaiCheckIn(masukan({ titikAktif: [] }));
    expect(h.hasil).toBe('simpan');
    if (h.hasil === 'simpan') expect(h.presensi.dalamRadius).toBeNull();
  });

  test('pegawai terkunci ke satu titik hanya sah di titik itu (LOC-04)', () => {
    const diKantor2 = { lat: -6.3, lng: 106.9, akurasi: 10 };
    expect(nilaiCheckIn(masukan({ titikAktif: [kantor, kantor2], posisi: diKantor2 })).hasil).toBe('simpan');
    expect(nilaiCheckIn(masukan({ titikAktif: [kantor, kantor2], posisi: diKantor2, titikTerkunciId: 'k1' })).hasil).toBe('luar_radius');
  });

  test('titik terkunci yang sudah nonaktif tidak membuat check-in mustahil', () => {
    const h = nilaiCheckIn(masukan({ titikAktif: [kantor], titikTerkunciId: 'hilang' }));
    expect(h.hasil).toBe('simpan');
  });

  test('dinas luar: tanpa penilaian radius dan tidak pernah terlambat', () => {
    const h = nilaiCheckIn(masukan({ dinasAktif: true, posisi: { lat: 0, lng: 0, akurasi: 10 } }));
    expect(h.hasil).toBe('simpan');
    if (h.hasil === 'simpan') expect(h.presensi).toMatchObject({ sumber: 'dinas_luar', dalamRadius: null, menitTerlambat: 0 });
  });

  test('wajib presensi OFF tidak pernah dinilai terlambat (ATT-09)', () => {
    const h = nilaiCheckIn(masukan({ wajibPresensi: false, sekarang: waktuDariWIB('2026-10-13', '10:00') }));
    if (h.hasil === 'simpan') expect(h.presensi.menitTerlambat).toBe(0);
  });

  test('akhir pekan dan hari libur tidak dinilai terlambat', () => {
    const sabtu = nilaiCheckIn(masukan({ sekarang: waktuDariWIB('2026-10-17', '10:00') }));
    const libur = nilaiCheckIn(masukan({ libur: new Set(['2026-10-13']) }));
    if (sabtu.hasil === 'simpan') expect(sabtu.presensi.menitTerlambat).toBe(0);
    if (libur.hasil === 'simpan') expect(libur.presensi.menitTerlambat).toBe(0);
  });
});

describe('check-out (ATT-11)', () => {
  const dasar = { tanggalPresensi: '2026-10-13', sumber: 'check_in', wajibPresensi: true, jamPulangSaatItu: '17:00', hariKerjaIso: [1, 2, 3, 4, 5], libur: new Set<string>() };
  test('pulang 16.30 = 30 menit pulang cepat', () => {
    expect(hitungCheckOut({ ...dasar, sekarang: waktuDariWIB('2026-10-13', '16:30') }).menitPulangCepat).toBe(30);
  });
  test('pulang setelah jam pulang = 0', () => {
    expect(hitungCheckOut({ ...dasar, sekarang: waktuDariWIB('2026-10-13', '18:00') }).menitPulangCepat).toBe(0);
  });
  test('dinas luar tidak dinilai', () => {
    expect(hitungCheckOut({ ...dasar, sumber: 'dinas_luar', sekarang: waktuDariWIB('2026-10-13', '12:00') }).menitPulangCepat).toBe(0);
  });
});

test('potongan kehadiran: gapok Rp3.090.000 + 30 menit terlambat = Rp2.600 (REK-03)', () => {
  expect(hitungPotonganKehadiran(3_090_000, 30, 0, 0)).toBe(2600);
});
