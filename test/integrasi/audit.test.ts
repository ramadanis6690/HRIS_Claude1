// Audit Log append-only dan berantai hash (SRS AUD-01 – AUD-06).
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, test } from 'vitest';
import * as audit from '../../src/server/audit.js';
import { baca } from '../../src/server/db.js';
import { adaDbTes, harus, masuk, psqlPemilik, siapkanDb, URL_TES } from '../bantu.js';

describe.skipIf(!adaDbTes)('Audit Log', () => {
  beforeAll(siapkanDb);

  test('setiap perubahan tercatat dan rantai utuh', async () => {
    const hrd = await masuk('C0009');
    const p = (await harus(hrd, 'pegawai.daftar', { cari: 'C0014' }))[0]!;
    await harus(hrd, 'pegawai.simpan', { id: p.id, no_hp: '081299990000' } as never);
    const log = await baca<{ sebelum: { no_hp: string }; sesudah: { no_hp: string } }>(
      "SELECT sebelum, sesudah FROM audit_log WHERE tabel = 'pegawai' AND baris_id = $1 AND aksi = 'ubah' ORDER BY no DESC LIMIT 1",
      [p.id],
    );
    expect(log[0]!.sesudah.no_hp).toBe('081299990000');
    expect(log[0]!.sebelum.no_hp).not.toBe('081299990000');
    const r = await audit.periksaRantai();
    expect(r.utuh).toBe(true);
    expect(r.jumlahBaris).toBeGreaterThan(100);
  });

  test('AUD-02: UPDATE dan DELETE audit_log sebagai hris_app ditolak basis data', () => {
    for (const sql of ["UPDATE audit_log SET alasan = 'x' WHERE no = 1", 'DELETE FROM audit_log WHERE no = 1']) {
      expect(() => execFileSync('psql', [URL_TES, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], { stdio: 'pipe' })).toThrow(/permission denied/);
    }
  });

  test('AUD-04: hris_app tidak bisa menghapus fisik data bisnis', () => {
    expect(() => execFileSync('psql', [URL_TES, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', 'DELETE FROM pegawai'], { stdio: 'pipe' })).toThrow(/permission denied/);
  });

  test('AUD-06: hash sandi dan token tidak pernah masuk Audit Log', async () => {
    const r = await baca<{ n: number }>("SELECT count(*)::int AS n FROM audit_log WHERE sebelum ? 'hash_sandi' OR sesudah ? 'hash_sandi' OR sesudah ? 'hash_token'");
    expect(r[0]!.n).toBe(0);
  });

  test('AUD-03: perubahan langsung oleh pemilik basis data terdeteksi "Periksa rantai"', async () => {
    // Trigger juga menolak pemilik; ia harus mematikannya dulu — persis yang dilakukan penyusup.
    psqlPemilik(`ALTER TABLE audit_log DISABLE TRIGGER audit_log_tanpa_update;
                 UPDATE audit_log SET alasan = 'diubah diam-diam' WHERE no = 7;
                 ALTER TABLE audit_log ENABLE TRIGGER audit_log_tanpa_update;`);
    const r = await audit.periksaRantai();
    expect(r.utuh).toBe(false);
    expect(r.barisRusak).toBe(7);
  });
});
