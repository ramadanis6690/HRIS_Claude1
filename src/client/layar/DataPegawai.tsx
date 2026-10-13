// Daftar pegawai, tambah/ubah, dan impor Excel (PRD §6.2, SRS EMP-17 – EMP-20).
import { useMemo, useState } from 'react';
import type { DataPegawai as TData, JenisKepegawaian, MasterData, PratinjauImpor } from '../../bersama/aksi.js';
import { LABEL_STATUS_PEGAWAI } from '../../bersama/aksi.js';
import { KOLOM_PEGAWAI, sakelarBawaan } from '../../bersama/pegawai.js';
import { api, GalatApi, keBase64, urlUnduh } from '../api.js';
import { Dialog, JudulLayar, Kartu, Memuat, Pil, Saklar, Tabel, Tombol, toast, useMuat } from '../komponen/dasar.js';
import { FieldDef, keData, type NilaiForm } from '../komponen/FormDef.js';
import { Ikon } from '../komponen/Ikon.js';
import { navigasi } from '../rute.js';

export function DataPegawai() {
  const [nonaktif, setNonaktif] = useState(false);
  const daftar = useMuat(() => api('pegawai.daftar', { termasukNonaktif: nonaktif }), [nonaktif]);
  const [form, setForm] = useState(false);
  const [impor, setImpor] = useState(false);
  return (
    <>
      <JudulLayar
        judul="Data Pegawai"
        keterangan="Satu-satunya sumber identitas pegawai (EMP-01)."
        aksi={
          <>
            <a className="tombol sekunder" href={urlUnduh('templat-impor')}><Ikon nama="unduh" ukuran={16} /> Templat Excel</a>
            <button className="tombol sekunder" onClick={() => setImpor(true)}><Ikon nama="unggah" ukuran={16} /> Impor Excel</button>
            <button className="tombol" onClick={() => setForm(true)}><Ikon nama="tambah" ukuran={16} /> Tambah pegawai</button>
          </>
        }
      />
      <Kartu rapat>
        <Memuat muatan={daftar}>
          <Tabel
            data={daftar.data ?? []}
            kunci={(p) => p.id}
            onKlik={(p) => navigasi(`/pegawai/${p.id}`)}
            kosong="Belum ada data pegawai. Tambahkan satu per satu atau impor dari templat Excel."
            alat={<Saklar label="Tampilkan nonaktif" checked={nonaktif} onChange={setNonaktif} />}
            kolom={[
              { judul: 'NPP', isi: (p) => <span className="mono">{p.npp}</span>, cari: (p) => p.npp },
              { judul: 'Nama', isi: (p) => p.nama, cari: (p) => `${p.nama} ${p.email}` },
              { judul: 'Jabatan', isi: (p) => p.jabatan ?? '—', cari: (p) => p.jabatan ?? '' },
              { judul: 'Unit', isi: (p) => p.unit ?? '—', cari: (p) => p.unit ?? '' },
              { judul: 'Jenis', isi: (p) => p.jenisKepegawaian, cari: (p) => p.jenisKepegawaian },
              { judul: 'Status', isi: (p) => <Pil jenis={!p.aktif ? 'ditolak' : p.statusPegawai === 'aktif' ? 'selesai' : 'menunggu'}>{p.aktif ? LABEL_STATUS_PEGAWAI[p.statusPegawai] : 'Nonaktif'}</Pil> },
              { judul: 'Akun', isi: (p) => (p.punyaAkun ? 'Ada' : <span className="redup">Belum</span>) },
            ]}
          />
        </Memuat>
      </Kartu>
      {form && <FormPegawai onTutup={() => setForm(false)} onSelesai={(id) => navigasi(`/pegawai/${id}`)} />}
      {impor && <DialogImpor onTutup={() => setImpor(false)} onSelesai={daftar.muatUlang} />}
    </>
  );
}

const BAGIAN = ['Identitas', 'Kepegawaian', 'Bank & BPJS', 'Pengaturan'];

