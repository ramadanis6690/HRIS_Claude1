// SATU-SATUNYA jalur tulis ke basis data (design_final.md §7.1, SRS AUD-01).
//
// Data dan Audit Log ditulis dalam satu transaksi: keduanya berhasil bersama
// atau gagal bersama. Baris lama dikunci dengan SELECT … FOR UPDATE, jadi yang
// diantre hanya dua penulisan ke baris yang sama.
//
// Tes statis (test/statis) gagal bila INSERT/UPDATE/DELETE muncul di luar
// berkas ini dan audit.ts.
//
// Pengecualian yang disengaja, di bagian bawah berkas ini: tabel operasional
// (`sesi`, `log_pemicu`) dan penghitung login di `pengguna` ditulis tanpa Audit
// Log. Keduanya bukan data bisnis, dan `terakhir_aktif` ditulis di setiap
// panggilan (§5.2) — mengauditnya akan membanjiri rantai tanpa menambah jejak
// yang berarti.
import * as audit from './audit.js';
import { baca, transaksi, type Baris, type Tx } from './db.js';

export type Operasi = 'tambah' | 'ubah' | 'nonaktifkan';

export interface Jejak {
  /** pegawai_id pelaku; null = sistem (pekerjaan terjadwal, skrip penyiapan). */
  pelaku: string | null;
  alasan?: string | null;
}

interface InfoTabel {
  kolom: Set<string>;
  pk: string;
}

const TABEL_TERLARANG = new Set(['audit_log', 'audit_rantai', 'sesi', 'skema_versi', 'log_pemicu']);
const POLA_NAMA = /^[a-z_][a-z0-9_]*$/;

let skema: Map<string, InfoTabel> | null = null;

/** Daftar kolom dan kunci primer dibaca dari basis data sekali per proses. */
async function infoTabel(tabel: string): Promise<InfoTabel> {
  if (!skema) {
    const kolom = await baca<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const pk = await baca<{ tabel: string; kolom: string }>(
      `SELECT c.relname AS tabel, a.attname AS kolom
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = i.indkey[0]
        WHERE i.indisprimary AND i.indnatts = 1`,
    );
    const m = new Map<string, InfoTabel>();
    for (const k of kolom) {
      const t = m.get(k.table_name) ?? { kolom: new Set<string>(), pk: 'id' };
      t.kolom.add(k.column_name);
      m.set(k.table_name, t);
    }
    for (const p of pk) {
      const t = m.get(p.tabel);
      if (t) t.pk = p.kolom;
    }
    skema = m;
  }
  const info = skema.get(tabel);
  if (!info || TABEL_TERLARANG.has(tabel)) throw new Error(`repo.tulis tidak menerima tabel ${tabel}`);
  return info;
}

function q(nama: string): string {
  if (!POLA_NAMA.test(nama)) throw new Error(`Nama tidak sah: ${nama}`);
  return `"${nama}"`;
}

function pastikanKolom(info: InfoTabel, tabel: string, baris: Record<string, unknown>): void {
  for (const k of Object.keys(baris)) {
    if (!info.kolom.has(k)) throw new Error(`Kolom ${k} tidak ada di tabel ${tabel}`);
  }
}

/**
 * Menambah, mengubah, atau menonaktifkan satu baris, beserta Audit Log-nya.
 * Bila `tx` diberikan, penulisan ikut transaksi pemanggil (satu aksi bisnis =
 * satu transaksi); bila tidak, membuka transaksinya sendiri.
 */
