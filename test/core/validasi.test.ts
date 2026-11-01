import { describe, expect, test } from 'vitest';
import {
  GalatMasukan, angkaOpsional, daftarUuid, periksaGapok, periksaSandi, pilihanWajib, tanggalOpsional, teksWajib,
  type BarisGrade,
} from '../../src/core/validasi.js';

describe('masukan', () => {
  test('teks wajib kosong ditolak dengan nama kolomnya', () => {
    try {
      teksWajib({ nama: '  ' }, 'nama');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GalatMasukan);
      expect((e as GalatMasukan).kolom).toBe('nama');
    }
  });
  test('tanggal tidak ada ditolak', () => {
    expect(() => tanggalOpsional({ t: '2026-02-30' }, 't')).toThrow(GalatMasukan);
    expect(tanggalOpsional({ t: '' }, 't')).toBeNull();
  });
  test('angka dengan batas', () => {
    expect(angkaOpsional({ n: '12' }, 'n', { bulat: true })).toBe(12);
    expect(() => angkaOpsional({ n: 1.5 }, 'n', { bulat: true })).toThrow();
    expect(() => angkaOpsional({ n: 'abc' }, 'n')).toThrow();
  });
  test('pilihan di luar daftar ditolak', () => {
    expect(() => pilihanWajib({ p: 'x' }, 'p', ['a', 'b'])).toThrow();
    expect(pilihanWajib({ p: 'a' }, 'p', ['a', 'b'])).toBe('a');
  });
  test('daftar uuid', () => {
    expect(() => daftarUuid({ d: ['bukan'] }, 'd')).toThrow();
    expect(daftarUuid({ d: ['2b1e5b6e-9a3c-4c2e-9d6f-0a1b2c3d4e5f'] }, 'd')).toHaveLength(1);
  });
});

test('kata sandi minimal 8 karakter berisi huruf dan angka (AUTH-04)', () => {
  expect(periksaSandi('abc12')).not.toBeNull();
  expect(periksaSandi('abcdefgh')).not.toBeNull();
  expect(periksaSandi('12345678')).not.toBeNull();
  expect(periksaSandi('rahasia123')).toBeNull();
});

describe('usulan Sub Grade dan peringatan rentang (EMP-08)', () => {
  const tabel: BarisGrade[] = [
    { grade: '10', subGrade: 'A', masaKerjaMinThn: 0, masaKerjaMaxThn: 3, gapokMin: 4_000_000, gapokMax: 5_000_000 },
    { grade: '10', subGrade: 'B', masaKerjaMinThn: 3, masaKerjaMaxThn: null, gapokMin: 5_000_000, gapokMax: 6_000_000 },
  ];
  test('mengusulkan sub grade dari masa kerja', () => {
    expect(periksaGapok(tabel, '10', 4, 5_500_000, null)).toEqual({ usulanSubGrade: 'B', peringatan: null });
  });
  test('memperingatkan gapok di luar rentang tanpa memblokir', () => {
    expect(periksaGapok(tabel, '10', 1, 3_000_000, null).peringatan).toMatch(/di bawah minimum/);
    expect(periksaGapok(tabel, '10', 1, 7_000_000, 'A').peringatan).toMatch(/di atas maksimum/);
  });
  test('tabel grade kosong menghasilkan peringatan, bukan galat', () => {
    expect(periksaGapok([], '10', 1, 5_000_000, null).peringatan).toMatch(/belum diisi/);
  });
});
