// e-CV sebagai PDF (SRS EMP-15). Pegawai tanpa foto mendapat kotak bertanda
// "Tanpa foto"; kolom kosong ditulis "Belum diisi", tidak pernah "-".
import PDFDocument from 'pdfkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LABEL_STATUS_PEGAWAI, type StatusPegawai } from '../../bersama/aksi.js';
import { formatMasaKerja, masaKerja, tanggalWIB } from '../../core/tanggal.js';
import { baca, bacaSatu } from '../db.js';
import { galat } from '../galat.js';

const BELUM = 'Belum diisi';
const HIJAU = '#0F3D2E';
const ABU = '#5C5C5C';

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tglPanjang(t: string | null): string {
  if (!t) return BELUM;
  const [y, m, d] = t.split('-');
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
}
const isi = (v: unknown): string => (v === null || v === undefined || v === '' ? BELUM : String(v));

export async function buatEcv(pegawaiId: string, dirBerkas: string): Promise<Buffer> {
  const p = await bacaSatu<Record<string, string | null> & { status_pegawai: StatusPegawai; nama_lengkap: string; npp: string }>(
    `SELECT p.*, j.nama AS nama_jabatan, un.nama AS nama_unit, b.jalur_relatif AS jalur_foto
       FROM pegawai p LEFT JOIN jabatan j ON j.id = p.jabatan_id LEFT JOIN unit un ON un.id = p.unit_id
       LEFT JOIN berkas b ON b.id = p.foto_file_id AND b.dihapus_pada IS NULL
      WHERE p.id = $1`,
    [pegawaiId],
  );
  if (!p) throw galat('TIDAK_ADA', 'Pegawai tidak ditemukan.');
  const [pendidikan, pekerjaan, diklat, sertifikasi] = await Promise.all([
    baca<{ jenjang: string; institusi: string | null; jurusan: string | null; tahun_lulus: number | null }>(
      'SELECT jenjang, institusi, jurusan, tahun_lulus FROM pendidikan WHERE pegawai_id = $1 AND aktif ORDER BY tahun_lulus DESC NULLS LAST', [pegawaiId]),
    baca<{ instansi: string; jabatan: string | null; tahun_mulai: number | null; tahun_selesai: number | null }>(
      'SELECT instansi, jabatan, tahun_mulai, tahun_selesai FROM riwayat_pekerjaan WHERE pegawai_id = $1 AND aktif ORDER BY tahun_mulai DESC NULLS LAST', [pegawaiId]),
    baca<{ nama: string; penyelenggara: string | null; tgl_mulai: string | null }>(
      'SELECT nama, penyelenggara, tgl_mulai FROM riwayat_diklat WHERE pegawai_id = $1 AND aktif ORDER BY tgl_mulai DESC NULLS LAST', [pegawaiId]),
    baca<{ nama: string; lembaga: string | null; berlaku_sampai: string | null }>(
      'SELECT nama, lembaga, berlaku_sampai FROM sertifikasi WHERE pegawai_id = $1 AND aktif ORDER BY tgl_terbit DESC NULLS LAST', [pegawaiId]),
  ]);

  let foto: Buffer | null = null;
  if (p.jalur_foto) foto = await readFile(join(dirBerkas, p.jalur_foto)).catch(() => null);

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `e-CV ${p.nama_lengkap}`, Author: 'HRIS DPJM' } });
  const bagian: Buffer[] = [];
  doc.on('data', (b: Buffer) => bagian.push(b));
  const selesai = new Promise<Buffer>((ok) => doc.on('end', () => ok(Buffer.concat(bagian))));

  doc.fillColor(HIJAU).fontSize(18).font('Helvetica-Bold').text('CURRICULUM VITAE', 50, 50);
  doc.fillColor(ABU).fontSize(9).font('Helvetica').text('Dana Pensiun Jasa Marga', 50, 72);

  // Kotak foto 3:4 di kanan atas.
  const fx = 445, fy = 50, fw = 100, fh = 133;
  if (foto) {
    try {
      doc.image(foto, fx, fy, { fit: [fw, fh], align: 'center', valign: 'center' });
    } catch {
      foto = null;
    }
  }
  if (!foto) {
    doc.rect(fx, fy, fw, fh).lineWidth(1).strokeColor('#8A8A8A').stroke();
    doc.fillColor(ABU).fontSize(9).text('Tanpa foto', fx, fy + fh / 2 - 5, { width: fw, align: 'center' });
  }

  const nama = [p.gelar_depan, p.nama_lengkap].filter(Boolean).join(' ') + (p.gelar_belakang ? `, ${p.gelar_belakang}` : '');
  doc.fillColor('#171717').fontSize(14).font('Helvetica-Bold').text(nama, 50, 100, { width: 380 });
  doc.fontSize(10).font('Helvetica').fillColor(ABU).text(`NPP ${p.npp}`, 50, doc.y + 2, { width: 380 });

  let y = 200;
  const judul = (t: string) => {
    if (y > 740) {
      doc.addPage();
      y = 50;
    }
    doc.fillColor(HIJAU).font('Helvetica-Bold').fontSize(11).text(t.toUpperCase(), 50, y);
    y = doc.y + 2;
    doc.moveTo(50, y).lineTo(545, y).lineWidth(0.5).strokeColor('#E4E4E4').stroke();
    y += 6;
  };
  const baris = (label: string, nilai: string) => {
    if (y > 780) {
      doc.addPage();
      y = 50;
    }
    doc.fillColor(ABU).font('Helvetica').fontSize(9.5).text(label, 50, y, { width: 150 });
    doc.fillColor(nilai === BELUM ? '#8A8A8A' : '#171717').text(nilai, 205, y, { width: 340 });
    y = Math.max(doc.y, y + 12) + 3;
  };
  const daftar = (baris2: string[]) => {
    if (baris2.length === 0) {
      doc.fillColor('#8A8A8A').font('Helvetica').fontSize(9.5).text(BELUM, 50, y);
      y = doc.y + 8;
      return;
    }
    for (const b of baris2) {
      if (y > 780) {
        doc.addPage();
        y = 50;
      }
      doc.fillColor('#171717').font('Helvetica').fontSize(9.5).text(`•  ${b}`, 50, y, { width: 495 });
      y = doc.y + 3;
    }
    y += 5;
  };

  judul('Data pribadi');
  baris('Tempat, tanggal lahir', p.tempat_lahir || p.tanggal_lahir ? `${p.tempat_lahir ?? BELUM}, ${tglPanjang(p.tanggal_lahir ?? null)}` : BELUM);
  baris('Jenis kelamin', p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : BELUM);
  baris('Agama', isi(p.agama));
  baris('Kewarganegaraan', isi(p.kewarganegaraan));
  baris('Alamat domisili', isi(p.alamat_domisili));
  baris('Email', isi(p.email));
  baris('No. HP', isi(p.no_hp));
  y += 6;

  judul('Kepegawaian');
  baris('Jabatan', isi(p.nama_jabatan));
  baris('Unit', isi(p.nama_unit));
  baris('Jenis kepegawaian', isi(p.jenis_kepegawaian));
  baris('Status', LABEL_STATUS_PEGAWAI[p.status_pegawai] ?? BELUM);
  baris('Tanggal masuk', tglPanjang(p.tgl_masuk ?? null));
  baris('Masa kerja', formatMasaKerja(masaKerja(p.tgl_masuk ?? null, p.tgl_masa_kerja_diakui ?? null, tanggalWIB(new Date()))));
  baris('Grade / Sub grade', p.grade ? `${p.grade}${p.sub_grade ? ' / ' + p.sub_grade : ''}` : BELUM);
  y += 6;

  judul('Pendidikan');
  daftar(pendidikan.map((d) => [d.jenjang, d.jurusan, d.institusi, d.tahun_lulus ? `lulus ${d.tahun_lulus}` : null].filter(Boolean).join(' — ')));
  judul('Riwayat pekerjaan');
  daftar(pekerjaan.map((d) => [d.jabatan, d.instansi, d.tahun_mulai ? `${d.tahun_mulai}–${d.tahun_selesai ?? 'sekarang'}` : null].filter(Boolean).join(' — ')));
  judul('Riwayat diklat');
  daftar(diklat.map((d) => [d.nama, d.penyelenggara, d.tgl_mulai ? tglPanjang(d.tgl_mulai) : null].filter(Boolean).join(' — ')));
  judul('Sertifikasi');
  daftar(sertifikasi.map((d) => [d.nama, d.lembaga, d.berlaku_sampai ? `berlaku s.d. ${tglPanjang(d.berlaku_sampai)}` : null].filter(Boolean).join(' — ')));

  doc.fillColor('#8A8A8A').fontSize(8).text(`Dicetak dari HRIS DPJM pada ${tglPanjang(tanggalWIB(new Date()))}.`, 50, 800, { width: 495, align: 'right' });
  doc.end();
  return selesai;
}
