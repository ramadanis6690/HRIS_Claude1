// Data pegawai, gaji berversi, impor, peran (PRD Fase 1 butir 4–7; SRS EMP-*, USR-*).
import ExcelJS from 'exceljs';
import { beforeAll, describe, expect, test } from 'vitest';
import { KOLOM_PEGAWAI, KOLOM_RIWAYAT } from '../../src/bersama/pegawai.js';
import { baca, bacaSatu } from '../../src/server/db.js';
import * as impor from '../../src/server/modul/impor.js';
import { buatEcv } from '../../src/server/modul/ecv.js';
import { adaDbTes, dirBerkasTes, harus, masuk, panggil, siapkanDb } from '../bantu.js';

describe.skipIf(!adaDbTes)('pegawai', () => {
  let hrd = '';
  let sa = '';
  beforeAll(async () => {
    await siapkanDb();
    [hrd, sa] = await Promise.all([masuk('C0009'), masuk('C0010')]);
  });

  test('EMP-19: setiap field formulir punya kolom di basis data', async () => {
    const kolom = async (t: string) => new Set((await baca<{ c: string }>("SELECT column_name AS c FROM information_schema.columns WHERE table_name = $1", [t])).map((r) => r.c));
    const pegawai = await kolom('pegawai');
    expect(KOLOM_PEGAWAI.map((k) => k.kolom).filter((k) => !pegawai.has(k))).toEqual([]);
    for (const [tabel, def] of Object.entries(KOLOM_RIWAYAT)) {
      const ada = await kolom(tabel);
      expect(def.kolom.map((k) => k.kolom).filter((k) => !ada.has(k)), tabel).toEqual([]);
    }
  });

  test('EMP-02: NIK harus 16 digit dan NPP unik, dengan pesan di kolomnya', async () => {
    const dasar = { npp: 'B0001', nama_lengkap: 'Baru Satu', email: 'b1@contoh.dpjm.test', jenis_kepegawaian: 'PKWT', status_pegawai: 'aktif' };
    const nik = await panggil(hrd, 'pegawai.simpan', { ...dasar, nik: '123' });
    expect(!nik.ok && nik.galat.kolom).toBe('nik');
    const kembar = await panggil(hrd, 'pegawai.simpan', { ...dasar, npp: 'C0001' });
    expect(!kembar.ok && kembar.galat.kolom).toBe('npp');
    const ok = await harus(hrd, 'pegawai.simpan', dasar);
    const r = await baca('SELECT 1 FROM riwayat_status WHERE pegawai_id = $1', [ok.id]);
    expect(r.length).toBe(1);
  });

  test('EMP-07: kenaikan gaji membuat versi baru dan versi lama tetap ada', async () => {
    const id = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0014'"))!.id;
    await harus(hrd, 'gaji.tambah', { pegawaiId: id, komponenKode: 'GAJI_POKOK', nominal: 3_500_000, berlakuMulai: '2026-11-01', noSk: 'SK-NAIK' });
    const v = (await harus(hrd, 'gaji.daftar', { pegawaiId: id })).filter((g) => g.komponenKode === 'GAJI_POKOK');
    expect(v.map((g) => [g.nominal, g.berlakuMulai, g.berlakuSampai])).toEqual([
      [3_500_000, '2026-11-01', null],
      [3_090_000, '2023-01-09', '2026-10-31'],
    ]);
    const mundur = await panggil(hrd, 'gaji.tambah', { pegawaiId: id, komponenKode: 'GAJI_POKOK', nominal: 1, berlakuMulai: '2026-01-01', noSk: null });
    expect(!mundur.ok && mundur.galat.kolom).toBe('berlakuMulai');
  });

  test('EMP-08: peringatan rentang Grade muncul tanpa memblokir', async () => {
    await harus(hrd, 'pengaturan.simpanGrade', { grade: '9', subGrade: 'A', masaKerjaMinThn: 0, masaKerjaMaxThn: 5, gapokMin: 4_000_000, gapokMax: 5_000_000, berlakuMulai: '2025-01-01', namaJabatan: null, pendidikanMin: null, tunjanganJabatan: null, gapokMed: null });
    const p = await harus(hrd, 'pegawai.simpan', { npp: 'B0002', nama_lengkap: 'Baru Dua', email: 'b2@contoh.dpjm.test', jenis_kepegawaian: 'PKWTT', status_pegawai: 'aktif', grade: '9', tgl_masuk: '2025-01-02' });
    const h = await harus(hrd, 'gaji.tambah', { pegawaiId: p.id, komponenKode: 'GAJI_POKOK', nominal: 7_000_000, berlakuMulai: '2025-01-02', noSk: null });
    expect(h.peringatan).toMatch(/di atas maksimum/);
    expect(h.usulanSubGrade).toBe('A');
  });

  test('EMP-17/18: impor 20 baris, satu baris salah membatalkan semua, dengan laporan baris', async () => {
    const templat = new ExcelJS.Workbook();
    await templat.xlsx.load((await impor.templat()) as unknown as ArrayBuffer);
    const ws = templat.getWorksheet('Pegawai')!;
    const kepala = (ws.getRow(1).values as string[]).slice(1);
    const baris = (i: number, ubah: Record<string, string> = {}) => {
      const d: Record<string, string> = { npp: `I${String(i).padStart(4, '0')}`, nama_lengkap: `Impor ${i}`, email: `impor${i}@contoh.dpjm.test`, jenis_kepegawaian: 'PKWT', status_pegawai: 'aktif', unit_kode: 'KSU', jabatan_nama: 'Staf', nik: `88880000000000${String(i).padStart(2, '0')}`, ...ubah };
      return kepala.map((k) => d[k] ?? null);
    };
    for (let i = 1; i <= 20; i++) ws.addRow(baris(i, i === 13 ? { nik: '12345' } : {}));
    const buf = Buffer.from(await templat.xlsx.writeBuffer()).toString('base64');

    const pr = await harus(hrd, 'pegawai.imporPratinjau', { isi: buf });
    expect(pr.sah).toBe(false);
    expect(pr.diabaikan).toBe(1); // baris CONTOH001
    // Baris 1 kunci kolom, baris 2 label, baris 3 contoh; data ke-13 ada di baris 16.
    expect(pr.galat).toEqual([{ baris: 16, kolom: 'nik', pesan: 'Tepat 16 digit angka' }]);
    const gagal = await panggil(hrd, 'pegawai.imporSimpan', { isi: buf });
    expect(gagal.ok).toBe(false);
    expect((await baca("SELECT 1 FROM pegawai WHERE npp LIKE 'I%'")).length).toBe(0);

    ws.getRow(16).getCell(kepala.indexOf('nik') + 1).value = '8888000000000013';
    const benar = Buffer.from(await templat.xlsx.writeBuffer()).toString('base64');
    expect((await harus(hrd, 'pegawai.imporPratinjau', { isi: benar })).sah).toBe(true);
    expect((await harus(hrd, 'pegawai.imporSimpan', { isi: benar })).jumlah).toBe(20);
    expect((await baca("SELECT 1 FROM pegawai WHERE npp LIKE 'I%'")).length).toBe(20);
  });

  test('EMP-15: e-CV PDF untuk pegawai tanpa foto', async () => {
    const id = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0020'"))!.id;
    const pdf = await buatEcv(id, dirBerkasTes);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1500);
  });

  test('USR-02: pegawai tanpa akun tampil dan bisa dibuatkan akun sekaligus', async () => {
    const d = await harus(hrd, 'pengguna.daftar', {});
    const tanpa = d.tanpaAkun.filter((p) => p.npp.startsWith('I'));
    expect(tanpa.length).toBe(20);
    const akun = await harus(hrd, 'pengguna.buatAkun', { pegawaiIds: tanpa.map((p) => p.id) });
    expect(akun.length).toBe(20);
    expect((await harus(hrd, 'pengguna.daftar', {})).tanpaAkun.filter((p) => p.npp.startsWith('I')).length).toBe(0);
  });

  test('USR-06/07: kombinasi bertentangan butuh alasan; hanya Super Admin yang memberi peran', async () => {
    const id = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0011'"))!.id;
    const olehHrd = await panggil(hrd, 'pengguna.aturPeran', { pegawaiId: id, peran: ['admin_payroll'], alasan: null });
    expect(!olehHrd.ok && olehHrd.galat.kode).toBe('DITOLAK');
    const tanpa = await panggil(sa, 'pengguna.aturPeran', { pegawaiId: id, peran: ['admin_payroll', 'admin_finance'], alasan: null });
    expect(!tanpa.ok && tanpa.galat.kolom).toBe('alasan');
    await harus(sa, 'pengguna.aturPeran', { pegawaiId: id, peran: ['admin_payroll', 'admin_finance'], alasan: 'Bendahara cuti panjang' });
    const b = await harus(sa, 'beranda.ringkasan', {});
    expect(b.superAdmin?.konflikPeran[0]).toMatchObject({ kombinasi: 'Admin Payroll + Admin Finance', alasan: 'Bendahara cuti panjang' });
  });

  test('USR-10: Super Admin terakhir tidak bisa dicabut', async () => {
    const id = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0010'"))!.id;
    const r = await panggil(sa, 'pengguna.aturPeran', { pegawaiId: id, peran: [], alasan: null });
    expect(!r.ok && r.galat.kode).toBe('ATURAN');
  });
});
