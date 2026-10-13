// Login, sesi, dan kata sandi (design_final.md §5, SRS AUTH-01 – AUTH-15).
import argon2 from 'argon2';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { InfoSesi, PeranAdmin } from '../bersama/aksi.js';
import { periksaSandi } from '../core/validasi.js';
import { bacaSatu, baca, transaksi } from './db.js';
import { galat } from './galat.js';
import { menuUntuk, peranStrukturalDari, type Pengguna, type Posisi } from './izin.js';
import { operasional, tulis } from './repo.js';

export const NAMA_COOKIE = 'hris_sesi';
export const PESAN_LOGIN_GAGAL = 'Username atau kata sandi salah.';
const BATAS_GAGAL = 5;
const KUNCI_MENIT = 15;
const BATAS_TIDAK_AKTIF_MS = 8 * 60 * 60 * 1000;
const UMUR_INGAT_MS = 30 * 24 * 60 * 60 * 1000;
/** Sesi tanpa "ingat" tetap dibatasi 24 jam, di samping batas 8 jam tidak aktif. */
const UMUR_BIASA_MS = 24 * 60 * 60 * 1000;

export const hashSandi = (sandi: string) => argon2.hash(sandi, { type: argon2.argon2id });
export const hashToken = (token: string) => createHash('sha256').update(token, 'utf8').digest();

// Dipakai saat username tidak ada, supaya waktu jawab login sama (AUTH-02).
let hashTiruan: Promise<string> | null = null;
const tiruan = () => (hashTiruan ??= hashSandi(randomBytes(16).toString('hex')));

/** Kata sandi sementara: 12 karakter, selalu berisi huruf dan angka (AUTH-04, AUTH-08). */
export function buatSandiSementara(): string {
  const huruf = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const angka = '23456789';
  const semua = huruf + angka;
  const c = [huruf[randomInt(huruf.length)]!, angka[randomInt(angka.length)]!];
  while (c.length < 12) c.push(semua[randomInt(semua.length)]!);
  for (let i = c.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [c[i], c[j]] = [c[j]!, c[i]!];
  }
  return c.join('');
}

interface BarisLogin {
  pengguna_id: string;
  hash_sandi: string;
  terkunci_sampai: Date | null;
  aktif: boolean;
  pegawai_aktif: boolean;
}

export interface HasilLogin {
  token: string;
  ingat: boolean;
  info: InfoSesi;
}

export async function login(username: string, sandi: string, ingat: boolean, perangkat: string | null): Promise<HasilLogin> {
  const u = username.trim();
  const baris = u
    ? await bacaSatu<BarisLogin>(
        `SELECT g.id AS pengguna_id, g.hash_sandi, g.terkunci_sampai, g.aktif, p.aktif AS pegawai_aktif
           FROM pengguna g JOIN pegawai p ON p.id = g.pegawai_id
          WHERE p.npp = $1 OR lower(p.email) = lower($1)
          LIMIT 1`,
        [u],
      )
    : null;

  if (!baris) {
    await argon2.verify(await tiruan(), sandi).catch(() => false);
    throw galat('LOGIN_GAGAL', PESAN_LOGIN_GAGAL);
  }
  if (baris.terkunci_sampai && baris.terkunci_sampai > new Date()) {
    // Tetap pesan yang sama: penyebabnya tidak dibocorkan (AUTH-02).
    await argon2.verify(baris.hash_sandi, sandi).catch(() => false);
    throw galat('LOGIN_GAGAL', PESAN_LOGIN_GAGAL);
  }
  const cocok = await argon2.verify(baris.hash_sandi, sandi).catch(() => false);
  if (!cocok || !baris.aktif || !baris.pegawai_aktif) {
    if (!cocok) await operasional.loginGagal(baris.pengguna_id, BATAS_GAGAL, KUNCI_MENIT);
    throw galat('LOGIN_GAGAL', PESAN_LOGIN_GAGAL);
  }

  await operasional.loginBerhasil(baris.pengguna_id);
  const token = randomBytes(32).toString('base64url');
  const hash = hashToken(token);
  await operasional.sesiBuat({
    hashToken: hash,
    penggunaId: baris.pengguna_id,
    kedaluwarsa: new Date(Date.now() + (ingat ? UMUR_INGAT_MS : UMUR_BIASA_MS)),
    ingat,
    perangkat: perangkat?.slice(0, 200) ?? null,
  });
  const pengguna = await dariHash(hash);
  if (!pengguna) throw galat('LOGIN_GAGAL', PESAN_LOGIN_GAGAL);
  return { token, ingat, info: infoSesi(pengguna) };
}

interface BarisSesi {
  pengguna_id: string;
  pegawai_id: string;
  nama: string;
  npp: string;
  email: string;
  posisi: Posisi | null;
  unit_id: string | null;
  jabatan: string | null;
  unit: string | null;
  foto_file_id: string | null;
  wajib_ganti_sandi: boolean;
  ingat: boolean;
  terakhir_aktif: Date;
  peran_admin: PeranAdmin[] | null;
}

