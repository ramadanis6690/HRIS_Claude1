import { expect, test } from 'vitest';
import { formatRupiah, lantaiRatusan, lantaiRibuan } from '../../src/core/rupiah.js';

test('format Rupiah penuh dengan locale id-ID (NFR-07)', () => {
  expect(formatRupiah(1234567)).toBe('Rp 1.234.567');
  expect(formatRupiah(0)).toBe('Rp 0');
});

test('pecahan di bawah Rp100 dibuang', () => {
  expect(lantaiRatusan(2679.19)).toBe(2600);
  expect(lantaiRatusan(92861.27)).toBe(92800);
  expect(lantaiRibuan(54_321_987)).toBe(54_321_000);
});
