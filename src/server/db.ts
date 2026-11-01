// Pool koneksi dan pembungkus transaksi. Aplikasi tersambung sebagai hris_app,
// yang tidak punya hak DELETE dan tidak bisa mengubah Audit Log.
import pg from 'pg';

// bigint (domain `rupiah`, bigserial): pg mengembalikan string, dan "100" + "200"
// diam-diam menjadi "100200". Rupiah DPJM jauh di bawah Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (v: string) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`bigint di luar rentang aman: ${v}`);
  return n;
});
// numeric: koordinat, jarak, akurasi, persen — cukup presisi sebagai number.
pg.types.setTypeParser(1700, (v: string) => Number(v));
// date: tetap 'yyyy-MM-dd'. Mengubahnya jadi Date memindahkan tanggal saat zona waktu proses bukan WIB.
pg.types.setTypeParser(1082, (v: string) => v);
// smallint[] dan int[] tetap dibaca bawaan pg (array number).

export type Baris = Record<string, unknown>;

export interface Tx {
  query<R = Baris>(sql: string, params?: readonly unknown[]): Promise<R[]>;
}

let pool: pg.Pool | null = null;

export function sambung(databaseUrl: string): void {
  if (pool) return;
  pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10, // puncak pagi ±20 orang check-in dalam 30 menit (design §13)
    idleTimeoutMillis: 30_000,
    application_name: 'hris',
  });
  pool.on('error', () => {
    /* koneksi menganggur yang putus diganti pool; galat kueri ditangani pemanggil */
  });
}

function p(): pg.Pool {
  if (!pool) throw new Error('Basis data belum disambungkan');
  return pool;
}

export async function tutup(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** Kueri baca di luar transaksi. Penulisan wajib lewat repo.ts. */
export async function baca<R = Baris>(sql: string, params: readonly unknown[] = []): Promise<R[]> {
  const r = await p().query(sql, params as unknown[]);
  return r.rows as R[];
}

export async function bacaSatu<R = Baris>(sql: string, params: readonly unknown[] = []): Promise<R | null> {
  const rows = await baca<R>(sql, params);
  return rows[0] ?? null;
}

export async function transaksi<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const klien = await p().connect();
  const tx: Tx = {
    async query<R = Baris>(sql: string, params: readonly unknown[] = []) {
      const r = await klien.query(sql, params as unknown[]);
      return r.rows as R[];
    },
  };
  try {
    await klien.query('BEGIN');
    const hasil = await fn(tx);
    await klien.query('COMMIT');
    return hasil;
  } catch (e) {
    await klien.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    klien.release();
  }
}
