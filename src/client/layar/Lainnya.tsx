// Gaji Pokok (baca), Audit Log, dan Status Sistem.
import { useState } from 'react';
import type { BarisAudit } from '../../bersama/aksi.js';
import { api } from '../api.js';
import { Dialog, Isian, JudulLayar, Kartu, Memuat, Pil, Ringkas, Tabel, Tombol, useMuat } from '../komponen/dasar.js';
import { formatRupiah, ukuran, waktuLengkap, hariIniWIB } from '../format.js';
import { navigasi } from '../rute.js';
import { useSesi } from '../Sesi.js';
import { tambahHari } from '../../core/tanggal.js';

export function GajiPokok() {
  const { sesi } = useSesi();
  const muatan = useMuat(() => api('gaji.ringkasan', {}), []);
  const bolehDetail = sesi?.menu.includes('data_pegawai') ?? false;
  return (
    <>
      <JudulLayar judul="Gaji Pokok" keterangan="Versi gaji yang berlaku hari ini. Riwayat lengkapnya ada di detail pegawai." />
      <Kartu rapat>
        <Memuat muatan={muatan}>
          <Tabel
            data={muatan.data ?? []}
            kunci={(g) => g.pegawaiId}
            onKlik={bolehDetail ? (g) => navigasi(`/pegawai/${g.pegawaiId}`) : undefined}
            kosong="Belum ada pegawai aktif."
            perHalamanAwal={20}
            kolom={[
              { judul: 'NPP', isi: (g) => <span className="mono">{g.npp}</span>, cari: (g) => g.npp },
              { judul: 'Nama', isi: (g) => g.nama, cari: (g) => g.nama },
              { judul: 'Unit', isi: (g) => g.unit ?? '—', cari: (g) => g.unit ?? '' },
              { judul: 'Gaji pokok', uang: true, isi: (g) => (g.gapok === null ? <span className="redup">Belum diisi</span> : formatRupiah(g.gapok)) },
              { judul: 'Tunjangan jabatan', uang: true, isi: (g) => (g.tunjJabatan === null ? <span className="redup">—</span> : formatRupiah(g.tunjJabatan)) },
            ]}
          />
        </Memuat>
      </Kartu>
    </>
  );
}

const TABEL_AUDIT = ['', 'pegawai', 'gaji', 'presensi', 'pengguna', 'peran_admin', 'riwayat_status', 'keluarga', 'dokumen', 'berkas', 'unit', 'jabatan', 'titik_kantor', 'jam_kerja', 'hari_libur', 'pengaturan', 'tabel_grade', 'percobaan_check_in', 'notifikasi'];

function NilaiJson({ v }: { v: Record<string, unknown> | null }) {
  if (!v) return <span className="redup">—</span>;
  return <pre className="mono kecil" style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>{JSON.stringify(v, null, 2)}</pre>;
}

/** Perbedaan nilai sebelum/sesudah, supaya Auditor tidak membandingkan JSON dengan mata. */
function berubah(b: BarisAudit): string[] {
  if (!b.sebelum || !b.sesudah) return [];
  return Object.keys(b.sesudah).filter((k) => !['diubah_pada', 'diubah_oleh'].includes(k) && JSON.stringify(b.sebelum![k]) !== JSON.stringify(b.sesudah![k]));
}

