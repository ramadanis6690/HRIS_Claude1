// Rekap kehadiran harian untuk Admin HRD (semua) dan atasan (unitnya, baca saja).
// Koreksi HRD wajib beralasan dan terlihat di rekap (ATT-12). Koordinat percobaan
// luar radius tampil sebagai teks dengan tautan ke OpenStreetMap (LOC-11).
import { useState } from 'react';
import type { BarisPresensiPegawai, PresensiRingkas } from '../../bersama/aksi.js';
import { api, urlUnduh } from '../api.js';
import { Dialog, Isian, JudulLayar, Kartu, Memuat, Pil, Ringkas, Tabel, Tombol, useGalatKolom, useMuat } from '../komponen/dasar.js';
import { hariIniWIB, hariTanggal, jam, waktuLengkap } from '../format.js';
import { tambahHari } from '../../core/tanggal.js';
import { useSesi } from '../Sesi.js';

const KEADAAN: Record<BarisPresensiPegawai['keadaan'], { teks: string; jenis: 'selesai' | 'menunggu' | 'ditolak' | 'draf' }> = {
  lengkap: { teks: 'Lengkap', jenis: 'selesai' },
  tanpa_check_out: { teks: 'Tanpa check-out', jenis: 'menunggu' },
  belum_masuk: { teks: 'Belum check-in', jenis: 'ditolak' },
  tidak_wajib: { teks: 'Tidak wajib', jenis: 'draf' },
  libur: { teks: 'Libur', jenis: 'draf' },
};

function tandaSumber(p: PresensiRingkas | null) {
  if (!p) return null;
  if (p.sumber === 'koreksi_hr') return <Pil jenis="proses">Koreksi HRD</Pil>;
  if (p.sumber === 'dinas_luar') return <Pil jenis="disetujui">Dinas luar</Pil>;
  if (p.bypass) return <Pil jenis="draf">Bypass GPS</Pil>;
  return null;
}

