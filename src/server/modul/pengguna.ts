// User Management dan peran (PRD §4.2, SRS USR-01 – USR-10, AUTH-08, AUTH-09, AUTH-12).
import type { AkunBaru, BarisAkun, KonflikPeran, PeranAdmin, RingkasPegawai } from '../../bersama/aksi.js';
import { PERAN_ADMIN } from '../../bersama/aksi.js';
import { boolOpsional, daftarUuid, objek, teksOpsional, teksWajib, uuidWajib } from '../../core/validasi.js';
import { buatSandiSementara, hashSandi } from '../auth.js';
import { baca, bacaSatu, transaksi } from '../db.js';
import { galat } from '../galat.js';
import { peranStrukturalDari, type Pengguna, type Posisi } from '../izin.js';
import { operasional, tulis } from '../repo.js';

/** Kombinasi yang melemahkan pemisahan tugas (USR-06). Boleh, dengan alasan tertulis. */
export function kombinasiBertentangan(peran: readonly PeranAdmin[]): { kombinasi: string; akibat: string }[] {
  const hasil: { kombinasi: string; akibat: string }[] = [];
  if (peran.includes('admin_payroll') && peran.includes('admin_finance')) {
    hasil.push({
      kombinasi: 'Admin Payroll + Admin Finance',
      // USR-06b: ditulis apa adanya, bukan disembunyikan.
      akibat: 'Orang ini dapat menghitung payroll pada Tahap 2 dan mencairkannya pada Tahap 5. Pemisahan tugas Tahap 3–4 tetap ditegakkan basis data, tetapi kombinasi ini tidak tercakup olehnya.',
    });
  }
  if (peran.includes('auditor') && peran.some((p) => p !== 'auditor')) {
    hasil.push({ kombinasi: 'Auditor + peran admin lain', akibat: 'Orang ini memeriksa Audit Log atas perubahan yang bisa ia buat sendiri.' });
  }
  return hasil;
}

export async function daftarKonflik(): Promise<KonflikPeran[]> {
  const rows = await baca<{ pegawai_id: string; nama: string; peran: PeranAdmin[] }>(
    `SELECT pa.pegawai_id, p.nama_lengkap AS nama, array_agg(pa.peran ORDER BY pa.peran) AS peran
       FROM peran_admin pa JOIN pegawai p ON p.id = pa.pegawai_id
      WHERE pa.aktif AND p.aktif GROUP BY pa.pegawai_id, p.nama_lengkap`,
  );
  const hasil: KonflikPeran[] = [];
  for (const r of rows) {
    for (const k of kombinasiBertentangan(r.peran)) {
      // Alasan terakhir yang dicatat saat peran itu diberikan (USR-06a).
      const a = await bacaSatu<{ alasan: string | null }>(
        `SELECT alasan FROM audit_log WHERE tabel = 'peran_admin' AND alasan IS NOT NULL AND (sesudah->>'pegawai_id') = $1 ORDER BY no DESC LIMIT 1`,
        [r.pegawai_id],
      );
      hasil.push({ pegawaiId: r.pegawai_id, nama: r.nama, kombinasi: k.kombinasi, akibat: k.akibat, alasan: a?.alasan ?? null });
    }
  }
  return hasil;
}