export function AuditLog() {
  const [mulai, setMulai] = useState(() => tambahHari(hariIniWIB(), -30));
  const [akhir, setAkhir] = useState(hariIniWIB);
  const [tabel, setTabel] = useState('');
  const [halaman, setHalaman] = useState(1);
  const log = useMuat(() => api('audit.baca', { mulai, akhir, ...(tabel ? { tabel } : {}), halaman }), [mulai, akhir, tabel, halaman]);
  const [rantai, setRantai] = useState<{ utuh: boolean; pesan: string } | null>(null);
  const [rinci, setRinci] = useState<BarisAudit | null>(null);
  const jumlahHalaman = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.perHalaman)) : 1;
  return (
    <>
      <JudulLayar judul="Audit Log" keterangan="Append-only dan berantai hash. Tidak bisa diubah atau dihapus, termasuk oleh aplikasi."
        aksi={<Tombol gaya="sekunder" ikon="perisai" onClick={async () => setRantai(await api('audit.periksaRantai', {}))}>Periksa rantai</Tombol>} />
      <div className="tumpuk">
        {rantai && <div className={rantai.utuh ? 'info-kotak' : 'galat-umum'}>{rantai.pesan}</div>}
        <Kartu rapat>
          <div className="tabel-alat">
            <div className="baris">
              <div style={{ width: 170 }}><Isian label="Dari" jenis="date" value={mulai} onChange={(v) => { setMulai(v); setHalaman(1); }} /></div>
              <div style={{ width: 170 }}><Isian label="Sampai" jenis="date" value={akhir} onChange={(v) => { setAkhir(v); setHalaman(1); }} /></div>
              <div className="isian terisi" style={{ width: 200 }}>
                <select value={tabel} onChange={(e) => { setTabel(e.target.value); setHalaman(1); }} aria-label="Modul">
                  {TABEL_AUDIT.map((t) => <option key={t} value={t}>{t || 'Semua modul'}</option>)}
                </select>
                <label>Modul (tabel)</label>
              </div>
            </div>
          </div>
          <Memuat muatan={log}>
            <Tabel
              data={log.data?.baris ?? []}
              kunci={(b) => String(b.no)}
              cari={false}
              perHalamanAwal={50}
              onKlik={setRinci}
              kosong="Tidak ada catatan pada rentang ini."
              kolom={[
                { judul: 'No', isi: (b) => <span className="mono">{b.no}</span> },
                { judul: 'Waktu', isi: (b) => waktuLengkap(b.waktu) },
                { judul: 'Pelaku', isi: (b) => b.pelaku ? `${b.pelaku} (${b.pelakuNpp})` : <span className="redup">Sistem</span> },
                { judul: 'Aksi', isi: (b) => <Pil jenis={b.aksi === 'tambah' ? 'selesai' : b.aksi === 'nonaktifkan' ? 'ditolak' : 'disetujui'}>{b.aksi}</Pil> },
                { judul: 'Modul', isi: (b) => <span className="mono">{b.tabel}</span> },
                { judul: 'Yang berubah', isi: (b) => berubah(b).slice(0, 4).join(', ') || '—' },
                { judul: 'Alasan', isi: (b) => b.alasan ?? '—' },
              ]}
            />
            {log.data && log.data.total > log.data.perHalaman && (
              <div className="tabel-kaki">
                <span>Halaman {halaman} dari {jumlahHalaman} ({log.data.total} catatan)</span>
                <button className="tombol hantu kecil" disabled={halaman <= 1} onClick={() => setHalaman(halaman - 1)}>‹ Sebelumnya</button>
                <button className="tombol hantu kecil" disabled={halaman >= jumlahHalaman} onClick={() => setHalaman(halaman + 1)}>Berikutnya ›</button>
              </div>
            )}
          </Memuat>
        </Kartu>
      </div>
      {rinci && (
        <Dialog judul={`Catatan #${rinci.no}`} onTutup={() => setRinci(null)} lebar>
          <div className="tumpuk">
            <div>{waktuLengkap(rinci.waktu)} · {rinci.pelaku ?? 'Sistem'} · <span className="mono">{rinci.aksi} {rinci.tabel}</span></div>
            {rinci.alasan && <div className="info-kotak">Alasan: {rinci.alasan}</div>}
            <div className="kisi-2">
              <div><h3>Sebelum</h3><NilaiJson v={rinci.sebelum} /></div>
              <div><h3>Sesudah</h3><NilaiJson v={rinci.sesudah} /></div>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function StatusSistem() {
  const s = useMuat(() => api('sistem.status', {}), []);
  const d = s.data;
  return (
    <>
      <JudulLayar judul="Status Sistem" aksi={<button className="tombol sekunder" onClick={s.muatUlang}>Muat ulang</button>} />
      <Memuat muatan={s}>
        {d && (
          <div className="tumpuk">
            <div className="kisi">
              <Ringkas angka={d.lingkungan.toUpperCase()} label="Lingkungan" nada={d.lingkungan === 'asli' ? 'sukses' : 'info'} />
              <Ringkas angka={ukuran(d.ukuranDbByte)} label="Ukuran basis data" />
              <Ringkas angka={ukuran(d.ukuranBerkasByte)} label="Folder berkas" />
              <Ringkas angka={d.cakramSisaByte === null ? '—' : ukuran(d.cakramSisaByte)} label={`Sisa cakram${d.cakramTotalByte ? ` dari ${ukuran(d.cakramTotalByte)}` : ''}`}
                nada={d.cakramSisaByte !== null && d.cakramTotalByte !== null && d.cakramSisaByte / d.cakramTotalByte < 0.15 ? 'bahaya' : undefined} />
            </div>
            <Kartu judul="Versi">
              <dl className="rincian">
                <dt>Node.js</dt><dd className="mono">{d.versiNode}</dd>
                <dt>PostgreSQL</dt><dd className="mono">{d.versiPostgres}</dd>
                <dt>Versi skema</dt><dd className="mono">{String(d.versiSkema).padStart(3, '0')}</dd>
              </dl>
            </Kartu>
            <Kartu judul="Pekerjaan terjadwal" rapat>
              <Tabel data={d.pekerjaan} kunci={(p) => p.pekerjaan} cari={false} kosong=""
                kolom={[
                  { judul: 'Pekerjaan', isi: (p) => <span className="mono">{p.pekerjaan}</span> },
                  { judul: 'Terakhir', isi: (p) => (p.terakhir ? waktuLengkap(p.terakhir) : 'Belum pernah berjalan') },
                  { judul: 'Hasil', isi: (p) => <Pil jenis={p.terlambat ? 'ditolak' : 'selesai'}>{p.berhasil === false ? 'Gagal' : p.terlambat ? 'Terlambat / belum berjalan' : 'Berhasil'}</Pil> },
                  { judul: 'Galat', isi: (p) => p.galat ?? '—' },
                ]} />
            </Kartu>
            <Kartu judul="Peringatan pemisahan tugas">
              {d.konflikPeran.length === 0 ? <div className="kosong">Tidak ada.</div> : d.konflikPeran.map((k) => (
                <div key={k.pegawaiId + k.kombinasi} className="catatan" style={{ marginBottom: 8 }}><strong>{k.nama}</strong> — {k.kombinasi}. {k.akibat} Alasan: {k.alasan ?? 'tidak tercatat'}.</div>
              ))}
            </Kartu>
          </div>
        )}
      </Memuat>
    </>
  );
}