export function FormPegawai({ awal, onTutup, onSelesai }: { awal?: Partial<TData> & { id: string }; onTutup: () => void; onSelesai: (id: string) => void }) {
  const master = useMuat(() => api('pengaturan.master', {}), []);
  const baru = !awal;
  const [nilai, setNilai] = useState<NilaiForm>(() => {
    const n: NilaiForm = {};
    for (const d of KOLOM_PEGAWAI) n[d.kolom] = (awal?.[d.kolom as keyof TData] as NilaiForm[string] | undefined) ?? (d.jenis === 'ya_tidak' ? false : null);
    if (baru) Object.assign(n, sakelarBawaan('PKWTT'), { jenis_kepegawaian: 'PKWTT', status_pegawai: 'aktif', kewarganegaraan: 'Indonesia' });
    return n;
  });
  const [salah, setSalah] = useState<Record<string, string>>({});
  const [bagian, setBagian] = useState(BAGIAN[0]!);

  const ubah = (kolom: string, v: string | boolean | null) => {
    setNilai((n) => {
      const hasil = { ...n, [kolom]: v };
      // Nilai awal sakelar mengikuti jenis kepegawaian (EMP-20), hanya untuk pegawai baru.
      if (baru && kolom === 'jenis_kepegawaian' && typeof v === 'string') Object.assign(hasil, sakelarBawaan(v as JenisKepegawaian));
      return hasil;
    });
  };

  const simpan = async () => {
    setSalah({});
    const kirim = keData(nilai);
    if (!baru) {
      for (const d of KOLOM_PEGAWAI) if (d.hanyaSaatBaru) delete kirim[d.kolom];
      kirim.id = awal!.id;
    }
    try {
      const h = await api('pegawai.simpan', kirim as unknown as TData);
      toast.berhasil(baru ? 'Pegawai ditambahkan.' : 'Data pegawai disimpan.');
      onSelesai(h.id);
      onTutup();
    } catch (e) {
      if (e instanceof GalatApi && e.kolom) {
        setSalah({ [e.kolom]: e.message });
        const def = KOLOM_PEGAWAI.find((d) => d.kolom === e.kolom);
        if (def) setBagian(def.bagian);
      }
      throw e;
    }
  };

  return (
    <Dialog judul={baru ? 'Tambah pegawai' : 'Ubah data pegawai'} onTutup={onTutup} lebar>
      <Memuat muatan={master}>
        <div className="tab" style={{ margin: '-16px -16px 16px' }}>
          {BAGIAN.map((b) => (
            <button key={b} className={b === bagian ? 'aktif' : ''} onClick={() => setBagian(b)}>
              {b}{KOLOM_PEGAWAI.some((d) => d.bagian === b && salah[d.kolom]) ? ' •' : ''}
            </button>
          ))}
        </div>
        <div className="formulir">
          {KOLOM_PEGAWAI.filter((d) => d.bagian === bagian && (baru || !d.hanyaSaatBaru)).map((d) => (
            <FieldDef key={d.kolom} def={d} nilai={nilai} ubah={ubah} salah={salah[d.kolom]} master={master.data as MasterData | null} />
          ))}
        </div>
        {!baru && bagian === 'Kepegawaian' && <div className="redup kecil" style={{ marginTop: 12 }}>Status pegawai diubah lewat tombol “Ubah status”, supaya riwayatnya tercatat.</div>}
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol onClick={simpan}>Simpan</Tombol>
        </div>
      </Memuat>
    </Dialog>
  );
}

function DialogImpor({ onTutup, onSelesai }: { onTutup: () => void; onSelesai: () => void }) {
  const [isi, setIsi] = useState<string | null>(null);
  const [nama, setNama] = useState('');
  const [pratinjau, setPratinjau] = useState<PratinjauImpor | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const pilih = async (f: File | undefined) => {
    if (!f) return;
    setGalat(null);
    setPratinjau(null);
    setNama(f.name);
    try {
      const b = await keBase64(f);
      setIsi(b);
      setPratinjau(await api('pegawai.imporPratinjau', { isi: b }));
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Berkas gagal dibaca.');
    }
  };
  const galatPerBaris = useMemo(() => pratinjau?.galat ?? [], [pratinjau]);
  return (
    <Dialog judul="Impor data pegawai dari Excel" onTutup={onTutup} lebar>
      <div className="tumpuk">
        <div className="info-kotak">Gunakan <a href={urlUnduh('templat-impor')}>Template_Data_Pegawai_DPJM.xlsx</a>. Satu baris salah membatalkan seluruh impor. Baris dengan NPP berawalan CONTOH diabaikan.</div>
        <label className="tombol sekunder" style={{ justifySelf: 'start' }}>
          <Ikon nama="unggah" ukuran={16} /> {nama || 'Pilih berkas .xlsx'}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr" onChange={(e) => pilih(e.target.files?.[0])} />
        </label>
        {galat && <div className="galat-umum">{galat}</div>}
        {pratinjau && (
          <>
            <div className="baris">
              <Pil jenis={pratinjau.sah ? 'selesai' : 'ditolak'}>{pratinjau.sah ? 'Siap diimpor' : `${galatPerBaris.length} galat`}</Pil>
              <span className="redup">{pratinjau.jumlahBaris} baris data · {pratinjau.diabaikan} baris contoh diabaikan</span>
            </div>
            {galatPerBaris.length > 0 && (
              <div className="tabel-wadah" style={{ maxHeight: 240, overflow: 'auto' }}>
                <table className="tabel">
                  <thead><tr><th>Baris</th><th>Kolom</th><th>Masalah</th></tr></thead>
                  <tbody>{galatPerBaris.map((g, i) => <tr key={i}><td>{g.baris}</td><td className="mono">{g.kolom}</td><td>{g.pesan}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {pratinjau.pratinjau.length > 0 && (
              <div className="tabel-wadah" style={{ maxHeight: 240, overflow: 'auto' }}>
                <table className="tabel">
                  <thead><tr><th>Baris</th><th>NPP</th><th>Nama</th><th>Jenis</th><th>Unit</th></tr></thead>
                  <tbody>{pratinjau.pratinjau.map((p) => <tr key={p.baris}><td>{p.baris}</td><td className="mono">{p.npp}</td><td>{p.nama}</td><td>{p.jenisKepegawaian}</td><td>{p.unit ?? '—'}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </>
        )}
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Tutup</button>
          <Tombol disabled={!pratinjau?.sah || !isi} onClick={async () => {
            const h = await api('pegawai.imporSimpan', { isi: isi! });
            toast.berhasil(`${h.jumlah} pegawai diimpor.`);
            onSelesai();
            onTutup();
          }}>Impor semua</Tombol>
        </div>
      </div>
    </Dialog>
  );
}
