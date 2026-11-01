// Login, sesi, dan kata sandi (PRD Fase 1 butir 1–2; SRS AUTH-*).
import { beforeAll, describe, expect, test } from 'vitest';
import { jalankan } from '../../src/server/api.js';
import { bacaSatu, baca } from '../../src/server/db.js';
import { adaDbTes, harus, konteks, masuk, panggil, siapkanDb } from '../bantu.js';

const PESAN = 'Username atau kata sandi salah.';
const login = (username: string, sandi: string) => jalankan({ aksi: 'auth.login', data: { username, sandi, ingat: false }, token: null }, konteks);

describe.skipIf(!adaDbTes)('autentikasi', () => {
  beforeAll(siapkanDb);

  test('AUTH-01: masuk dengan NPP dan dengan email menunjuk akun yang sama', async () => {
    const a = await login('C0015', 'Contoh#2026');
    const b = await login('C0015@CONTOH.dpjm.test', 'Contoh#2026');
    expect(a.respons.ok && b.respons.ok).toBe(true);
    if (a.respons.ok && b.respons.ok) expect((a.respons.data as { pegawaiId: string }).pegawaiId).toBe((b.respons.data as { pegawaiId: string }).pegawaiId);
  });

  test('AUTH-02: pesan gagal selalu sama', async () => {
    const pesan = await Promise.all([login('TIDAKADA', 'apa saja1'), login('C0015', 'salah123')]);
    for (const p of pesan) {
      expect(p.respons.ok).toBe(false);
      if (!p.respons.ok) expect(p.respons.galat.pesan).toBe(PESAN);
    }
  });

  test('AUTH-03/AUTH-13: hash argon2id, token disimpan sebagai SHA-256', async () => {
    const g = await bacaSatu<{ hash_sandi: string }>("SELECT hash_sandi FROM pengguna g JOIN pegawai p ON p.id = g.pegawai_id WHERE p.npp = 'C0015'");
    expect(g!.hash_sandi.startsWith('$argon2id$')).toBe(true);
    const s = await baca<{ n: number }>('SELECT octet_length(hash_token) AS n FROM sesi LIMIT 1');
    expect(s[0]!.n).toBe(32);
  });

  test('AUTH-05: terkunci 15 menit setelah 5 gagal; sandi benar pun ditolak selama terkunci', async () => {
    for (let i = 0; i < 5; i++) await login('C0016', 'salah123');
    const r = await login('C0016', 'Contoh#2026');
    expect(r.respons.ok).toBe(false);
    const g = await bacaSatu<{ menit: number }>(
      "SELECT round(extract(epoch FROM terkunci_sampai - now()) / 60)::int AS menit FROM pengguna g JOIN pegawai p ON p.id = g.pegawai_id WHERE p.npp = 'C0016'",
    );
    expect(g!.menit).toBeGreaterThanOrEqual(14);
    expect(g!.menit).toBeLessThanOrEqual(15);
  });

  test('AUTH-15: keluar mencabut sesi di server', async () => {
    const t = await masuk('C0017');
    await harus(t, 'auth.keluar', {});
    const r = await panggil(t, 'auth.saya', {});
    expect(r.ok).toBe(false);
  });

  test('AUTH-08/09, AUTH-06: reset sandi oleh HRD tercatat tanpa sandinya, dan memaksa ganti sandi', async () => {
    const hrd = await masuk('C0009');
    const sasaran = await masuk('C0018');
    const daftar = await harus(hrd, 'pengguna.daftar', {});
    const akun = daftar.akun.find((a) => a.npp === 'C0018')!;
    const { sandiSementara } = await harus(hrd, 'pengguna.resetSandi', { penggunaId: akun.penggunaId });
    expect(sandiSementara).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{12}$/);

    // Sesi lama dicabut.
    expect((await panggil(sasaran, 'auth.saya', {})).ok).toBe(false);

    const log = await baca<{ sebelum: string; sesudah: string; alasan: string }>(
      "SELECT sebelum::text, sesudah::text, alasan FROM audit_log WHERE tabel = 'pengguna' AND alasan = 'Reset kata sandi oleh admin'",
    );
    expect(log.length).toBe(1);
    expect(log[0]!.sebelum + log[0]!.sesudah).not.toContain(sandiSementara);
    expect(log[0]!.sebelum + log[0]!.sesudah).not.toContain('hash_sandi');

    // AUTH-06: selama wajib ganti, aksi lain ditolak.
    const baru = await masuk('C0018', sandiSementara);
    const ditolak = await panggil(baru, 'presensi.hariIni', {});
    expect(!ditolak.ok && ditolak.galat.kode).toBe('WAJIB_GANTI_SANDI');
    await harus(baru, 'auth.gantiSandi', { sandiLama: sandiSementara, sandiBaru: 'SandiBaru123' });
    expect((await panggil(baru, 'presensi.hariIni', {})).ok).toBe(true);
  });

  test('AUTH-04: kata sandi baru tanpa angka ditolak dengan pesan di kolomnya', async () => {
    const t = await masuk('C0019');
    const r = await panggil(t, 'auth.gantiSandi', { sandiLama: 'Contoh#2026', sandiBaru: 'hanyahuruf' });
    expect(!r.ok && r.galat.kolom).toBe('sandiBaru');
  });

  test('AUTH-12: menonaktifkan akun mencabut semua sesinya', async () => {
    const hrd = await masuk('C0009');
    const t = await masuk('C0019');
    const akun = (await harus(hrd, 'pengguna.daftar', {})).akun.find((a) => a.npp === 'C0019')!;
    await harus(hrd, 'pengguna.aturAktif', { penggunaId: akun.penggunaId, aktif: false, alasan: 'Tes' });
    expect((await panggil(t, 'auth.saya', {})).ok).toBe(false);
    expect((await login('C0019', 'Contoh#2026')).respons.ok).toBe(false);
  });
});
