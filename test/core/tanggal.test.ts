import { describe, expect, test } from 'vitest';
import {
  bulanPenuh, formatMasaKerja, hariIso, hariKerja, jamWIB, masaKerja, menitDariJam, menitWIB,
  rentangDariFilter, tambahBulan, tambahHari, tanggalWIB, waktuDariWIB,
} from '../../src/core/tanggal.js';

describe('tanggal WIB (ATT-03)', () => {
  test('check-in pukul 00.30 WIB tercatat di tanggal WIB, bukan tanggal UTC kemarin', () => {
    const waktu = new Date('2026-10-13T17:30:00Z'); // 14 Okt 00.30 WIB
    expect(tanggalWIB(waktu)).toBe('2026-10-14');
    expect(jamWIB(waktu)).toBe('00:30');
  });

  test('check-in pukul 06.30 WIB tercatat di tanggal yang sama', () => {
    const waktu = new Date('2026-10-13T23:30:00Z'); // 14 Okt 06.30 WIB
    expect(tanggalWIB(waktu)).toBe('2026-10-14');
    expect(menitWIB(waktu)).toBe(6 * 60 + 30);
  });

  test('waktuDariWIB kebalikan dari tanggalWIB + jamWIB', () => {
    const w = waktuDariWIB('2026-01-31', '08:05');
    expect(w.toISOString()).toBe('2026-01-31T01:05:00.000Z');
    expect(tanggalWIB(w)).toBe('2026-01-31');
    expect(jamWIB(w)).toBe('08:05');
  });

  test('menitDariJam menerima HH:MM dan HH:MM:SS, menolak jam tidak sah', () => {
    expect(menitDariJam('08:00')).toBe(480);
    expect(menitDariJam('17:00:00')).toBe(1020);
    expect(() => menitDariJam('24:00')).toThrow();
    expect(() => menitDariJam('8')).toThrow();
  });
});

describe('aritmetika tanggal', () => {
  test('hari ISO: 1 Senin … 7 Minggu', () => {
    expect(hariIso('2026-10-12')).toBe(1); // Senin
    expect(hariIso('2026-10-18')).toBe(7); // Minggu
  });

  test('tambahHari melewati batas bulan dan tahun', () => {
    expect(tambahHari('2026-12-31', 1)).toBe('2027-01-01');
    expect(tambahHari('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('tambahBulan tidak meluap ke bulan sesudahnya', () => {
    expect(tambahBulan('2026-01-31', 1)).toBe('2026-02-28');
    expect(tambahBulan('2028-01-31', 1)).toBe('2028-02-29');
  });

  test('tanggal yang tidak ada ditolak', () => {
    expect(() => tambahHari('2026-02-30', 1)).toThrow();
  });
});

describe('masa kerja (EMP-06)', () => {
  test('dihitung dari tanggal masa kerja diakui bila ada', () => {
    expect(masaKerja('2020-05-10', '2018-01-01', '2026-10-13')).toEqual({ tahun: 8, bulan: 9 });
  });

  test('dihitung dari tanggal masuk bila tanggal diakui kosong', () => {
    expect(masaKerja('2020-05-10', null, '2026-10-13')).toEqual({ tahun: 6, bulan: 5 });
  });

  test('bulan belum genap tidak dihitung', () => {
    expect(bulanPenuh('2026-01-15', '2026-02-14')).toBe(0);
    expect(bulanPenuh('2026-01-15', '2026-02-15')).toBe(1);
  });

  test('tanpa tanggal ditulis "Belum diisi"', () => {
    expect(formatMasaKerja(masaKerja(null, null, '2026-10-13'))).toBe('Belum diisi');
    expect(formatMasaKerja({ tahun: 3, bulan: 2 })).toBe('3 tahun 2 bulan');
  });
});

describe('hari kerja (WRK-03)', () => {
  const seninJumat = [1, 2, 3, 4, 5];
  test('Sabtu bukan hari kerja; hari libur bukan hari kerja', () => {
    expect(hariKerja('2026-10-17', seninJumat, new Set())).toBe(false);
    expect(hariKerja('2026-10-13', seninJumat, new Set(['2026-10-13']))).toBe(false);
    expect(hariKerja('2026-10-13', seninJumat, new Set())).toBe(true);
  });
});

describe('filter tanggal empat mode (DSH-04)', () => {
  test('triwulan mengikuti tahun kalender', () => {
    expect(rentangDariFilter({ mode: 'triwulan', tahun: 2026, tw: 1 })).toEqual({ mulai: '2026-01-01', akhir: '2026-03-31' });
    expect(rentangDariFilter({ mode: 'triwulan', tahun: 2026, tw: 4 })).toEqual({ mulai: '2026-10-01', akhir: '2026-12-31' });
  });

  test('bulanan sampai akhir bulan', () => {
    expect(rentangDariFilter({ mode: 'bulanan', bulan: '2028-02' })).toEqual({ mulai: '2028-02-01', akhir: '2028-02-29' });
  });

  test('rentang dengan mulai setelah akhir ditolak', () => {
    expect(() => rentangDariFilter({ mode: 'rentang', mulai: '2026-10-14', akhir: '2026-10-13' })).toThrow();
  });
});
