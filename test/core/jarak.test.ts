import { describe, expect, test } from 'vitest';
import { jarakHaversineM, radiusSah, titikTerdekat, type TitikKantor } from '../../src/core/jarak.js';

describe('haversine (LOC-05)', () => {
  test('titik yang sama berjarak nol', () => {
    expect(jarakHaversineM({ lat: -6.2, lng: 106.8 }, { lat: -6.2, lng: 106.8 })).toBe(0);
  });

  test('0,001 derajat lintang ≈ 111 m', () => {
    const d = jarakHaversineM({ lat: -6.2, lng: 106.8 }, { lat: -6.201, lng: 106.8 });
    expect(d).toBeGreaterThan(110.5);
    expect(d).toBeLessThan(111.8);
  });

  test('simetris', () => {
    const a = { lat: -6.17, lng: 106.82 };
    const b = { lat: -6.25, lng: 106.9 };
    expect(jarakHaversineM(a, b)).toBeCloseTo(jarakHaversineM(b, a), 6);
  });
});

describe('titik terdekat (LOC-04)', () => {
  const titik: TitikKantor[] = [
    { id: 'a', nama: 'Kantor A', lat: -6.2, lng: 106.8, radiusM: 100 },
    { id: 'b', nama: 'Kantor B', lat: -6.3, lng: 106.9, radiusM: 100 },
  ];
  test('memilih titik dengan jarak terkecil', () => {
    expect(titikTerdekat({ lat: -6.299, lng: 106.9 }, titik)?.titik.id).toBe('b');
  });
  test('tanpa kandidat menghasilkan null', () => {
    expect(titikTerdekat({ lat: 0, lng: 0 }, [])).toBeNull();
  });
});

test('radius hanya 50, 100, 200, atau 300 m (LOC-02)', () => {
  expect([50, 100, 200, 300].every(radiusSah)).toBe(true);
  expect(radiusSah(150)).toBe(false);
  expect(radiusSah(0)).toBe(false);
});
