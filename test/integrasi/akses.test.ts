// Tes akses (design §11.1, PRD Fase 1 butir 3): setiap aksi × peran.
import { beforeAll, describe, expect, test } from 'vitest';
import type { NamaAksi } from '../../src/bersama/aksi.js';
import { AKSI } from '../../src/server/api.js';
import { bacaSatu } from '../../src/server/db.js';
import { adaDbTes, harus, masuk, panggil, siapkanDb } from '../bantu.js';

const SEMUA = Object.keys(AKSI) as NamaAksi[];

describe.skipIf(!adaDbTes)('akses per peran', () => {
  let staff = '';
  let manager = '';
  let hrd = '';
  let auditor = '';
  let idStaff = '';
  let idStaffLain = '';

  beforeAll(async () => {
    await siapkanDb();
    [staff, manager, hrd, auditor] = await Promise.all([masuk('C0014'), masuk('C0004'), masuk('C0009'), masuk('C0013')]);
    idStaff = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0014'"))!.id;
    idStaffLain = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0020'"))!.id; // staf KSU, bawahan C0004
  });

  test('AUTH-10: setiap aksi selain login ditolak tanpa token dan dengan token palsu', async () => {
    for (const aksi of SEMUA.filter((a) => a !== 'auth.login')) {
      for (const token of [null, 'palsu', 'x'.repeat(43)]) {
        const r = await panggil(token, aksi, {});
        expect(r.ok, `${aksi} dengan token ${token}`).toBe(false);
        if (!r.ok) expect(r.galat.kode, aksi).toBe('TIDAK_SAH');
      }
    }
  });

  test('OTZ-01: aksi admin ditolak untuk pegawai biasa', async () => {
    const khususAdmin = SEMUA.filter((a) => Array.isArray(AKSI[a].izin) && !(AKSI[a].izin as readonly string[]).includes('employee'));
    expect(khususAdmin.length).toBeGreaterThan(20);
    for (const aksi of khususAdmin) {
      const izin = AKSI[aksi].izin as readonly string[];
      if (izin.some((p) => ['manager', 'direksi', 'dirut'].includes(p))) continue; // C0014 Staff: tetap harus ditolak, diperiksa di bawah
      const r = await panggil(staff, aksi, {});
      expect(r.ok, aksi).toBe(false);
      if (!r.ok) expect(r.galat.kode, aksi).toBe('DITOLAK');
    }
    const rekap = await panggil(staff, 'presensi.daftar', { tanggal: '2026-10-01' });
    expect(rekap.ok).toBe(false);
  });

  test('OTZ-06: auditor tidak bisa menjalankan aksi tulis apa pun', async () => {
    const tulis = SEMUA.filter((a) => AKSI[a].tulis);
    expect(tulis.length).toBeGreaterThan(15);
    for (const aksi of tulis) {
      const r = await panggil(auditor, aksi, {});
      expect(r.ok, aksi).toBe(false);
      if (!r.ok) expect(r.galat.kode, aksi).toBe('DITOLAK');
    }
  });

  test('OTZ-05: Admin HRD ditolak membaca Audit Log oleh server', async () => {
    const r = await panggil(hrd, 'audit.baca', { mulai: '2026-01-01', akhir: '2026-12-31' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.galat.kode).toBe('DITOLAK');
    const a = await panggil(auditor, 'audit.baca', { mulai: '2026-01-01', akhir: '2026-12-31' });
    expect(a.ok).toBe(true);
  });

  test('OTZ-02: pegawai A tidak bisa membaca data pegawai B', async () => {
    const lain = await panggil(staff, 'pegawai.detail', { id: idStaffLain });
    expect(lain.ok).toBe(false);
    const gaji = await panggil(staff, 'gaji.daftar', { pegawaiId: idStaffLain });
    expect(gaji.ok).toBe(false);
    const diri = await harus(staff, 'pegawai.detail', { id: idStaff });
    expect(diri.cakupan).toBe('penuh');
    expect(diri.gaji).not.toBeNull();
  });

  test('OTZ-03: Manager melihat presensi timnya dan profil dasar, tetapi tidak gajinya', async () => {
    const d = await harus(manager, 'pegawai.detail', { id: idStaffLain });
    expect(d.cakupan).toBe('dasar');
    expect(d.gaji).toBeNull();
    expect(d.pegawai).not.toHaveProperty('nik');
    expect(d.pegawai).not.toHaveProperty('bank_rekening');
    const gaji = await panggil(manager, 'gaji.daftar', { pegawaiId: idStaffLain });
    expect(gaji.ok).toBe(false);
    const rekap = await harus(manager, 'presensi.daftar', { tanggal: '2026-10-01' });
    expect(rekap.every((b) => b.unit === 'Kepesertaan, SDM & Umum')).toBe(true);
    // Pegawai di luar unitnya tidak terbaca.
    expect((await panggil(manager, 'pegawai.detail', { id: idStaff })).ok).toBe(false);
  });

  test('UI-02a: menu Staff tanpa peran admin hanya HARIAN (tanpa rekap) dan SAYA', async () => {
    const s = await harus(staff, 'auth.saya', {});
    expect(s.menu).toEqual(['beranda', 'presensi', 'profil', 'ubah_sandi']);
  });
});
