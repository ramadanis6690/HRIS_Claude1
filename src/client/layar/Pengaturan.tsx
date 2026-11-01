// Pengaturan master data (SRS SET-01 – SET-03, LOC-01 – LOC-03, WRK-01 – WRK-02).
import { lazy, Suspense, useState } from 'react';
import type { BarisGradeData, Jabatan, MasterData, TitikKantorData, Unit } from '../../bersama/aksi.js';
import { RADIUS_SAH } from '../../core/jarak.js';
import { api } from '../api.js';
import { Dialog, Isian, JudulLayar, Kartu, Memuat, Pil, Pilihan, Saklar, Tabel, Tombol, useGalatKolom, useMuat, Konfirmasi } from '../komponen/dasar.js';
import { formatRupiah, tanggalPendek } from '../format.js';

const PetaTitik = lazy(() => import('../komponen/PetaTitik.js'));

const TAB = ['Titik Kantor', 'Jam Kerja', 'Hari Libur', 'Unit', 'Jabatan', 'Tabel Grade', 'Komponen Gaji', 'Lainnya'] as const;
type Tab = (typeof TAB)[number];
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export function Pengaturan() {
  const master = useMuat(() => api('pengaturan.master', {}), []);
  const [tab, setTab] = useState<Tab>('Titik Kantor');
  const m = master.data;
  return (
    <>
      <JudulLayar judul="Pengaturan" keterangan="Master yang sudah dipakai transaksi tidak dihapus, hanya dinonaktifkan." />
      <Kartu rapat>
        <div className="tab">{TAB.map((t) => <button key={t} className={t === tab ? 'aktif' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
        <div className="kartu-isi">
          <Memuat muatan={master}>
            {m && tab === 'Titik Kantor' && <TabTitik m={m} onUbah={master.muatUlang} />}
            {m && tab === 'Jam Kerja' && <TabJam m={m} onUbah={master.muatUlang} />}
            {m && tab === 'Hari Libur' && <TabLibur m={m} onUbah={master.muatUlang} />}
            {m && tab === 'Unit' && <TabUnit m={m} onUbah={master.muatUlang} />}
            {m && tab === 'Jabatan' && <TabJabatan m={m} onUbah={master.muatUlang} />}
            {m && tab === 'Tabel Grade' && <TabGrade m={m} onUbah={master.muatUlang} />}
            {m && tab === 'Komponen Gaji' && (
              <Tabel data={m.komponenGaji} kunci={(k) => k.kode} kosong="Belum ada komponen." perHalamanAwal={20}
                kolom={[
                  { judul: 'Kode', isi: (k) => <span className="mono">{k.kode}</span>, cari: (k) => k.kode },
                  { judul: 'Nama', isi: (k) => k.nama, cari: (k) => k.nama },
                  { judul: 'Tipe', isi: (k) => k.tipe },
                  { judul: 'Kena pajak', isi: (k) => (k.kenaPajak ? 'Ya' : 'Tidak') },
                ]} />
            )}
            {m && tab === 'Lainnya' && <TabNilai m={m} onUbah={master.muatUlang} />}
          </Memuat>
        </div>
      </Kartu>
    </>
  );
}

function TabTitik({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  const [edit, setEdit] = useState<Partial<TitikKantorData> | null>(null);
  return (
    <div className="tumpuk">
      <div><button className="tombol" onClick={() => setEdit({ radiusM: 100, aktif: true })}>Tambah titik kantor</button></div>
      <Tabel data={m.titikKantor} kunci={(t) => t.id} cari={false} kosong="Belum ada titik kantor. Selama kosong, check-in tidak dinilai radius (LOC-09)." onKlik={setEdit}
        kolom={[
          { judul: 'Nama', isi: (t) => t.nama },
          { judul: 'Koordinat', isi: (t) => <a className="mono kecil" href={`https://www.openstreetmap.org/?mlat=${t.lat}&mlon=${t.lng}#map=18/${t.lat}/${t.lng}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{t.lat.toFixed(6)}, {t.lng.toFixed(6)}</a> },
          { judul: 'Radius', isi: (t) => `${t.radiusM} m` },
          { judul: 'Status', isi: (t) => <Pil jenis={t.aktif ? 'selesai' : 'draf'}>{t.aktif ? 'Aktif' : 'Nonaktif'}</Pil> },
        ]} />
      {edit && <FormTitik awal={edit} onTutup={() => setEdit(null)} onSelesai={onUbah} />}
    </div>
  );
}

function FormTitik({ awal, onTutup, onSelesai }: { awal: Partial<TitikKantorData>; onTutup: () => void; onSelesai: () => void }) {
  const [nama, setNama] = useState(awal.nama ?? '');
  const [alamat, setAlamat] = useState(awal.alamat ?? '');
  const [lat, setLat] = useState(awal.lat?.toString() ?? '');
  const [lng, setLng] = useState(awal.lng?.toString() ?? '');
  const [radius, setRadius] = useState(String(awal.radiusM ?? 100));
  const [aktif, setAktif] = useState(awal.aktif ?? true);
  const { galat, umum, tangkap } = useGalatKolom();
  const nLat = lat ? Number(lat) : null;
  const nLng = lng ? Number(lng) : null;
  return (
    <Dialog judul={awal.id ? 'Ubah titik kantor' : 'Tambah titik kantor'} onTutup={onTutup} lebar>
      <div className="tumpuk">
        {umum && <div className="galat-umum">{umum}</div>}
        <Suspense fallback={<div className="peta kosong">Memuat peta…</div>}>
          <PetaTitik lat={Number.isFinite(nLat) ? nLat : null} lng={Number.isFinite(nLng) ? nLng : null} radiusM={Number(radius)} onPilih={(a, b) => { setLat(String(a)); setLng(String(b)); }} />
        </Suspense>
        <div className="formulir">
          <Isian label="Nama" value={nama} onChange={setNama} wajib salah={galat.nama} />
          <Isian label="Lintang (lat)" value={lat} onChange={setLat} wajib mode="decimal" salah={galat.lat} />
          <Isian label="Bujur (lng)" value={lng} onChange={setLng} wajib mode="decimal" salah={galat.lng} />
          {/* LOC-02: radius hanya 50/100/200/300 m; server juga menolak nilai lain. */}
          <Pilihan label="Radius" value={radius} onChange={setRadius} kosong={null} opsi={RADIUS_SAH.map((r) => ({ nilai: String(r), label: `${r} m` }))} salah={galat.radiusM} />
        </div>
        <Isian label="Alamat" value={alamat} onChange={setAlamat} baris={2} />
        <Saklar label="Aktif" checked={aktif} onChange={setAktif} />
        <div className="redup kecil">Memindahkan atau menonaktifkan titik tidak mengubah penilaian presensi yang sudah tersimpan (LOC-10).</div>
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol pesanBerhasil="Titik kantor disimpan." onClick={() => tangkap(async () => {
            await api('pengaturan.simpanTitikKantor', { ...(awal.id ? { id: awal.id } : {}), nama, alamat: alamat || null, lat: Number(lat), lng: Number(lng), radiusM: Number(radius), aktif });
            onSelesai();
            onTutup();
          })}>Simpan</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

function TabJam({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  const kini = m.jamKerja[0];
  const [masuk, setMasuk] = useState(kini?.jamMasuk ?? '08:00');
  const [pulang, setPulang] = useState(kini?.jamPulang ?? '17:00');
  const [toleransi, setToleransi] = useState(String(kini?.toleransiMenit ?? 0));
  const [hari, setHari] = useState<number[]>(kini?.hariKerja ?? [1, 2, 3, 4, 5]);
  const [susulan, setSusulan] = useState(String(kini?.batasSusulanHari ?? 7));
  const [mulai, setMulai] = useState('');
  const { galat, umum, tangkap } = useGalatKolom();
  return (
    <div className="tumpuk">
      <div className="info-kotak">Jam kerja berversi: versi baru berlaku mulai tanggal yang dipilih. Presensi lama tetap memakai jam kerja saat itu (ATT-10).</div>
      {umum && <div className="galat-umum">{umum}</div>}
      <div className="formulir">
        <Isian label="Jam masuk" jenis="time" value={masuk} onChange={setMasuk} wajib salah={galat.jamMasuk} />
        <Isian label="Jam pulang" jenis="time" value={pulang} onChange={setPulang} wajib salah={galat.jamPulang} />
        <Isian label="Toleransi (menit, 0–120)" jenis="number" value={toleransi} onChange={setToleransi} salah={galat.toleransiMenit} />
        <Isian label="Batas susulan (hari)" jenis="number" value={susulan} onChange={setSusulan} salah={galat.batasSusulanHari} />
        <Isian label="Berlaku mulai" jenis="date" value={mulai} onChange={setMulai} wajib salah={galat.berlakuMulai} />
      </div>
      <div className="baris">{HARI.map((h, i) => (
        <label key={h} className="kotak-centang"><input type="checkbox" checked={hari.includes(i + 1)} onChange={() => setHari((x) => (x.includes(i + 1) ? x.filter((y) => y !== i + 1) : [...x, i + 1]))} />{h}</label>
      ))}</div>
      {galat.hariKerja && <div className="pesan-salah" style={{ color: 'var(--danger)' }}>{galat.hariKerja}</div>}
      <div><Tombol disabled={!mulai} pesanBerhasil="Versi jam kerja ditambahkan." onClick={() => tangkap(async () => {
        await api('pengaturan.tambahJamKerja', { jamMasuk: masuk, jamPulang: pulang, toleransiMenit: Number(toleransi), hariKerja: hari, batasSusulanHari: Number(susulan), berlakuMulai: mulai });
        onUbah();
      })}>Tambah versi jam kerja</Tombol></div>
      <Tabel data={m.jamKerja} kunci={(j) => j.id} cari={false} kosong=""
        kolom={[
          { judul: 'Berlaku mulai', isi: (j) => tanggalPendek(j.berlakuMulai) },
          { judul: 'Jam', isi: (j) => `${j.jamMasuk}–${j.jamPulang}` },
          { judul: 'Toleransi', isi: (j) => `${j.toleransiMenit} menit` },
          { judul: 'Hari kerja', isi: (j) => j.hariKerja.map((h) => HARI[h - 1]!.slice(0, 3)).join(', ') },
          { judul: 'Susulan', isi: (j) => `${j.batasSusulanHari} hari` },
        ]} />
    </div>
  );
}

function TabLibur({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  const [tanggal, setTanggal] = useState('');
  const [ket, setKet] = useState('');
  const [sumber, setSumber] = useState<'nasional' | 'ditetapkan_hr'>('nasional');
  const [hapus, setHapus] = useState<string | null>(null);
  const { galat, umum, tangkap } = useGalatKolom();
  return (
    <div className="tumpuk">
      {umum && <div className="galat-umum">{umum}</div>}
      <div className="formulir">
        <Isian label="Tanggal" jenis="date" value={tanggal} onChange={setTanggal} wajib salah={galat.tanggal} />
        <Isian label="Keterangan" value={ket} onChange={setKet} wajib salah={galat.keterangan} />
        <Pilihan label="Sumber" value={sumber} onChange={(v) => setSumber(v as typeof sumber)} kosong={null} opsi={[{ nilai: 'nasional', label: 'Libur nasional' }, { nilai: 'ditetapkan_hr', label: 'Ditetapkan HR' }]} />
      </div>
      <div><Tombol disabled={!tanggal || !ket} pesanBerhasil="Hari libur disimpan." onClick={() => tangkap(async () => { await api('pengaturan.simpanHariLibur', { tanggal, keterangan: ket, sumber }); setTanggal(''); setKet(''); onUbah(); })}>Simpan hari libur</Tombol></div>
      <Tabel data={m.hariLibur.filter((h) => h.aktif)} kunci={(h) => h.tanggal} kosong="Belum ada hari libur tahun ini." perHalamanAwal={20}
        kolom={[
          { judul: 'Tanggal', isi: (h) => tanggalPendek(h.tanggal), cari: (h) => h.tanggal },
          { judul: 'Keterangan', isi: (h) => h.keterangan, cari: (h) => h.keterangan },
          { judul: 'Sumber', isi: (h) => <Pil jenis={h.sumber === 'nasional' ? 'disetujui' : 'proses'}>{h.sumber === 'nasional' ? 'Nasional' : 'Ditetapkan HR'}</Pil> },
          // WRK-02: hanya yang ditetapkan HR bisa dihapus lewat layar.
          { judul: '', isi: (h) => (h.sumber === 'ditetapkan_hr' ? <button className="tombol hantu kecil" onClick={() => setHapus(h.tanggal)}>Hapus</button> : null) },
        ]} />
      {hapus && <Konfirmasi judul="Hapus hari libur" akibat={`Tanggal ${tanggalPendek(hapus)} kembali dihitung hari kerja.`} bahaya label="Hapus" onTutup={() => setHapus(null)} onYa={async () => { await api('pengaturan.nonaktifkanHariLibur', { tanggal: hapus }); onUbah(); }} />}
    </div>
  );
}

function TabUnit({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  const [edit, setEdit] = useState<Partial<Unit> | null>(null);
  return (
    <div className="tumpuk">
      <div><button className="tombol" onClick={() => setEdit({ aktif: true })}>Tambah unit</button></div>
      <Tabel data={m.unit} kunci={(u) => u.id} cari={false} kosong="" onKlik={setEdit}
        kolom={[
          { judul: 'Kode', isi: (u) => <span className="mono">{u.kode}</span> },
          { judul: 'Nama', isi: (u) => u.nama },
          { judul: 'Direktur pembina', isi: (u) => u.direkturPembina ?? <span style={{ color: 'var(--danger)' }}>Belum diisi</span> },
          { judul: 'Status', isi: (u) => <Pil jenis={u.aktif ? 'selesai' : 'draf'}>{u.aktif ? 'Aktif' : 'Nonaktif'}</Pil> },
        ]} />
      {edit && <FormUnit awal={edit} m={m} onTutup={() => setEdit(null)} onSelesai={onUbah} />}
    </div>
  );
}

function FormUnit({ awal, m, onTutup, onSelesai }: { awal: Partial<Unit>; m: MasterData; onTutup: () => void; onSelesai: () => void }) {
  const [kode, setKode] = useState(awal.kode ?? '');
  const [nama, setNama] = useState(awal.nama ?? '');
  const [pembina, setPembina] = useState(awal.direkturPembinaId ?? '');
  const [aktif, setAktif] = useState(awal.aktif ?? true);
  const { galat, umum, tangkap } = useGalatKolom();
  return (
    <Dialog judul={awal.id ? 'Ubah unit' : 'Tambah unit'} onTutup={onTutup}>
      <div className="tumpuk">
        {umum && <div className="galat-umum">{umum}</div>}
        <div className="formulir">
          <Isian label="Kode" value={kode} onChange={(v) => setKode(v.toUpperCase())} wajib salah={galat.kode} maks={10} />
          <Isian label="Nama" value={nama} onChange={setNama} wajib salah={galat.nama} />
        </div>
        {/* SET-03: unit selalu punya direktur pembina. */}
        <Pilihan label="Direktur pembina" value={pembina} onChange={setPembina} salah={galat.direkturPembinaId} opsi={m.direksi.map((d) => ({ nilai: d.id, label: `${d.nama} (${d.jabatan})` }))} kosong="Belum ditetapkan" />
        <Saklar label="Aktif" checked={aktif} onChange={setAktif} />
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol pesanBerhasil="Unit disimpan." onClick={() => tangkap(async () => { await api('pengaturan.simpanUnit', { ...(awal.id ? { id: awal.id } : {}), kode, nama, direkturPembinaId: pembina || null, aktif }); onSelesai(); onTutup(); })}>Simpan</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

function TabJabatan({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  const [edit, setEdit] = useState<Partial<Jabatan> | null>(null);
  return (
    <div className="tumpuk">
      <div><button className="tombol" onClick={() => setEdit({ posisiStruktural: 'Staff', caraBayarLembur: 'upah_per_jam', aktif: true })}>Tambah jabatan</button></div>
      <Tabel data={m.jabatan} kunci={(j) => j.id} cari={false} kosong="" onKlik={setEdit} perHalamanAwal={20}
        kolom={[
          { judul: 'Nama', isi: (j) => j.nama },
          { judul: 'Posisi struktural', isi: (j) => j.posisiStruktural },
          { judul: 'Kelompok', isi: (j) => j.kelompokJabatan ?? '—' },
          { judul: 'Lembur', isi: (j) => ({ upah_per_jam: 'Upah per jam', lumpsum: 'Lumpsum', tidak_ada: 'Tidak ada' })[j.caraBayarLembur] },
          { judul: 'Status', isi: (j) => <Pil jenis={j.aktif ? 'selesai' : 'draf'}>{j.aktif ? 'Aktif' : 'Nonaktif'}</Pil> },
        ]} />
      {edit && <FormJabatan awal={edit} onTutup={() => setEdit(null)} onSelesai={onUbah} />}
    </div>
  );
}

function FormJabatan({ awal, onTutup, onSelesai }: { awal: Partial<Jabatan>; onTutup: () => void; onSelesai: () => void }) {
  const [nama, setNama] = useState(awal.nama ?? '');
  const [posisi, setPosisi] = useState<Jabatan['posisiStruktural']>(awal.posisiStruktural ?? 'Staff');
  const [kelompok, setKelompok] = useState(awal.kelompokJabatan ?? '');
  const [lembur, setLembur] = useState<Jabatan['caraBayarLembur']>(awal.caraBayarLembur ?? 'upah_per_jam');
  const [aktif, setAktif] = useState(awal.aktif ?? true);
  const { galat, umum, tangkap } = useGalatKolom();
  return (
    <Dialog judul={awal.id ? 'Ubah jabatan' : 'Tambah jabatan'} onTutup={onTutup}>
      <div className="tumpuk">
        {umum && <div className="galat-umum">{umum}</div>}
        <div className="formulir">
          <Isian label="Nama jabatan" value={nama} onChange={setNama} wajib salah={galat.nama} />
          <Pilihan label="Posisi struktural" value={posisi} onChange={(v) => setPosisi(v as Jabatan['posisiStruktural'])} kosong={null} opsi={['Staff', 'Manager', 'Direksi', 'Dirut', 'Dewas']} />
          <Isian label="Kelompok jabatan" value={kelompok} onChange={setKelompok} />
          <Pilihan label="Cara bayar lembur" value={lembur} onChange={(v) => setLembur(v as Jabatan['caraBayarLembur'])} kosong={null} opsi={[{ nilai: 'upah_per_jam', label: 'Upah per jam' }, { nilai: 'lumpsum', label: 'Lumpsum' }, { nilai: 'tidak_ada', label: 'Tidak ada' }]} />
        </div>
        <Saklar label="Aktif" checked={aktif} onChange={setAktif} />
        <div className="redup kecil">Posisi struktural menentukan peran Manager/Direksi/Dirut di User Management.</div>
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol pesanBerhasil="Jabatan disimpan." onClick={() => tangkap(async () => { await api('pengaturan.simpanJabatan', { ...(awal.id ? { id: awal.id } : {}), nama, posisiStruktural: posisi, kelompokJabatan: kelompok || null, caraBayarLembur: lembur, aktif }); onSelesai(); onTutup(); })}>Simpan</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

function TabGrade({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  const [edit, setEdit] = useState<Partial<BarisGradeData> | null>(null);
  return (
    <div className="tumpuk">
      <div className="catatan">Isi sesuai lampiran SK 17/KPTS/VIII/2025. Selama kosong, peringatan rentang gaji (EMP-08) tidak bisa diberikan.</div>
      <div><button className="tombol" onClick={() => setEdit({})}>Tambah baris grade</button></div>
      <Tabel data={m.tabelGrade} kunci={(g) => g.id} kosong="Tabel Grade belum diisi." onKlik={setEdit} perHalamanAwal={20}
        kolom={[
          { judul: 'Grade', isi: (g) => `${g.grade} / ${g.subGrade}`, cari: (g) => `${g.grade} ${g.subGrade} ${g.namaJabatan ?? ''}` },
          { judul: 'Jabatan', isi: (g) => g.namaJabatan ?? '—' },
          { judul: 'Masa kerja', isi: (g) => `${g.masaKerjaMinThn ?? 0}–${g.masaKerjaMaxThn ?? '…'} th` },
          { judul: 'Gapok min', uang: true, isi: (g) => (g.gapokMin === null ? '—' : formatRupiah(g.gapokMin)) },
          { judul: 'Gapok maks', uang: true, isi: (g) => (g.gapokMax === null ? '—' : formatRupiah(g.gapokMax)) },
          { judul: 'Tunj. jabatan', uang: true, isi: (g) => (g.tunjanganJabatan === null ? '—' : formatRupiah(g.tunjanganJabatan)) },
          { judul: 'Berlaku', isi: (g) => tanggalPendek(g.berlakuMulai) },
        ]} />
      {edit && <FormGrade awal={edit} onTutup={() => setEdit(null)} onSelesai={onUbah} />}
    </div>
  );
}

function FormGrade({ awal, onTutup, onSelesai }: { awal: Partial<BarisGradeData>; onTutup: () => void; onSelesai: () => void }) {
  const s = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));
  const [n, setN] = useState<Record<string, string>>({
    grade: s(awal.grade), subGrade: s(awal.subGrade), namaJabatan: s(awal.namaJabatan), pendidikanMin: s(awal.pendidikanMin),
    masaKerjaMinThn: s(awal.masaKerjaMinThn), masaKerjaMaxThn: s(awal.masaKerjaMaxThn), tunjanganJabatan: s(awal.tunjanganJabatan),
    gapokMin: s(awal.gapokMin), gapokMed: s(awal.gapokMed), gapokMax: s(awal.gapokMax), berlakuMulai: s(awal.berlakuMulai),
  });
  const { galat, umum, tangkap } = useGalatKolom();
  const f = (k: string, label: string, opsi: { wajib?: boolean; jenis?: 'date' | 'number' } = {}) => (
    <Isian label={label} value={n[k] ?? ''} onChange={(v) => setN((x) => ({ ...x, [k]: v }))} wajib={opsi.wajib} jenis={opsi.jenis} salah={galat[k]} />
  );
  const angka = (k: string) => (n[k] ? Number(n[k]) : null);
  return (
    <Dialog judul={awal.id ? 'Ubah baris grade' : 'Tambah baris grade'} onTutup={onTutup}>
      <div className="tumpuk">
        {umum && <div className="galat-umum">{umum}</div>}
        <div className="formulir">
          {f('grade', 'Grade', { wajib: true })}{f('subGrade', 'Sub grade', { wajib: true })}{f('namaJabatan', 'Nama jabatan')}{f('pendidikanMin', 'Pendidikan minimum')}
          {f('masaKerjaMinThn', 'Masa kerja min (th)', { jenis: 'number' })}{f('masaKerjaMaxThn', 'Masa kerja maks (th)', { jenis: 'number' })}
          {f('gapokMin', 'Gapok minimum', { jenis: 'number' })}{f('gapokMed', 'Gapok median', { jenis: 'number' })}{f('gapokMax', 'Gapok maksimum', { jenis: 'number' })}
          {f('tunjanganJabatan', 'Tunjangan jabatan', { jenis: 'number' })}{f('berlakuMulai', 'Berlaku mulai', { wajib: true, jenis: 'date' })}
        </div>
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol pesanBerhasil="Baris grade disimpan." onClick={() => tangkap(async () => {
            await api('pengaturan.simpanGrade', {
              ...(awal.id ? { id: awal.id } : {}), grade: n.grade!, subGrade: n.subGrade!, namaJabatan: n.namaJabatan || null, pendidikanMin: n.pendidikanMin || null,
              masaKerjaMinThn: angka('masaKerjaMinThn'), masaKerjaMaxThn: angka('masaKerjaMaxThn'), tunjanganJabatan: angka('tunjanganJabatan'),
              gapokMin: angka('gapokMin'), gapokMed: angka('gapokMed'), gapokMax: angka('gapokMax'), berlakuMulai: n.berlakuMulai!,
            });
            onSelesai();
            onTutup();
          })}>Simpan</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

function TabNilai({ m, onUbah }: { m: MasterData; onUbah: () => void }) {
  return (
    <Tabel data={m.pengaturan} kunci={(p) => p.kunci} cari={false} kosong=""
      kolom={[
        { judul: 'Pengaturan', isi: (p) => <div><div>{p.keterangan ?? p.kunci}</div><div className="mono kecil redup">{p.kunci}</div></div> },
        { judul: 'Nilai', isi: (p) => <NilaiSunting kunci={p.kunci} nilai={p.nilai} onUbah={onUbah} /> },
      ]} />
  );
}

function NilaiSunting({ kunci, nilai, onUbah }: { kunci: string; nilai: string; onUbah: () => void }) {
  const [v, setV] = useState(nilai);
  return (
    <div className="baris">
      <input className="tombol sekunder kecil" style={{ width: 120, fontWeight: 400 }} value={v} onChange={(e) => setV(e.target.value)} aria-label={kunci} />
      <Tombol kecil gaya="sekunder" disabled={v === nilai} pesanBerhasil="Pengaturan disimpan." onClick={async () => { await api('pengaturan.simpanNilai', { kunci, nilai: v }); onUbah(); }}>Simpan</Tombol>
    </div>
  );
}