export async function daftar(): Promise<{ akun: BarisAkun[]; tanpaAkun: RingkasPegawai[]; konflik: KonflikPeran[] }> {
  const akun = await baca<{
    pengguna_id: string; pegawai_id: string; npp: string; nama: string; email: string; jabatan: string | null; unit: string | null;
    posisi: Posisi | null; peran: PeranAdmin[] | null; aktif: boolean; wajib_ganti_sandi: boolean; terkunci_sampai: Date | null; login_terakhir: Date | null;
  }>(
    `SELECT g.id AS pengguna_id, p.id AS pegawai_id, p.npp, p.nama_lengkap AS nama, p.email, j.nama AS jabatan, un.nama AS unit,
            j.posisi_struktural AS posisi,
            (SELECT array_agg(pa.peran ORDER BY pa.peran) FROM peran_admin pa WHERE pa.pegawai_id = p.id AND pa.aktif) AS peran,
            g.aktif, g.wajib_ganti_sandi, g.terkunci_sampai, g.login_terakhir
       FROM pengguna g JOIN pegawai p ON p.id = g.pegawai_id
       LEFT JOIN jabatan j ON j.id = p.jabatan_id LEFT JOIN unit un ON un.id = p.unit_id
      ORDER BY g.aktif DESC, p.nama_lengkap`,
  );
  // USR-02: dihitung ulang setiap kali layar dibuka.
  const tanpa = await baca<{
    id: string; npp: string; nama: string; email: string; jabatan: string | null; unit: string | null;
    jenis_kepegawaian: RingkasPegawai['jenisKepegawaian']; status_pegawai: RingkasPegawai['statusPegawai'];
  }>(
    `SELECT p.id, p.npp, p.nama_lengkap AS nama, p.email, j.nama AS jabatan, un.nama AS unit, p.jenis_kepegawaian, p.status_pegawai
       FROM pegawai p LEFT JOIN jabatan j ON j.id = p.jabatan_id LEFT JOIN unit un ON un.id = p.unit_id
      WHERE p.aktif AND NOT EXISTS (SELECT 1 FROM pengguna g WHERE g.pegawai_id = p.id)
      ORDER BY p.nama_lengkap`,
  );
  return {
    akun: akun.map((a) => ({
      penggunaId: a.pengguna_id, pegawaiId: a.pegawai_id, npp: a.npp, nama: a.nama, email: a.email, jabatan: a.jabatan, unit: a.unit,
      peranStruktural: peranStrukturalDari(a.posisi), peranAdmin: a.peran ?? [], aktif: a.aktif, wajibGantiSandi: a.wajib_ganti_sandi,
      terkunciSampai: a.terkunci_sampai && a.terkunci_sampai > new Date() ? a.terkunci_sampai.toISOString() : null,
      loginTerakhir: a.login_terakhir?.toISOString() ?? null,
    })),
    tanpaAkun: tanpa.map((t) => ({
      id: t.id, npp: t.npp, nama: t.nama, email: t.email, jabatan: t.jabatan, unit: t.unit,
      jenisKepegawaian: t.jenis_kepegawaian, statusPegawai: t.status_pegawai, aktif: true, punyaAkun: false,
    })),
    konflik: await daftarKonflik(),
  };
}

/** USR-01/USR-02: satu akun per pegawai; NPP dan email diambil dari data pegawai. */
export async function buatAkun(u: Pengguna, data: unknown): Promise<AkunBaru[]> {
  const ids = daftarUuid(objek(data), 'pegawaiIds', 100);
  const calon = await baca<{ id: string; nama: string; npp: string }>(
    `SELECT p.id, p.nama_lengkap AS nama, p.npp FROM pegawai p
      WHERE p.id = ANY($1::uuid[]) AND p.aktif AND NOT EXISTS (SELECT 1 FROM pengguna g WHERE g.pegawai_id = p.id)`,
    [ids],
  );
  if (calon.length === 0) throw galat('ATURAN', 'Pegawai yang dipilih sudah punya akun atau tidak aktif.');
  const sandi = await Promise.all(calon.map(async (c) => {
    const s = buatSandiSementara();
    return { ...c, sandi: s, hash: await hashSandi(s) };
  }));
  await transaksi(async (tx) => {
    for (const c of sandi) {
      await tulis('pengguna', 'tambah', { pegawai_id: c.id, hash_sandi: c.hash, wajib_ganti_sandi: true }, { pelaku: u.pegawaiId, alasan: 'Buat akun' }, tx);
    }
  });
  // Ditampilkan sekali ke admin (AUTH-08); tidak pernah dicatat di Audit Log maupun log.
  return sandi.map((c) => ({ pegawaiId: c.id, nama: c.nama, npp: c.npp, sandiSementara: c.sandi }));
}

/** AUTH-08/AUTH-09: sandi sementara ditampilkan sekali; reset tercatat tanpa sandinya. */
export async function resetSandi(u: Pengguna, data: unknown): Promise<{ sandiSementara: string }> {
  const penggunaId = uuidWajib(objek(data), 'penggunaId');
  const sasaran = await bacaSatu<{ pegawai_id: string }>('SELECT pegawai_id FROM pengguna WHERE id = $1', [penggunaId]);
  if (!sasaran) throw galat('TIDAK_ADA', 'Akun tidak ditemukan.');
  const sandi = buatSandiSementara();
  const hash = await hashSandi(sandi);
  await transaksi(async (tx) => {
    await tulis('pengguna', 'ubah', { id: penggunaId, hash_sandi: hash, wajib_ganti_sandi: true, gagal_login: 0, terkunci_sampai: null }, {
      pelaku: u.pegawaiId, alasan: 'Reset kata sandi oleh admin',
    }, tx);
    await operasional.sesiCabutSemua(tx, penggunaId);
  });
  return { sandiSementara: sandi };
}