async function dariHash(hash: Buffer): Promise<Pengguna | null> {
  const s = await bacaSatu<BarisSesi>(
    `SELECT g.id AS pengguna_id, p.id AS pegawai_id, p.nama_lengkap AS nama, p.npp, p.email,
            j.posisi_struktural AS posisi, p.unit_id, j.nama AS jabatan, un.nama AS unit, p.foto_file_id,
            g.wajib_ganti_sandi, s.ingat, s.terakhir_aktif,
            (SELECT array_agg(pa.peran ORDER BY pa.peran) FROM peran_admin pa WHERE pa.pegawai_id = p.id AND pa.aktif) AS peran_admin
       FROM sesi s
       JOIN pengguna g ON g.id = s.pengguna_id AND g.aktif
       JOIN pegawai p ON p.id = g.pegawai_id AND p.aktif
       LEFT JOIN jabatan j ON j.id = p.jabatan_id
       LEFT JOIN unit un ON un.id = p.unit_id
      WHERE s.hash_token = $1 AND s.dicabut IS NULL AND s.kedaluwarsa > now()`,
    [hash],
  );
  if (!s) return null;
  if (!s.ingat && Date.now() - s.terakhir_aktif.getTime() > BATAS_TIDAK_AKTIF_MS) {
    await operasional.sesiCabut(hash);
    return null;
  }
  return {
    penggunaId: s.pengguna_id,
    pegawaiId: s.pegawai_id,
    nama: s.nama,
    npp: s.npp,
    email: s.email,
    posisi: s.posisi,
    unitId: s.unit_id,
    jabatan: s.jabatan,
    unit: s.unit,
    fotoFileId: s.foto_file_id,
    peranStruktural: peranStrukturalDari(s.posisi),
    peranAdmin: s.peran_admin ?? [],
    wajibGantiSandi: s.wajib_ganti_sandi,
    hashToken: hash,
  };
}

/** AUTH-10: token divalidasi sebelum apa pun dijalankan. Melempar TIDAK_SAH. */
export async function dariToken(token: string | null): Promise<Pengguna> {
  if (!token || token.length > 100) throw galat('TIDAK_SAH', 'Sesi Anda sudah berakhir. Silakan masuk lagi.');
  const hash = hashToken(token);
  const u = await dariHash(hash);
  if (!u) throw galat('TIDAK_SAH', 'Sesi Anda sudah berakhir. Silakan masuk lagi.');
  await operasional.sesiSentuh(hash);
  return u;
}

export function infoSesi(u: Pengguna): InfoSesi {
  return {
    pegawaiId: u.pegawaiId,
    nama: u.nama,
    npp: u.npp,
    email: u.email,
    jabatan: u.jabatan,
    unit: u.unit,
    adaFoto: u.fotoFileId !== null,
    peranStruktural: u.peranStruktural,
    peranAdmin: u.peranAdmin,
    wajibGantiSandi: u.wajibGantiSandi,
    menu: u.wajibGantiSandi ? ['ubah_sandi'] : menuUntuk(u),
  };
}

/** AUTH-15: keluar mencabut sesi di server. */
export async function keluar(u: Pengguna): Promise<void> {
  await operasional.sesiCabut(u.hashToken);
}

/** AUTH-07. Sesi lain milik pengguna ini dicabut; sesi yang sedang dipakai tetap. */
export async function gantiSandi(u: Pengguna, sandiLama: string, sandiBaru: string): Promise<void> {
  const g = await bacaSatu<{ hash_sandi: string }>('SELECT hash_sandi FROM pengguna WHERE id = $1', [u.penggunaId]);
  if (!g || !(await argon2.verify(g.hash_sandi, sandiLama).catch(() => false))) {
    throw galat('MASUKAN', 'Kata sandi lama salah.', 'sandiLama');
  }
  const salah = periksaSandi(sandiBaru);
  if (salah) throw galat('MASUKAN', salah, 'sandiBaru');
  if (sandiBaru === sandiLama) throw galat('MASUKAN', 'Kata sandi baru harus berbeda dari yang lama.', 'sandiBaru');
  const hash = await hashSandi(sandiBaru);
  await transaksi(async (tx) => {
    await tulis(
      'pengguna', 'ubah', { id: u.penggunaId, hash_sandi: hash, wajib_ganti_sandi: false },
      { pelaku: u.pegawaiId, alasan: 'Ganti kata sandi sendiri' }, tx,
    );
    await operasional.sesiCabutSemua(tx, u.penggunaId, u.hashToken);
  });
}

/** Pegawai aktif yang sedang login sebagai pengguna ini — dipakai tes dan pekerjaan terjadwal. */
export async function jumlahSesiAktif(penggunaId: string): Promise<number> {
  const r = await baca<{ n: number }>(
    'SELECT count(*)::int AS n FROM sesi WHERE pengguna_id = $1 AND dicabut IS NULL AND kedaluwarsa > now()',
    [penggunaId],
  );
  return r[0]?.n ?? 0;
}
