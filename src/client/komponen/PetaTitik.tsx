// Peta Leaflet + OpenStreetMap untuk menetapkan titik kantor (SRS LOC-01).
// Dimuat hanya di layar Titik Kantor (design §10.6), lewat import dinamis.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function PetaTitik({ lat, lng, radiusM, onPilih }: { lat: number | null; lng: number | null; radiusM: number; onPilih: (lat: number, lng: number) => void }) {
  const wadah = useRef<HTMLDivElement>(null);
  const peta = useRef<L.Map | null>(null);
  const penanda = useRef<L.CircleMarker | null>(null);
  const lingkar = useRef<L.Circle | null>(null);
  const pilihRef = useRef(onPilih);
  pilihRef.current = onPilih;
  const [cari, setCari] = useState('');
  const [hasil, setHasil] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!wadah.current) return;
    const m = L.map(wadah.current).setView([lat ?? -6.2088, lng ?? 106.8456], lat ? 17 : 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => pilihRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6))));
    peta.current = m;
    return () => {
      m.remove();
      peta.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- peta dibuat sekali
  }, []);

  useEffect(() => {
    const m = peta.current;
    if (!m || lat === null || lng === null) return;
    const titik: L.LatLngExpression = [lat, lng];
    const gaya = getComputedStyle(document.documentElement);
    const warna = gaya.getPropertyValue('--accent').trim() || 'green';
    if (!penanda.current) penanda.current = L.circleMarker(titik, { radius: 7, color: warna, fillOpacity: 1 }).addTo(m);
    else penanda.current.setLatLng(titik);
    if (!lingkar.current) lingkar.current = L.circle(titik, { radius: radiusM, color: warna, fillOpacity: 0.12, weight: 1 }).addTo(m);
    else lingkar.current.setLatLng(titik).setRadius(radiusM);
  }, [lat, lng, radiusM]);

  const cariAlamat = async () => {
    setGalat(null);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(cari)}`, { headers: { Accept: 'application/json' } });
      const j = (await r.json()) as { display_name: string; lat: string; lon: string }[];
      setHasil(j);
      if (j.length === 0) setGalat('Alamat tidak ditemukan. Klik langsung di peta, atau ketik koordinat.');
    } catch {
      setGalat('Pencarian alamat tidak tersedia. Klik langsung di peta, atau ketik koordinat.');
    }
  };

  return (
    <div className="tumpuk" style={{ gap: 8 }}>
      <div className="baris">
        <div className="isian" style={{ flex: 1, minWidth: 200 }}>
          <input placeholder=" " value={cari} onChange={(e) => setCari(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void cariAlamat())} id="cari-alamat" />
          <label htmlFor="cari-alamat">Cari alamat</label>
        </div>
        <button type="button" className="tombol sekunder" onClick={cariAlamat} disabled={!cari.trim()}>Cari</button>
      </div>
      {galat && <div className="catatan">{galat}</div>}
      {hasil.length > 0 && (
        <div className="tumpuk" style={{ gap: 4 }}>
          {hasil.map((h) => (
            <button key={h.lat + h.lon} type="button" className="tombol hantu kecil" style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }}
              onClick={() => { const a = Number(Number(h.lat).toFixed(6)); const b = Number(Number(h.lon).toFixed(6)); onPilih(a, b); peta.current?.setView([a, b], 17); setHasil([]); }}>
              {h.display_name}
            </button>
          ))}
        </div>
      )}
      <div ref={wadah} className="peta" />
      <div className="redup kecil">Klik peta untuk menetapkan titik. Lingkaran menunjukkan radius check-in.</div>
    </div>
  );
}
