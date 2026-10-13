// Jarak dihitung server dengan haversine (SRS LOC-05). Browser hanya mengirim
// koordinat mentah; nilai jarak atau "dalam radius" dari browser diabaikan.

export interface Koordinat {
  lat: number;
  lng: number;
}

export interface TitikKantor extends Koordinat {
  id: string;
  nama: string;
  radiusM: number;
}

const JARI_JARI_BUMI_M = 6_371_000;
const rad = (derajat: number) => (derajat * Math.PI) / 180;

export function jarakHaversineM(a: Koordinat, b: Koordinat): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * JARI_JARI_BUMI_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface TitikTerdekat {
  titik: TitikKantor;
  jarakM: number;
}

export function titikTerdekat(posisi: Koordinat, kandidat: readonly TitikKantor[]): TitikTerdekat | null {
  let terbaik: TitikTerdekat | null = null;
  for (const titik of kandidat) {
    const jarakM = jarakHaversineM(posisi, titik);
    if (!terbaik || jarakM < terbaik.jarakM) terbaik = { titik, jarakM };
  }
  return terbaik;
}

export const RADIUS_SAH = [50, 100, 200, 300] as const;

export function radiusSah(r: number): boolean {
  return (RADIUS_SAH as readonly number[]).includes(r);
}

export function koordinatSah(k: Koordinat): boolean {
  return (
    Number.isFinite(k.lat) && Number.isFinite(k.lng) && k.lat >= -90 && k.lat <= 90 && k.lng >= -180 && k.lng <= 180
  );
}
