// Uang selalu rupiah bulat (PAY-11). Satu fungsi format untuk seluruh aplikasi
// (NFR-07), tanpa mode ringkas.

export function formatRupiah(n: number): string {
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}

/** Pecahan di bawah Rp100 dibuang (SK Pasal 16 ayat 4). */
export function lantaiRatusan(x: number): number {
  return Math.floor(x / 100) * 100;
}

/** Dipakai untuk PKP (design_final.md §8.7). */
export function lantaiRibuan(x: number): number {
  return Math.floor(x / 1000) * 1000;
}