/** USR-08, AUTH-12: menonaktifkan akun tidak menghapus apa pun, dan mencabut semua sesinya. */
export async function aturAktif(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const penggunaId = uuidWajib(d, 'penggunaId');
  const aktif = boolOpsional(d, 'aktif', false);
  const alasan = teksWajib(d, 'alasan', { maks: 300 });
  const sasaran = await bacaSatu<{ pegawai_id: string }>('SELECT pegawai_id FROM pengguna WHERE id = $1', [penggunaId]);
  if (!sasaran) throw galat('TIDAK_ADA', 'Akun tidak ditemukan.');
  if (!aktif && sasaran.pegawai_id === u.pegawaiId) throw galat('ATURAN', 'Anda tidak bisa menonaktifkan akun Anda sendiri.');
  if (!aktif) await pastikanBukanSuperAdminTerakhir(sasaran.pegawai_id);
  await transaksi(async (tx) => {
    await tulis('pengguna', 'ubah', { id: penggunaId, aktif }, { pelaku: u.pegawaiId, alasan }, tx);
    if (!aktif) await operasional.sesiCabutSemua(tx, penggunaId);
  });
  return null;
}

/** USR-10: minimal selalu ada satu super_admin aktif. */
async function pastikanBukanSuperAdminTerakhir(pegawaiId: string): Promise<void> {
  const r = await bacaSatu<{ lain: number; dia: boolean }>(
    `SELECT count(*) FILTER (WHERE pa.pegawai_id <> $1)::int AS lain,
            bool_or(pa.pegawai_id = $1) AS dia
       FROM peran_admin pa JOIN pegawai p ON p.id = pa.pegawai_id AND p.aktif
       JOIN pengguna g ON g.pegawai_id = p.id AND g.aktif
      WHERE pa.peran = 'super_admin' AND pa.aktif`,
    [pegawaiId],
  );
  if (r?.dia && r.lain === 0) throw galat('ATURAN', 'Super Admin terakhir tidak bisa dicabut. Tunjuk Super Admin lain lebih dulu.');
}

/**
 * USR-05 – USR-07: hanya super_admin yang memberi atau mencabut peran admin.
 * Kombinasi bertentangan boleh disimpan dengan alasan tertulis (USR-06).
 */
export async function aturPeran(u: Pengguna, data: unknown): Promise<null> {
  const d = objek(data);
  const pegawaiId = uuidWajib(d, 'pegawaiId');
  const mentah = d.peran;
  if (!Array.isArray(mentah) || !mentah.every((p) => (PERAN_ADMIN as readonly unknown[]).includes(p))) {
    throw galat('MASUKAN', 'Daftar peran tidak sah.', 'peran');
  }
  const peran = [...new Set(mentah as PeranAdmin[])];
  const alasan = teksOpsional(d, 'alasan', { maks: 500 });
  const konflik = kombinasiBertentangan(peran);
  if (konflik.length > 0 && !alasan) {
    throw galat('MASUKAN', `Kombinasi ${konflik.map((k) => k.kombinasi).join(' dan ')} wajib disertai alasan tertulis.`, 'alasan');
  }
  const p = await bacaSatu<{ aktif: boolean }>('SELECT aktif FROM pegawai WHERE id = $1', [pegawaiId]);
  if (!p) throw galat('TIDAK_ADA', 'Pegawai tidak ditemukan.');

  const lama = await baca<{ id: string; peran: PeranAdmin; aktif: boolean }>('SELECT id, peran, aktif FROM peran_admin WHERE pegawai_id = $1', [pegawaiId]);
  const dicabut = lama.filter((l) => l.aktif && !peran.includes(l.peran));
  if (dicabut.some((l) => l.peran === 'super_admin')) await pastikanBukanSuperAdminTerakhir(pegawaiId);

  await transaksi(async (tx) => {
    const jejak = { pelaku: u.pegawaiId, alasan: alasan ?? null };
    for (const l of dicabut) await tulis('peran_admin', 'ubah', { id: l.id, aktif: false }, jejak, tx);
    for (const r of peran) {
      const ada = lama.find((l) => l.peran === r);
      if (!ada) {
        await tulis('peran_admin', 'tambah', { pegawai_id: pegawaiId, peran: r, diberikan_oleh: u.pegawaiId }, jejak, tx);
      } else if (!ada.aktif) {
        await tulis('peran_admin', 'ubah', { id: ada.id, aktif: true, diberikan_oleh: u.pegawaiId, diberikan_pada: new Date() }, jejak, tx);
      }
    }
  });
  return null;
}
