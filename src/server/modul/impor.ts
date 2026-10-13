// Impor data pegawai dari Excel (SRS EMP-17, EMP-18): pratinjau, validasi semua
// baris, lalu semua masuk atau tidak sama sekali dalam satu transaksi.
// Baris dengan NPP berawalan CONTOH diabaikan.
import ExcelJS from 'exceljs';
import type { GalatImpor, PratinjauImpor } from '../../bersama/aksi.js';
import { JENIS_KEPEGAWAIAN, LABEL_STATUS_PEGAWAI, STATUS_PEGAWAI } from '../../bersama/aksi.js';
import { KOLOM_PEGAWAI, PTKP, sakelarBawaan, type DefKolom } from '../../bersama/pegawai.js';
import { tanggalWIB } from '../../core/tanggal.js';
import { GalatMasukan, objek } from '../../core/validasi.js';
import { baca, transaksi } from '../db.js';
import { galat } from '../galat.js';
import type { Pengguna } from '../izin.js';
import { tulis } from '../repo.js';
import { nilaiKolom } from './pegawai.js';

export const NAMA_TEMPLAT = 'Template_Data_Pegawai_DPJM.xlsx';
const BARIS_DATA_PERTAMA = 3;

/** Kolom templat: kolom pegawai, dengan rujukan diganti kode/nama yang bisa diketik manusia. */
const KOLOM_TEMPLAT: { kunci: string; label: string; def: DefKolom }[] = KOLOM_PEGAWAI.filter(
  (k) => !['tgl_berhenti', 'alasan_berhenti'].includes(k.kolom),
).map((def) => {
  const kunci = def.jenis === 'unit' ? 'unit_kode' : def.jenis === 'jabatan' ? 'jabatan_nama' : def.jenis === 'titik_kantor' ? 'titik_kantor_nama' : def.kolom;
  const petunjuk =
    def.jenis === 'ya_tidak' ? ' (Ya/Tidak)' : def.jenis === 'tanggal' ? ' (yyyy-mm-dd)' : def.jenis === 'unit' ? ' (kode unit)' : def.opsi ? ' (lihat Petunjuk)' : '';
  return { kunci, label: `${def.label}${def.wajib ? ' *' : ''}${petunjuk}`, def };
});

