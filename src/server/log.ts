// Log satu baris JSON ke stdout/stderr, ditampung journald di server.
// Kata sandi, token, dan isi data pribadi tidak pernah dikirim ke sini (NFR-15).
type Tingkat = 'info' | 'peringatan' | 'galat';

function tulis(tingkat: Tingkat, pesan: string, rincian?: Record<string, unknown>): void {
  const baris = JSON.stringify({ waktu: new Date().toISOString(), tingkat, pesan, ...rincian });
  if (tingkat === 'galat') process.stderr.write(baris + '\n');
  else process.stdout.write(baris + '\n');
}

export const log = {
  info: (pesan: string, rincian?: Record<string, unknown>) => tulis('info', pesan, rincian),
  peringatan: (pesan: string, rincian?: Record<string, unknown>) => tulis('peringatan', pesan, rincian),
  galat: (pesan: string, e?: unknown, rincian?: Record<string, unknown>) =>
    tulis('galat', pesan, {
      ...rincian,
      galat: e instanceof Error ? { nama: e.name, pesan: e.message, tumpukan: e.stack } : e,
    }),
};
