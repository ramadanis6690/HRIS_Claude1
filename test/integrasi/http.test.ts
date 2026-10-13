// Lapis HTTP: cookie sesi, header keamanan, unduhan berizin (AUTH-13, OTZ-07, OTZ-08).
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { bacaSatu } from '../../src/server/db.js';
import { buatServer } from '../../src/server/main.js';
import { KANTOR_CONTOH } from '../../scripts/data-contoh.js';
import { adaDbTes, dirBerkasTes, JPEG_KECIL, siapkanDb, URL_TES } from '../bantu.js';

describe.skipIf(!adaDbTes)('HTTP', () => {
  let alamat = '';
  let tutup = () => {};
  beforeAll(async () => {
    await siapkanDb();
    const s = buatServer({
      lingkungan: 'pengembangan', databaseUrl: URL_TES, port: 0, host: '127.0.0.1', dirBerkas: dirBerkasTes,
      cookieAman: true, dirStatis: null, asalSah: [],
    });
    await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok));
    alamat = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    tutup = () => s.close();
  });
  afterAll(() => tutup());

  const api = (aksi: string, data: unknown, cookie?: string, header: Record<string, string> = {}) =>
    fetch(`${alamat}/api`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...header }, body: JSON.stringify({ aksi, data }) });
  const masuk = async (u: string) => {
    const r = await api('auth.login', { username: u, sandi: 'Contoh#2026', ingat: false });
    const c = r.headers.get('set-cookie')!;
    return { setCookie: c, cookie: c.split(';')[0]! };
  };

  test('AUTH-13: cookie sesi HttpOnly, Secure, SameSite=Lax; token tidak ada di badan respons', async () => {
    const r = await api('auth.login', { username: 'C0014', sandi: 'Contoh#2026', ingat: false });
    const c = r.headers.get('set-cookie')!;
    expect(c).toMatch(/^hris_sesi=[A-Za-z0-9_-]{43};/);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    const token = c.split(';')[0]!.split('=')[1]!;
    expect(await r.text()).not.toContain(token);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  test('permintaan dari situs lain ditolak walau membawa cookie', async () => {
    const { cookie } = await masuk('C0014');
    const r = await api('auth.saya', {}, cookie, { Origin: 'https://situs-jahat.example' });
    expect(r.status).toBe(403);
  });

  test('OTZ-07/08: foto presensi hanya terbuka untuk pemiliknya, HRD, dan Manager unitnya', async () => {
    const pemilik = await masuk('C0020'); // staf KSU
    const r = await api('presensi.checkIn', { lat: KANTOR_CONTOH.lat, lng: KANTOR_CONTOH.lng, akurasi: 10, foto: JPEG_KECIL }, pemilik.cookie);
    const p = (await r.json()) as { data: { fotoBerkasId: string } };
    const url = `${alamat}/api/unduh/berkas/${p.data.fotoBerkasId}`;
    const unduh = async (cookie?: string) => (await fetch(url, { headers: cookie ? { Cookie: cookie } : {} })).status;
    expect(await unduh()).toBe(401);
    expect(await unduh(pemilik.cookie)).toBe(200);
    expect(await unduh((await masuk('C0009')).cookie)).toBe(200); // Admin HRD
    expect(await unduh((await masuk('C0004')).cookie)).toBe(200); // Manager KSU
    expect(await unduh((await masuk('C0005')).cookie)).toBe(404); // Manager unit lain
    expect(await unduh((await masuk('C0010')).cookie)).toBe(404); // Super Admin bukan HRD
  });

  test('e-CV dan templat impor bisa diunduh HRD; e-CV orang lain ditolak untuk Staff', async () => {
    const hrd = await masuk('C0009');
    const id = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0014'"))!.id;
    const ecv = await fetch(`${alamat}/api/unduh/ecv/${id}`, { headers: { Cookie: hrd.cookie } });
    expect(ecv.status).toBe(200);
    expect(ecv.headers.get('content-type')).toBe('application/pdf');
    const templat = await fetch(`${alamat}/api/unduh/templat-impor/`, { headers: { Cookie: hrd.cookie } });
    expect(templat.status).toBe(200);
    const staff = await masuk('C0015');
    expect((await fetch(`${alamat}/api/unduh/ecv/${id}`, { headers: { Cookie: staff.cookie } })).status).toBe(404);
  });
});