export async function templat(): Promise<Buffer> {
  const [unit, jabatan, titik] = await Promise.all([
    baca<{ kode: string; nama: string }>('SELECT kode, nama FROM unit WHERE aktif ORDER BY kode'),
    baca<{ nama: string }>('SELECT nama FROM jabatan WHERE aktif ORDER BY nama'),
    baca<{ nama: string }>('SELECT nama FROM titik_kantor WHERE aktif ORDER BY nama'),
  ]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pegawai');
  ws.addRow(KOLOM_TEMPLAT.map((k) => k.kunci));
  ws.addRow(KOLOM_TEMPLAT.map((k) => k.label));
  ws.addRow(KOLOM_TEMPLAT.map((k) => contoh(k.kunci, k.def)));
  ws.getRow(1).font = { bold: true, color: { argb: 'FF5C5C5C' } };
  ws.getRow(2).font = { bold: true };
  ws.getRow(3).font = { italic: true, color: { argb: 'FF8A8A8A' } };
  KOLOM_TEMPLAT.forEach((k, i) => {
    const kol = ws.getColumn(i + 1);
    kol.width = Math.max(14, Math.min(40, k.label.length + 2));
    // NIK, rekening, NPP tetap teks: nol di depan bermakna dan 16 digit melampaui presisi angka Excel.
    if (k.def.jenis === 'teks') kol.numFmt = '@';
  });
  ws.views = [{ state: 'frozen', ySplit: 2 }];

  const p = wb.addWorksheet('Petunjuk');
  p.addRow(['Isi data mulai baris 3 di tab Pegawai. Baris 1 jangan diubah. Baris dengan NPP berawalan CONTOH diabaikan.']);
  p.addRow(['Impor bersifat semua atau tidak sama sekali: satu baris salah membatalkan seluruh berkas.']);
  p.addRow([]);
  p.addRow(['Jenis kepegawaian', ...JENIS_KEPEGAWAIAN]);
  p.addRow(['Status pegawai (isi kodenya)', ...STATUS_PEGAWAI.map((s) => `${s} = ${LABEL_STATUS_PEGAWAI[s]}`)]);
  p.addRow(['PTKP', ...PTKP]);
  p.addRow(['Jenis kelamin', 'L', 'P']);
  p.addRow(['Kode unit', ...unit.map((u) => `${u.kode} = ${u.nama}`)]);
  p.addRow(['Nama jabatan', ...jabatan.map((j) => j.nama)]);
  p.addRow(['Nama titik kantor', ...titik.map((t) => t.nama)]);
  p.addRow(['Ya/Tidak kosong', 'mengikuti nilai bawaan jenis kepegawaian']);
  p.getColumn(1).width = 30;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function contoh(kunci: string, def: DefKolom): string {
  const c: Record<string, string> = {
    npp: 'CONTOH001', nama_lengkap: 'Nama Contoh', email: 'contoh@dpjm.co.id', jenis_kepegawaian: 'PKWTT',
    status_pegawai: 'aktif', unit_kode: 'KSU', jabatan_nama: 'Officer', tgl_masuk: '2024-01-02', nik: '3174000000000001',
  };
  if (c[kunci]) return c[kunci]!;
  return def.jenis === 'ya_tidak' ? '' : '';
}

function teksSel(v: ExcelJS.CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return v.result === undefined || v.result === null ? null : teksSel(v.result as ExcelJS.CellValue);
    return null;
  }
  return String(v).trim();
}

interface BarisSiap {
  baris: number;
  data: Record<string, unknown>;
}

async function periksaBerkas(isiBase64: unknown): Promise<{ siap: BarisSiap[]; galat: GalatImpor[]; diabaikan: number; jumlah: number }> {
  if (typeof isiBase64 !== 'string' || isiBase64.length === 0) throw galat('MASUKAN', 'Pilih berkas Excel lebih dulu.', 'isi');
  const mentah = isiBase64.includes(',') ? isiBase64.slice(isiBase64.indexOf(',') + 1) : isiBase64;
  const buf = Buffer.from(mentah, 'base64');
  if (buf.length > 5 * 1024 * 1024) throw galat('MASUKAN', 'Berkas terlalu besar (maksimal 5 MB).', 'isi');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw galat('MASUKAN', 'Berkas bukan Excel (.xlsx) yang sah.', 'isi');
  }
  const ws = wb.getWorksheet('Pegawai');
  if (!ws) throw galat('MASUKAN', `Tab "Pegawai" tidak ditemukan. Gunakan ${NAMA_TEMPLAT}.`, 'isi');

  const kepala = (ws.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((v) => teksSel(v) ?? '');
  const kunciDikenal = new Set(KOLOM_TEMPLAT.map((k) => k.kunci));
  const tidakDikenal = kepala.filter((k) => k && !kunciDikenal.has(k));
  if (tidakDikenal.length) throw galat('MASUKAN', `Kolom tidak dikenal di baris 1: ${tidakDikenal.join(', ')}. Gunakan ${NAMA_TEMPLAT} terbaru.`, 'isi');
  for (const k of KOLOM_TEMPLAT.filter((x) => x.def.wajib)) {
    if (!kepala.includes(k.kunci)) throw galat('MASUKAN', `Kolom wajib ${k.kunci} tidak ada di baris 1.`, 'isi');
  }

  const [unit, jabatan, titik, ada] = await Promise.all([
    baca<{ id: string; kode: string }>('SELECT id, kode FROM unit WHERE aktif'),
    baca<{ id: string; nama: string }>('SELECT id, nama FROM jabatan WHERE aktif'),
    baca<{ id: string; nama: string }>('SELECT id, nama FROM titik_kantor WHERE aktif'),
    baca<{ npp: string; email: string }>('SELECT npp, lower(email) AS email FROM pegawai'),
  ]);
  const petaUnit = new Map(unit.map((u) => [u.kode.toUpperCase(), u.id]));
  const petaJabatan = new Map(jabatan.map((j) => [j.nama.toLowerCase(), j.id]));
  const petaTitik = new Map(titik.map((t) => [t.nama.toLowerCase(), t.id]));
  const nppAda = new Set(ada.map((a) => a.npp));
  const emailAda = new Set(ada.map((a) => a.email));
  const nppBerkas = new Set<string>();
  const emailBerkas = new Set<string>();

  const siap: BarisSiap[] = [];
  const g: GalatImpor[] = [];
  let diabaikan = 0;
  let jumlah = 0;
  for (let r = BARIS_DATA_PERTAMA; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const sel: Record<string, ExcelJS.CellValue> = {};
    kepala.forEach((k, i) => {
      if (k) sel[k] = row.getCell(i + 1).value;
    });
    const teks = Object.fromEntries(Object.entries(sel).map(([k, v]) => [k, teksSel(v)]));
    if (Object.values(teks).every((v) => v === null || v === '')) continue;
    if ((teks.npp ?? '').toUpperCase().startsWith('CONTOH')) {
      diabaikan++;
      continue;
    }
    jumlah++;
    const galatBaris = (kolom: string, pesan: string) => g.push({ baris: r, kolom, pesan });
    // 16 digit sebagai angka Excel sudah kehilangan presisi sebelum sampai di sini.
    if (typeof sel.nik === 'number') {
      galatBaris('nik', 'Sel NIK harus berformat Teks, bukan angka');
      continue;
    }

    const masukan: Record<string, unknown> = {};
    for (const k of KOLOM_TEMPLAT) {
      const v = teks[k.kunci];
      if (k.kunci === 'unit_kode') {
        if (v) {
          const id = petaUnit.get(v.toUpperCase());
          if (!id) galatBaris(k.kunci, `Kode unit "${v}" tidak dikenal`);
          masukan.unit_id = id ?? null;
        }
      } else if (k.kunci === 'jabatan_nama') {
        if (v) {
          const id = petaJabatan.get(v.toLowerCase());
          if (!id) galatBaris(k.kunci, `Jabatan "${v}" tidak dikenal`);
          masukan.jabatan_id = id ?? null;
        }
      } else if (k.kunci === 'titik_kantor_nama') {
        if (v) {
          const id = petaTitik.get(v.toLowerCase());
          if (!id) galatBaris(k.kunci, `Titik kantor "${v}" tidak dikenal`);
          masukan.titik_kantor_id = id ?? null;
        }
      } else if (k.def.jenis === 'ya_tidak') {
        if (v) {
          const t = v.toLowerCase();
          if (!['ya', 'tidak', 'y', 't', 'true', 'false'].includes(t)) galatBaris(k.kunci, 'Isi Ya atau Tidak');
          else masukan[k.kunci] = ['ya', 'y', 'true'].includes(t);
        }
      } else if (v !== null && v !== undefined && v !== '') {
        masukan[k.kunci] = v;
      }
    }

    const data: Record<string, unknown> = {};
    for (const def of KOLOM_PEGAWAI) {
      if (['tgl_berhenti', 'alasan_berhenti'].includes(def.kolom)) continue;
      try {
        const v = nilaiKolom(def, masukan);
        if (v === undefined) {
          if (def.wajib) galatBaris(def.kolom, 'Wajib diisi');
          continue;
        }
        data[def.kolom] = v;
      } catch (e) {
        if (e instanceof GalatMasukan) galatBaris(e.kolom, e.message);
        else throw e;
      }
    }
    if (typeof data.jenis_kepegawaian === 'string') {
      const bawaan = sakelarBawaan(data.jenis_kepegawaian as (typeof JENIS_KEPEGAWAIAN)[number]);
      for (const [k, v] of Object.entries(bawaan)) if (data[k] === undefined) data[k] = v;
    }
    if (typeof data.email === 'string') data.email = data.email.toLowerCase();
    const npp = data.npp as string | undefined;
    const email = data.email as string | undefined;
    if (npp && (nppAda.has(npp) || nppBerkas.has(npp))) galatBaris('npp', nppAda.has(npp) ? 'NPP sudah ada di sistem' : 'NPP kembar di berkas ini');
    if (email && (emailAda.has(email) || emailBerkas.has(email))) galatBaris('email', emailAda.has(email) ? 'Email sudah ada di sistem' : 'Email kembar di berkas ini');
    if (npp) nppBerkas.add(npp);
    if (email) emailBerkas.add(email);
    siap.push({ baris: r, data });
  }
  return { siap, galat: g, diabaikan, jumlah };
}

export async function pratinjau(data: unknown): Promise<PratinjauImpor> {
  const h = await periksaBerkas(objek(data).isi);
  const unit = new Map((await baca<{ id: string; nama: string }>('SELECT id, nama FROM unit')).map((u) => [u.id, u.nama]));
  return {
    sah: h.galat.length === 0 && h.siap.length > 0,
    jumlahBaris: h.jumlah,
    diabaikan: h.diabaikan,
    pratinjau: h.siap.slice(0, 50).map((s) => ({
      baris: s.baris,
      npp: String(s.data.npp ?? ''),
      nama: String(s.data.nama_lengkap ?? ''),
      jenisKepegawaian: String(s.data.jenis_kepegawaian ?? ''),
      unit: typeof s.data.unit_id === 'string' ? unit.get(s.data.unit_id) ?? null : null,
    })),
    galat: h.galat,
  };
}

/** EMP-18: semua atau tidak sama sekali. */
export async function simpan(u: Pengguna, data: unknown): Promise<{ jumlah: number }> {
  const h = await periksaBerkas(objek(data).isi);
  if (h.galat.length > 0) {
    throw galat('MASUKAN', `Impor dibatalkan: ${h.galat.length} galat di berkas. Lihat pratinjau untuk rinciannya.`, 'isi');
  }
  if (h.siap.length === 0) throw galat('MASUKAN', 'Tidak ada baris data untuk diimpor.', 'isi');
  await transaksi(async (tx) => {
    for (const s of h.siap) {
      const p = await tulis<{ id: string; status_pegawai: string; tgl_masuk: string | null }>('pegawai', 'tambah', s.data, { pelaku: u.pegawaiId, alasan: 'Impor Excel' }, tx);
      await tulis('riwayat_status', 'tambah', {
        pegawai_id: p.id, status: p.status_pegawai, tgl_mulai: p.tgl_masuk ?? tanggalWIB(new Date()), keterangan: 'Status awal (impor)',
      }, { pelaku: u.pegawaiId }, tx);
    }
  });
  return { jumlah: h.siap.length };
}