function DialogKoreksi({ baris, tanggal, onTutup, onSelesai }: { baris: BarisPresensiPegawai; tanggal: string; onTutup: () => void; onSelesai: () => void }) {
  const [masuk, setMasuk] = useState(baris.presensi?.masukPada ? jam(baris.presensi.masukPada) : '');
  const [pulang, setPulang] = useState(baris.presensi?.pulangPada ? jam(baris.presensi.pulangPada) : '');
  const [alasan, setAlasan] = useState('');
  const { galat, umum, tangkap } = useGalatKolom();
  const simpan = () =>
    tangkap(async () => {
      await api('presensi.koreksi', { pegawaiId: baris.pegawaiId, tanggal, jamMasuk: masuk || null, jamPulang: pulang || null, alasan });
      onSelesai();
      onTutup();
    });
  return (
    <Dialog judul={`Koreksi presensi — ${baris.nama}`} onTutup={onTutup}>
      <div className="tumpuk">
        <div className="redup">{hariTanggal(tanggal)}. Koreksi tercatat di Audit Log beserta nilai sebelumnya, dan ditandai di rekap.</div>
        {umum && <div className="galat-umum">{umum}</div>}
        <div className="formulir">
          <Isian label="Jam masuk" jenis="time" value={masuk} onChange={setMasuk} salah={galat.jamMasuk} />
          <Isian label="Jam pulang" jenis="time" value={pulang} onChange={setPulang} salah={galat.jamPulang} />
        </div>
        <Isian label="Alasan koreksi" value={alasan} onChange={setAlasan} wajib baris={3} salah={galat.alasan} maks={500} />
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol onClick={simpan} disabled={!alasan.trim()} pesanBerhasil="Koreksi presensi disimpan.">Simpan koreksi</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

export function RekapKehadiran() {
  const { sesi } = useSesi();
  const hrd = sesi?.peranAdmin.includes('admin_hrd') || sesi?.peranAdmin.includes('super_admin');
  const [tanggal, setTanggal] = useState(hariIniWIB);
  const daftar = useMuat(() => api('presensi.daftar', { tanggal }), [tanggal]);
  const percobaan = useMuat(() => (hrd ? api('presensi.percobaan', { mulai: tambahHari(tanggal, -6), akhir: tanggal }) : Promise.resolve([])), [tanggal, hrd]);
  const [koreksi, setKoreksi] = useState<BarisPresensiPegawai | null>(null);
  const [foto, setFoto] = useState<{ id: string; judul: string } | null>(null);
  const data = daftar.data ?? [];

  return (
    <>
      <JudulLayar
        judul="Rekap Kehadiran"
        keterangan={hrd ? 'Semua pegawai. Rekap bulanan dan pengesahannya tersedia mulai Fase 2.' : 'Anggota unit Anda (baca saja).'}
        aksi={
          <div className="baris">
            <button className="tombol sekunder kecil" onClick={() => setTanggal(tambahHari(tanggal, -1))}>‹</button>
            <input type="date" className="tombol sekunder kecil" value={tanggal} max={hariIniWIB()} onChange={(e) => e.target.value && setTanggal(e.target.value)} aria-label="Tanggal" />
            <button className="tombol sekunder kecil" disabled={tanggal >= hariIniWIB()} onClick={() => setTanggal(tambahHari(tanggal, 1))}>›</button>
          </div>
        }
      />
      <div className="tumpuk">
        <div className="kisi">
          <Ringkas angka={data.filter((d) => d.presensi).length} label="Hadir" nada="sukses" />
          <Ringkas angka={data.filter((d) => d.keadaan === 'belum_masuk').length} label="Belum check-in" nada="bahaya" />
          <Ringkas angka={data.filter((d) => d.keadaan === 'tanpa_check_out').length} label="Tanpa check-out" nada="peringatan" />
          <Ringkas angka={data.filter((d) => (d.presensi?.menitTerlambat ?? 0) > 0).length} label="Terlambat" nada="proses" />
        </div>
        <Kartu judul={hariTanggal(tanggal)} rapat>
          <Memuat muatan={daftar}>
            <Tabel
              data={data}
              kunci={(d) => d.pegawaiId}
              kosong="Tidak ada pegawai untuk ditampilkan."
              perHalamanAwal={20}
              kolom={[
                { judul: 'Pegawai', isi: (d) => <div><div>{d.nama}</div><div className="redup kecil mono">{d.npp}</div></div>, cari: (d) => `${d.nama} ${d.npp} ${d.unit ?? ''}` },
                { judul: 'Unit', isi: (d) => d.unit ?? '—' },
                { judul: 'Masuk', isi: (d) => jam(d.presensi?.masukPada) },
                { judul: 'Pulang', isi: (d) => jam(d.presensi?.pulangPada) },
                { judul: 'Terlambat', isi: (d) => (d.presensi?.menitTerlambat ? `${d.presensi.menitTerlambat} mnt` : '—') },
                { judul: 'Pulang cepat', isi: (d) => (d.presensi?.menitPulangCepat ? `${d.presensi.menitPulangCepat} mnt` : '—') },
                { judul: 'Jarak', isi: (d) => (d.presensi?.jarakM !== null && d.presensi?.jarakM !== undefined ? `${Math.round(d.presensi.jarakM)} m` : '—') },
                { judul: 'Keadaan', isi: (d) => <div className="baris"><Pil jenis={KEADAAN[d.keadaan].jenis}>{KEADAAN[d.keadaan].teks}</Pil>{tandaSumber(d.presensi)}</div> },
                {
                  judul: '',
                  isi: (d) => (
                    <div className="baris" style={{ justifyContent: 'flex-end' }}>
                      {d.presensi?.fotoBerkasId && <button className="tombol hantu kecil" onClick={() => setFoto({ id: d.presensi!.fotoBerkasId!, judul: `${d.nama} — ${jam(d.presensi!.masukPada)}` })}>Foto</button>}
                      {hrd && <button className="tombol sekunder kecil" onClick={() => setKoreksi(d)}>Koreksi</button>}
                    </div>
                  ),
                },
              ]}
            />
          </Memuat>
        </Kartu>

        {hrd && (
          <Kartu judul="Percobaan check-in di luar radius (7 hari)" rapat>
            <Memuat muatan={percobaan}>
              <Tabel
                data={percobaan.data ?? []}
                kunci={(p) => p.id}
                cari={false}
                kosong="Tidak ada percobaan di luar radius."
                kolom={[
                  { judul: 'Waktu', isi: (p) => waktuLengkap(p.waktu) },
                  { judul: 'Pegawai', isi: (p) => `${p.nama} (${p.npp})` },
                  { judul: 'Jarak', isi: (p) => (p.jarakM !== null ? `±${Math.round(p.jarakM)} m dari ${p.namaKantor} (batas ${p.radius} m)` : '—') },
                  {
                    judul: 'Koordinat',
                    isi: (p) => (
                      <a className="mono kecil" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`} target="_blank" rel="noopener noreferrer">
                        {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                      </a>
                    ),
                  },
                  { judul: '', isi: (p) => (p.fotoBerkasId ? <button className="tombol hantu kecil" onClick={() => setFoto({ id: p.fotoBerkasId!, judul: `${p.nama} — percobaan` })}>Foto</button> : null) },
                ]}
              />
            </Memuat>
          </Kartu>
        )}
      </div>
      {koreksi && <DialogKoreksi baris={koreksi} tanggal={tanggal} onTutup={() => setKoreksi(null)} onSelesai={daftar.muatUlang} />}
      {foto && (
        <Dialog judul={foto.judul} onTutup={() => setFoto(null)}>
          <img src={urlUnduh('berkas', foto.id)} alt={foto.judul} style={{ width: '100%', borderRadius: 8 }} />
        </Dialog>
      )}
    </>
  );
}
