// Tes statis (design §11.1): INSERT/UPDATE/DELETE hanya di repo.ts dan audit.ts,
// setiap aksi menyatakan izinnya, dan tidak ada kredensial di repositori.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';

function semuaBerkas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? semuaBerkas(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const AKAR = join(import.meta.dirname, '..', '..');
const SRC = semuaBerkas(join(AKAR, 'src'));
const POLA_TULIS = /\b(INSERT\s+INTO|UPDATE\s+[a-z_"]+\s+SET|UPDATE\s+[a-z_"]+\s+[a-z]\s+SET|DELETE\s+FROM)\b/i;

describe('jalur tulis tunggal (AUD-01)', () => {
  test('INSERT/UPDATE/DELETE hanya ada di repo.ts dan audit.ts', () => {
    const pelanggar = SRC.filter((f) => !/server[\\/](repo|audit)\.ts$/.test(f)).filter((f) => POLA_TULIS.test(readFileSync(f, 'utf8')));
    expect(pelanggar.map((f) => relative(AKAR, f))).toEqual([]);
  });

  test('DELETE hanya untuk tabel sesi (migrasi 003); data bisnis tidak pernah dihapus fisik', () => {
    const repo = readFileSync(join(AKAR, 'src/server/repo.ts'), 'utf8');
    const hapus = [...repo.matchAll(/DELETE\s+FROM\s+([a-z_]+)/gi)].map((m) => m[1]);
    expect(hapus).toEqual(['sesi']);
  });
});

describe('izin aksi (§5.3, OTZ-01)', () => {
  test('setiap aksi menyatakan izinnya, dan tidak ada aksi tulis yang terbuka untuk auditor', async () => {
    const { AKSI, periksaTabelAksi } = await import('../../src/server/api.js');
    expect(() => periksaTabelAksi()).not.toThrow();
    for (const [nama, a] of Object.entries(AKSI)) {
      expect(a.izin, nama).toBeTruthy();
    }
  });
});

describe('kredensial (NFR-15)', () => {
  test('tidak ada kata sandi basis data atau kunci rahasia di kode', () => {
    const POLA = /(postgres(ql)?:\/\/[^:\s'"`]+:[^@\s'"`]+@)|(-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
    const berkas = [...SRC, ...semuaBerkas(join(AKAR, 'scripts')), ...semuaBerkas(join(AKAR, 'test'))]
      .filter((f) => !f.endsWith('jalur-tulis.test.ts'))
      .filter((f) => POLA.test(readFileSync(f, 'utf8')));
    expect(berkas.map((f) => relative(AKAR, f))).toEqual([]);
  });
});

describe('fungsi murni (design §3)', () => {
  test('core/* tidak menyentuh basis data, berkas, maupun jam sistem', () => {
    const core = SRC.filter((f) => f.includes(`${join('src', 'core')}`));
    const POLA = /from ['"](pg|node:fs|fs|node:child_process)['"]|\bDate\.now\(\)|new Date\(\)/;
    expect(core.filter((f) => POLA.test(readFileSync(f, 'utf8'))).map((f) => relative(AKAR, f))).toEqual([]);
  });
});
