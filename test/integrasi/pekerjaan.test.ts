// Pekerjaan terjadwal (design §9; SRS ATT-13, USR-09).
import { beforeAll, describe, expect, test } from 'vitest';
import { bacaSatu } from '../../src/server/db.js';
import { jalankanPekerjaan } from '../../src/server/pekerjaan/jalankan.js';
import { KANTOR_CONTOH } from '../../scripts/data-contoh.js';
import { adaDbTes, harus, JPEG_KECIL, masuk, panggil, psqlPemilik, siapkanDb } from '../bantu.js';

describe.skipIf(!adaDbTes)('pekerjaan terjadwal', () => {
  beforeAll(siapkanDb);

  test('ATT-13: foto presensi > 365 hari dihapus; baris presensinya tetap', async () => {
    const t = await masuk('C0014');
    const p = await harus(t, 'presensi.checkIn', { lat: KANTOR_CONTOH.lat, lng: KANTOR_CONTOH.lng, akurasi: 10, foto: JPEG_KECIL });
    psqlPemilik(`UPDATE berkas SET dibuat_pada = now() - interval '400 days' WHERE id = (SELECT foto_file_id FROM presensi WHERE id = '${p.id}')`);
    expect(await jalankanPekerjaan('hapus-foto')).toBe(1);
    const r = await bacaSatu<{ foto_dihapus_pada: Date | null }>('SELECT foto_dihapus_pada FROM presensi WHERE id = $1', [p.id]);
    expect(r?.foto_dihapus_pada).not.toBeNull();
    const log = await bacaSatu<{ berhasil: boolean }>("SELECT berhasil FROM log_pemicu WHERE pekerjaan = 'hapus-foto' ORDER BY waktu DESC LIMIT 1");
    expect(log?.berhasil).toBe(true);
  });

  test('USR-09: pegawai Berhenti nonaktif setelah tanggal berhentinya', async () => {
    const hrd = await masuk('C0009');
    const t = await masuk('C0020');
    const id = (await bacaSatu<{ id: string }>("SELECT id FROM pegawai WHERE npp = 'C0020'"))!.id;
    await harus(hrd, 'pegawai.ubahStatus', { pegawaiId: id, status: 'berhenti', tglMulai: '2026-08-31', keterangan: 'Mengundurkan diri' });
    expect(await jalankanPekerjaan('nonaktifkan-berhenti')).toBe(1);
    expect((await panggil(t, 'auth.saya', {})).ok).toBe(false);
    const p = await bacaSatu<{ aktif: boolean }>('SELECT aktif FROM pegawai WHERE id = $1', [id]);
    expect(p?.aktif).toBe(false);
  });
});
