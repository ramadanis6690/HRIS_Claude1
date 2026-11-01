// Chart digambar sendiri sebagai SVG (design §10.5, SRS CHT-02 – CHT-04): tanpa
// pustaka luar, warna dari token tema, nilai muncul saat disentuh, Rupiah penuh.
import { useState } from 'react';

export interface Titik {
  label: string;
  nilai: number;
  /** Teks saat disentuh; bawaan = nilai. */
  keterangan?: string;
}

/** Realisasi terhadap target. */
export function Progres({ nilai, target, label }: { nilai: number; target: number; label: string }) {
  const persen = target > 0 ? Math.min(100, (nilai / target) * 100) : 0;
  return (
    <div>
      <div className="baris-antara kecil"><span className="redup">{label}</span><span>{nilai} / {target}</span></div>
      <svg width="100%" height="12" role="img" aria-label={`${label}: ${nilai} dari ${target}`} style={{ display: 'block', marginTop: 4 }}>
        <rect x="0" y="0" width="100%" height="12" rx="6" fill="var(--track)" />
        <rect x="0" y="0" width={`${persen}%`} height="12" rx="6" fill="var(--c1)" />
      </svg>
    </div>
  );
}

/** Batang untuk perbandingan. Satu sumbu nilai (CHT-03). */
export function Batang({ data, tinggi = 160, onKlik }: { data: readonly Titik[]; tinggi?: number; onKlik?: (t: Titik) => void }) {
  const [aktif, setAktif] = useState<number | null>(null);
  const maks = Math.max(1, ...data.map((d) => d.nilai));
  const lebarBatang = 100 / Math.max(1, data.length);
  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" height={tinggi + 22} role="img" aria-label="Grafik batang">
        <line x1="0" x2="100%" y1={tinggi} y2={tinggi} stroke="var(--line)" />
        {data.map((d, i) => {
          const h = (d.nilai / maks) * (tinggi - 8);
          return (
            <g key={d.label} onMouseEnter={() => setAktif(i)} onMouseLeave={() => setAktif(null)} onClick={() => { setAktif(i); onKlik?.(d); }} style={{ cursor: onKlik ? 'pointer' : 'default' }}>
              <rect x={`${i * lebarBatang + lebarBatang * 0.2}%`} y={tinggi - h} width={`${lebarBatang * 0.6}%`} height={h} rx="3" fill={aktif === i ? 'var(--c2)' : 'var(--c1)'} />
              <rect x={`${i * lebarBatang}%`} y="0" width={`${lebarBatang}%`} height={tinggi} fill="transparent" />
              <text x={`${i * lebarBatang + lebarBatang / 2}%`} y={tinggi + 15} textAnchor="middle" fontSize="11" fill="var(--ink-muted)">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {aktif !== null && data[aktif] && (
        <div className="chart-tip" style={{ left: `${aktif * lebarBatang + lebarBatang / 2}%`, top: tinggi - (data[aktif]!.nilai / maks) * (tinggi - 8) }}>
          {data[aktif]!.label}: {data[aktif]!.keterangan ?? data[aktif]!.nilai}
        </div>
      )}
    </div>
  );
}