export async function tulis<T = Baris>(
  tabel: string,
  operasi: Operasi,
  baris: Record<string, unknown>,
  jejak: Jejak,
  tx?: Tx,
): Promise<T> {
  if (!tx) return transaksi((t) => tulis<T>(tabel, operasi, baris, jejak, t));
  const info = await infoTabel(tabel);
  const data = Object.fromEntries(Object.entries(baris).filter(([, v]) => v !== undefined));
  pastikanKolom(info, tabel, data);

  if (operasi === 'tambah') {
    if (info.kolom.has('dibuat_oleh') && !('dibuat_oleh' in data)) data.dibuat_oleh = jejak.pelaku;
    const kolom = Object.keys(data);
    const sql = `INSERT INTO ${q(tabel)} (${kolom.map(q).join(', ')}) VALUES (${kolom.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
    const [sesudah] = await tx.query<T>(sql, kolom.map((k) => data[k]));
    await audit.catat(tx, {
      pelaku: jejak.pelaku, aksi: 'tambah', tabel, barisId: barisIdAudit(info, sesudah as Baris),
      sebelum: null, sesudah: sesudah as Baris, alasan: jejak.alasan,
    });
    return sesudah!;
  }

  const kunci = data[info.pk];
  if (kunci === undefined || kunci === null) throw new Error(`repo.tulis ${operasi} ${tabel} butuh ${info.pk}`);
  delete data[info.pk];

  const [sebelum] = await tx.query<T>(`SELECT * FROM ${q(tabel)} WHERE ${q(info.pk)} = $1 FOR UPDATE`, [kunci]);
  if (!sebelum) throw new GalatTidakAda(tabel);

  if (operasi === 'nonaktifkan') {
    if (!info.kolom.has('aktif')) throw new Error(`Tabel ${tabel} tidak punya kolom aktif`);
    data.aktif = false;
  }
  if (info.kolom.has('diubah_oleh')) data.diubah_oleh = jejak.pelaku;
  if (info.kolom.has('diubah_pada')) data.diubah_pada = new Date();

  const kolom = Object.keys(data);
  if (kolom.length === 0) return sebelum;
  const sql = `UPDATE ${q(tabel)} SET ${kolom.map((k, i) => `${q(k)} = $${i + 1}`).join(', ')} WHERE ${q(info.pk)} = $${kolom.length + 1} RETURNING *`;
  const [sesudah] = await tx.query<T>(sql, [...kolom.map((k) => data[k]), kunci]);
  await audit.catat(tx, {
    pelaku: jejak.pelaku, aksi: operasi, tabel, barisId: barisIdAudit(info, sesudah as Baris),
    sebelum: sebelum as Baris, sesudah: sesudah as Baris, alasan: jejak.alasan,
  });
  return sesudah!;
}

function barisIdAudit(info: InfoTabel, baris: Baris): string | null {
  const v = baris[info.pk];
  // audit_log.baris_id bertipe uuid; tabel berkunci lain (tanggal, kunci teks)
  // tetap terbaca lewat kolom sebelum/sesudah.
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export class GalatTidakAda extends Error {
  constructor(readonly tabel: string) {
    super(`Baris tidak ditemukan di ${tabel}`);
    this.name = 'GalatTidakAda';
  }
}

// ---------------------------------------------------------------------------
// Tabel operasional — tanpa Audit Log (lihat catatan di kepala berkas)
// ---------------------------------------------------------------------------

export const operasional = {
  async sesiBuat(s: {
    hashToken: Buffer; penggunaId: string; kedaluwarsa: Date; ingat: boolean; perangkat: string | null;
  }): Promise<void> {
    await baca(
      'INSERT INTO sesi (hash_token, pengguna_id, kedaluwarsa, ingat, perangkat) VALUES ($1, $2, $3, $4, $5)',
      [s.hashToken, s.penggunaId, s.kedaluwarsa, s.ingat, s.perangkat],
    );
  },

  async sesiSentuh(hashToken: Buffer): Promise<void> {
    await baca('UPDATE sesi SET terakhir_aktif = now() WHERE hash_token = $1', [hashToken]);
  },

  async sesiCabut(hashToken: Buffer): Promise<void> {
    await baca('UPDATE sesi SET dicabut = now() WHERE hash_token = $1 AND dicabut IS NULL', [hashToken]);
  },

  /**
   * AUTH-12: menonaktifkan akun atau pegawai mencabut semua sesinya. Ikut transaksi pemanggil.
   * `kecuali` dipakai saat ganti sandi sendiri: perangkat yang sedang dipakai tetap masuk.
   */
  async sesiCabutSemua(tx: Tx, penggunaId: string, kecuali: Buffer | null = null): Promise<void> {
    await tx.query(
      'UPDATE sesi SET dicabut = now() WHERE pengguna_id = $1 AND dicabut IS NULL AND ($2::bytea IS NULL OR hash_token <> $2)',
      [penggunaId, kecuali],
    );
  },

  /** design §5.2/§9: sesi yang kedaluwarsa atau dicabut lebih dari 7 hari lalu dibuang (migrasi 003). */
  async sesiBuang(sebelum: Date): Promise<number> {
    const r = await baca<{ n: number }>(
      `WITH d AS (DELETE FROM sesi WHERE kedaluwarsa < $1 OR dicabut < $1 RETURNING 1) SELECT count(*)::int AS n FROM d`,
      [sebelum],
    );
    return r[0]?.n ?? 0;
  },

  /** AUTH-05. Hitungan mulai lagi dari 1 setelah masa kunci sebelumnya habis. */
  async loginGagal(penggunaId: string, batas: number, kunciMenit: number): Promise<void> {
    await baca(
      `UPDATE pengguna p
          SET gagal_login = x.n,
              terkunci_sampai = CASE WHEN x.n >= $2 THEN now() + make_interval(mins => $3) ELSE NULL END
         FROM (SELECT id,
                      CASE WHEN terkunci_sampai IS NOT NULL AND terkunci_sampai <= now() THEN 1
                           ELSE gagal_login + 1 END AS n
                 FROM pengguna WHERE id = $1) x
        WHERE p.id = x.id`,
      [penggunaId, batas, kunciMenit],
    );
  },

  async loginBerhasil(penggunaId: string): Promise<void> {
    await baca(
      'UPDATE pengguna SET gagal_login = 0, terkunci_sampai = NULL, login_terakhir = now() WHERE id = $1',
      [penggunaId],
    );
  },

  async catatPekerjaan(p: { pekerjaan: string; jumlahDiproses: number; berhasil: boolean; galat: string | null }): Promise<void> {
    await baca(
      'INSERT INTO log_pemicu (pekerjaan, jumlah_diproses, berhasil, galat) VALUES ($1, $2, $3, $4)',
      [p.pekerjaan, p.jumlahDiproses, p.berhasil, p.galat],
    );
  },
};
