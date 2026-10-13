// Router kecil berbasis History API: navigasi antar-layar tanpa memuat ulang halaman.
import { useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

const pendengar = new Set<() => void>();
const beritahu = () => pendengar.forEach((f) => f());
window.addEventListener('popstate', beritahu);

export function navigasi(jalur: string, ganti = false): void {
  if (jalur === location.pathname + location.search) return;
  if (ganti) history.replaceState(null, '', jalur);
  else history.pushState(null, '', jalur);
  beritahu();
  window.scrollTo(0, 0);
}

export function useJalur(): { jalur: string; kueri: URLSearchParams } {
  const lokasi = useSyncExternalStore(
    (f) => {
      pendengar.add(f);
      return () => pendengar.delete(f);
    },
    () => location.pathname + location.search,
  );
  const [jalur = '/', cari = ''] = lokasi.split('?');
  return { jalur, kueri: new URLSearchParams(cari) };
}

export function Tautan({ ke, children, className, onClick }: { ke: string; children: ReactNode; className?: string; onClick?: () => void }) {
  const klik = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    onClick?.();
    navigasi(ke);
  };
  return <a href={ke} className={className} onClick={klik}>{children}</a>;
}
