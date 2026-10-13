// Detail pegawai (Admin HRD) dan Profil & e-CV (pegawai sendiri).
// Cakupan data ditentukan server: atasan hanya menerima profil dasar, dan gaji
// hanya untuk yang berhak (OTZ-03, OTZ-04). Dokumen hanya ybs dan Admin HRD (OTZ-07).
import { useState } from 'react';
import type { BarisRiwayat, DetailPegawai as TDetail, JenisDokumen, JenisRiwayat, MasterData, StatusPegawai } from '../../bersama/aksi.js';
import { JENIS_DOKUMEN, LABEL_STATUS_PEGAWAI, STATUS_PEGAWAI } from '../../bersama/aksi.js';
import { KOLOM_PEGAWAI, KOLOM_RIWAYAT, type DefKolom } from '../../bersama/pegawai.js';
import { api, GalatApi, keBase64, urlUnduh } from '../api.js';
import { Dialog, Isian, JudulLayar, Kartu, Konfirmasi, Memuat, Pil, Pilihan, Tombol, toast, useGalatKolom, useMuat } from '../komponen/dasar.js';
import { FieldDef, keData, type NilaiForm } from '../komponen/FormDef.js';
import { Ikon } from '../komponen/Ikon.js';
import { formatRupiah, isi, tanggalPanjang, tanggalPendek, ukuran, waktuLengkap, BELUM_DIISI } from '../format.js';
import { useSesi } from '../Sesi.js';
import { FormPegawai } from './DataPegawai.js';

const TAB = ['Data', 'Keluarga', 'Pendidikan', 'Riwayat pekerjaan', 'Sertifikasi', 'Riwayat diklat', 'Dokumen', 'Gaji', 'Riwayat status'] as const;
type Tab = (typeof TAB)[number];
const TAB_RIWAYAT: Partial<Record<Tab, JenisRiwayat>> = {
  Keluarga: 'keluarga', Pendidikan: 'pendidikan', 'Riwayat pekerjaan': 'riwayat_pekerjaan', Sertifikasi: 'sertifikasi', 'Riwayat diklat': 'riwayat_diklat',
};

function tampilNilai(def: DefKolom, v: unknown, master: MasterData | null, d: TDetail): string {
  if (def.jenis === 'titik_kantor' && !v) return 'Bebas (titik aktif mana pun)';
  if (v === null || v === undefined || v === '') return BELUM_DIISI;
  if (def.jenis === 'ya_tidak') return v ? 'Ya' : 'Tidak';
  if (def.jenis === 'tanggal') return tanggalPanjang(String(v));
  if (def.jenis === 'unit') return d.unit ?? BELUM_DIISI;
  if (def.jenis === 'jabatan') return d.jabatan ?? BELUM_DIISI;
  if (def.jenis === 'titik_kantor') return master?.titikKantor.find((t) => t.id === v)?.nama ?? 'Dikunci ke satu titik kantor';
  if (def.kolom === 'status_pegawai') return LABEL_STATUS_PEGAWAI[v as StatusPegawai] ?? String(v);
  if (def.kolom === 'jenis_kelamin') return v === 'L' ? 'Laki-laki' : 'Perempuan';
  return String(v);
}

function FotoProfil({ d, versi }: { d: TDetail; versi: number }) {
  const [gagal, setGagal] = useState(false);
  if (d.adaFoto && !gagal) return <img className="foto-profil" src={`${urlUnduh('foto-profil', d.pegawai.id)}?v=${versi}`} alt={`Foto ${d.pegawai.nama_lengkap}`} onError={() => setGagal(true)} style={{ borderStyle: 'solid' }} />;
  return <div className="foto-profil">Tanpa foto</div>;
}

/** EMP-14: foto 3:4 dipotong di tengah, maksimal 900×1200, JPEG. */
async function potongFoto(f: File): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((ok, gagal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => gagal(new Error('Berkas bukan foto yang bisa dibaca.'));
    i.src = URL.createObjectURL(f);
  });
  const rasio = 3 / 4;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (sw / sh > rasio) sw = sh * rasio;
  else sh = sw / rasio;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  const lebar = Math.min(900, Math.round(sw));
  const c = document.createElement('canvas');
  c.width = lebar;
  c.height = Math.round(lebar / rasio);
  c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error('Foto gagal diproses'))), 'image/jpeg', 0.85));
}

export function DetailPegawai({ id }: { id: string | null }) {
  const { sesi } = useSesi();
  const muatan = useMuat(() => (id ? api('pegawai.detail', { id }) : api('pegawai.saya', {})), [id]);
  const bolehMaster = !!sesi && sesi.menu.includes('data_pegawai');
  const master = useMuat(() => (bolehMaster ? api('pengaturan.master', {}) : Promise.resolve(null)), [bolehMaster]);
  const [tab, setTab] = useState<Tab>('Data');
  const [ubah, setUbah] = useState(false);
  const [status, setStatus] = useState(false);
  const [versiFoto, setVersiFoto] = useState(0);
  const d = muatan.data;
  const hrd = sesi?.peranAdmin.includes('admin_hrd') ?? false;
  const diriSendiri = d?.pegawai.id === sesi?.pegawaiId;

  const unggahFoto = async (f: File | undefined) => {
    if (!f || !d) return;
    try {
      const b = await potongFoto(f);
      if (b.size > 2 * 1024 * 1024) throw new Error('Foto masih lebih dari 2 MB setelah dikompres.');
      await api('pegawai.unggahFoto', { pegawaiId: d.pegawai.id, isi: await keBase64(b) });
      toast.berhasil('Foto profil disimpan.');
      setVersiFoto((v) => v + 1);
      muatan.muatUlang();
    } catch (e) {
      toast.gagal(e instanceof Error ? e.message : 'Foto gagal diunggah.');
    }
  };

  const tabTersedia = TAB.filter((t) => {
    if (!d) return false;
    if (d.cakupan === 'dasar') return t === 'Data';
    if (t === 'Gaji') return d.gaji !== null;
    if (t === 'Dokumen') return hrd || diriSendiri;
    return true;
  });

  return (
    <>
      <JudulLayar
        judul={id ? 'Detail Pegawai' : 'Profil & e-CV'}
        keterangan={!id ? 'Perubahan data diri diajukan ke Admin HRD (pengajuan perubahan profil tersedia mulai Fase 2).' : undefined}
        aksi={d && (
          <>
            {(hrd || diriSendiri) && d.cakupan === 'penuh' && <a className="tombol sekunder" href={urlUnduh('ecv', d.pegawai.id)} target="_blank" rel="noopener noreferrer"><Ikon nama="dokumen" ukuran={16} /> e-CV (PDF)</a>}
            {d.bolehUbah && id && <button className="tombol sekunder" onClick={() => setStatus(true)}>Ubah status</button>}
            {d.bolehUbah && id && <button className="tombol" onClick={() => setUbah(true)}>Ubah data</button>}
          </>
        )}
      />
      <Memuat muatan={muatan}>
        {d && (
          <div className="tumpuk">
            <Kartu>
              <div className="profil-kepala">
                <FotoProfil d={d} versi={versiFoto} />
                <div className="tumpuk" style={{ gap: 4 }}>
                  <h2>{[d.pegawai.gelar_depan, d.pegawai.nama_lengkap].filter(Boolean).join(' ')}{d.pegawai.gelar_belakang ? `, ${d.pegawai.gelar_belakang}` : ''}</h2>
                  <div className="mono redup">NPP {d.pegawai.npp}</div>
                  <div>{d.jabatan ?? 'Jabatan belum diisi'} · {d.unit ?? 'Unit belum diisi'}</div>
                  <div className="baris">
                    {d.pegawai.status_pegawai && <Pil jenis={d.pegawai.status_pegawai === 'aktif' ? 'selesai' : 'menunggu'}>{LABEL_STATUS_PEGAWAI[d.pegawai.status_pegawai as StatusPegawai]}</Pil>}
                    {d.pegawai.jenis_kepegawaian && <Pil jenis="disetujui">{d.pegawai.jenis_kepegawaian}</Pil>}
                    <span className="redup">Masa kerja {d.masaKerja}</span>
                  </div>
                  {hrd && id && (
                    <label className="tombol hantu kecil" style={{ justifySelf: 'start', paddingLeft: 0 }}>
                      <Ikon nama="kamera" ukuran={16} /> Ganti foto (3:4)
                      <input type="file" accept="image/jpeg,image/png" className="sr" onChange={(e) => unggahFoto(e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              </div>
            </Kartu>

            <Kartu rapat>
              <div className="tab">
                {tabTersedia.map((t) => <button key={t} className={t === tab ? 'aktif' : ''} onClick={() => setTab(t)}>{t}</button>)}
              </div>
              <div className="kartu-isi">
                {tab === 'Data' && <TabData d={d} master={master.data} />}
                {TAB_RIWAYAT[tab] && <TabRiwayat jenis={TAB_RIWAYAT[tab]!} d={d} bolehUbah={d.bolehUbah} onUbah={muatan.muatUlang} />}
                {tab === 'Dokumen' && <TabDokumen d={d} bolehUbah={hrd} onUbah={muatan.muatUlang} />}
                {tab === 'Gaji' && <TabGaji d={d} bolehUbah={d.bolehUbah} onUbah={muatan.muatUlang} master={master.data} />}
                {tab === 'Riwayat status' && (
                  <table className="tabel">
                    <thead><tr><th>Status</th><th>Mulai</th><th>Selesai</th><th>Keterangan</th></tr></thead>
                    <tbody>
                      {d.riwayatStatus.map((r) => (
                        <tr key={r.id}><td>{LABEL_STATUS_PEGAWAI[r.status]}</td><td>{tanggalPendek(r.tglMulai)}</td><td>{r.tglSelesai ? tanggalPendek(r.tglSelesai) : 'Sekarang'}</td><td>{r.keterangan ?? '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Kartu>
          </div>
        )}
      </Memuat>
      {ubah && d && <FormPegawai awal={d.pegawai as never} onTutup={() => setUbah(false)} onSelesai={() => muatan.muatUlang()} />}
      {status && d && <DialogStatus pegawaiId={d.pegawai.id} onTutup={() => setStatus(false)} onSelesai={muatan.muatUlang} />}
    </>
  );
}

function TabData({ d, master }: { d: TDetail; master: MasterData | null }) {
  const bagian = d.cakupan === 'dasar' ? ['Identitas'] : ['Identitas', 'Kepegawaian', 'Bank & BPJS', 'Pengaturan'];
  return (
    <div className="tumpuk">
      {bagian.map((b) => (
        <section key={b}>
          <h3 style={{ marginBottom: 8 }}>{b}</h3>
          <dl className="rincian">
            {KOLOM_PEGAWAI.filter((k) => k.bagian === b && k.kolom in d.pegawai).map((k) => {
              const t = tampilNilai(k, d.pegawai[k.kolom as keyof typeof d.pegawai], master, d);
              return (
                <div key={k.kolom} style={{ display: 'contents' }}>
                  <dt>{k.label}</dt>
                  <dd className={`${t === BELUM_DIISI ? 'kosong-isi' : ''}${['npp', 'nik', 'npwp', 'bank_rekening'].includes(k.kolom) ? ' mono' : ''}`}>{t}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

function TabRiwayat({ jenis, d, bolehUbah, onUbah }: { jenis: JenisRiwayat; d: TDetail; bolehUbah: boolean; onUbah: () => void }) {
  const def = KOLOM_RIWAYAT[jenis];
  const baris = d[jenis];
  const [form, setForm] = useState<BarisRiwayat | 'baru' | null>(null);
  const [hapus, setHapus] = useState<BarisRiwayat | null>(null);
  const tampilKolom = def.kolom.slice(0, 5);
  return (
    <div className="tumpuk">
      {bolehUbah && <div><button className="tombol sekunder kecil" onClick={() => setForm('baru')}><Ikon nama="tambah" ukuran={14} /> Tambah {def.judul.toLowerCase()}</button></div>}
      {jenis === 'keluarga' && !baris.some((b) => b.kontak_darurat) && <div className="catatan">Belum ada kontak darurat. Setiap pegawai aktif wajib punya minimal satu (EMP-09).</div>}
      {baris.length === 0 ? (
        <div className="kosong">{def.judul} belum diisi.</div>
      ) : (
        <div className="tabel-wadah">
          <table className="tabel">
            <thead><tr>{tampilKolom.map((k) => <th key={k.kolom}>{k.label}</th>)}{jenis === 'keluarga' && <th>Penanda</th>}{bolehUbah && <th />}</tr></thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.id}>
                  {tampilKolom.map((k) => <td key={k.kolom}>{k.jenis === 'tanggal' ? tanggalPendek(b[k.kolom] as string | null) : k.jenis === 'ya_tidak' ? (b[k.kolom] ? 'Ya' : 'Tidak') : isi(b[k.kolom])}</td>)}
                  {jenis === 'keluarga' && (
                    <td><div className="baris">{b.kontak_darurat && <Pil jenis="ditolak">Kontak darurat</Pil>}{b.ditanggung && <Pil jenis="disetujui">Ditanggung</Pil>}{b.ahli_waris && <Pil jenis="selesai">Ahli waris</Pil>}</div></td>
                  )}
                  {bolehUbah && (
                    <td className="kanan"><div className="baris" style={{ justifyContent: 'flex-end' }}>
                      <button className="tombol hantu kecil" onClick={() => setForm(b)}>Ubah</button>
                      <button className="tombol hantu kecil" onClick={() => setHapus(b)}>Nonaktifkan</button>
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <FormRiwayat jenis={jenis} pegawaiId={d.pegawai.id} awal={form === 'baru' ? null : form} onTutup={() => setForm(null)} onSelesai={onUbah} />}
      {hapus && (
        <Konfirmasi judul={`Nonaktifkan ${def.judul.toLowerCase()}`} akibat="Baris ini disembunyikan dari profil, tetapi tetap tersimpan dan tercatat di Audit Log." label="Nonaktifkan" bahaya
          onTutup={() => setHapus(null)} onYa={async () => { await api('pegawai.nonaktifkanRiwayat', { jenis, id: hapus.id }); toast.berhasil('Dinonaktifkan.'); onUbah(); }} />
      )}
    </div>
  );
}

function FormRiwayat({ jenis, pegawaiId, awal, onTutup, onSelesai }: { jenis: JenisRiwayat; pegawaiId: string; awal: BarisRiwayat | null; onTutup: () => void; onSelesai: () => void }) {
  const def = KOLOM_RIWAYAT[jenis];
  const [nilai, setNilai] = useState<NilaiForm>(() => Object.fromEntries(def.kolom.map((k) => [k.kolom, (awal?.[k.kolom] as NilaiForm[string]) ?? (k.jenis === 'ya_tidak' ? false : null)])));
  const [salah, setSalah] = useState<Record<string, string>>({});
  const simpan = async () => {
    setSalah({});
    try {
      await api('pegawai.simpanRiwayat', { jenis, pegawaiId, data: { ...keData(nilai), ...(awal ? { id: awal.id } : {}) } });
      toast.berhasil(`${def.judul} disimpan.`);
      onSelesai();
      onTutup();
    } catch (e) {
      if (e instanceof GalatApi && e.kolom) setSalah({ [e.kolom]: e.message });
      throw e;
    }
  };
  return (
    <Dialog judul={`${awal ? 'Ubah' : 'Tambah'} ${def.judul.toLowerCase()}`} onTutup={onTutup}>
      <div className="formulir">
        {def.kolom.map((k) => <FieldDef key={k.kolom} def={k} nilai={nilai} ubah={(kolom, v) => setNilai((n) => ({ ...n, [kolom]: v }))} salah={salah[k.kolom]} />)}
      </div>
      <div className="aksi-formulir">
        <button className="tombol sekunder" onClick={onTutup}>Batal</button>
        <Tombol onClick={simpan}>Simpan</Tombol>
      </div>
    </Dialog>
  );
}

function TabDokumen({ d, bolehUbah, onUbah }: { d: TDetail; bolehUbah: boolean; onUbah: () => void }) {
  const [jenis, setJenis] = useState<JenisDokumen>('KTP');
  const [hapus, setHapus] = useState<string | null>(null);
  const unggah = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (f.size > 7 * 1024 * 1024) throw new Error('Berkas lebih dari 7 MB.');
      await api('pegawai.unggahDokumen', { pegawaiId: d.pegawai.id, jenis, namaBerkas: f.name, mediaType: f.type, isi: await keBase64(f) });
      toast.berhasil('Dokumen diunggah.');
      onUbah();
    } catch (e) {
      toast.gagal(e instanceof Error ? e.message : 'Unggah gagal.');
    }
  };
  return (
    <div className="tumpuk">
      <div className="redup kecil">Dokumen hanya bisa dibuka pegawai yang bersangkutan dan Admin HRD.</div>
      {bolehUbah && (
        <div className="baris">
          <div style={{ width: 200 }}><Pilihan label="Jenis dokumen" value={jenis} onChange={(v) => setJenis(v as JenisDokumen)} opsi={JENIS_DOKUMEN} kosong={null} /></div>
          <label className="tombol sekunder"><Ikon nama="unggah" ukuran={16} /> Unggah (PDF/JPG/PNG)
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr" onChange={(e) => unggah(e.target.files?.[0])} />
          </label>
        </div>
      )}
      {d.dokumen.length === 0 ? <div className="kosong">Belum ada dokumen.</div> : (
        <div className="tabel-wadah">
          <table className="tabel">
            <thead><tr><th>Jenis</th><th>Berkas</th><th>Ukuran</th><th>Diunggah</th><th /></tr></thead>
            <tbody>
              {d.dokumen.map((x) => (
                <tr key={x.id}>
                  <td>{x.jenis}</td>
                  <td><a href={urlUnduh('berkas', x.berkasId)} target="_blank" rel="noopener noreferrer">{x.namaBerkas}</a></td>
                  <td>{ukuran(x.ukuranByte)}</td>
                  <td>{waktuLengkap(x.diunggahPada)}</td>
                  <td className="kanan">{bolehUbah && <button className="tombol hantu kecil" onClick={() => setHapus(x.id)}>Nonaktifkan</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hapus && <Konfirmasi judul="Nonaktifkan dokumen" akibat="Dokumen disembunyikan dari profil. Berkasnya tetap tersimpan." bahaya label="Nonaktifkan" onTutup={() => setHapus(null)} onYa={async () => { await api('pegawai.nonaktifkanDokumen', { id: hapus }); onUbah(); }} />}
    </div>
  );
}

function TabGaji({ d, bolehUbah, onUbah, master }: { d: TDetail; bolehUbah: boolean; onUbah: () => void; master: MasterData | null }) {
  const [form, setForm] = useState(false);
  const gaji = d.gaji ?? [];
  return (
    <div className="tumpuk">
      <div className="redup kecil">Gaji berversi: kenaikan membuat versi baru, versi lama tetap tersimpan (EMP-07).</div>
      {bolehUbah && <div><button className="tombol sekunder kecil" onClick={() => setForm(true)}><Ikon nama="tambah" ukuran={14} /> Tambah versi gaji</button></div>}
      {gaji.length === 0 ? <div className="kosong">Belum ada data gaji.</div> : (
        <div className="tabel-wadah">
          <table className="tabel">
            <thead><tr><th>Komponen</th><th className="uang">Nominal</th><th>Berlaku mulai</th><th>Sampai</th><th>No. SK</th></tr></thead>
            <tbody>
              {gaji.map((g) => (
                <tr key={g.id}>
                  <td>{g.komponenNama}</td>
                  <td className="uang">{formatRupiah(g.nominal)}</td>
                  <td>{tanggalPendek(g.berlakuMulai)}</td>
                  <td>{g.berlakuSampai ? tanggalPendek(g.berlakuSampai) : <Pil jenis="selesai">Berlaku</Pil>}</td>
                  <td>{g.noSk ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <FormGaji pegawaiId={d.pegawai.id} master={master} onTutup={() => setForm(false)} onSelesai={onUbah} />}
    </div>
  );
}

function FormGaji({ pegawaiId, master, onTutup, onSelesai }: { pegawaiId: string; master: MasterData | null; onTutup: () => void; onSelesai: () => void }) {
  const [kode, setKode] = useState('GAJI_POKOK');
  const [nominal, setNominal] = useState('');
  const [mulai, setMulai] = useState('');
  const [sk, setSk] = useState('');
  const [peringatan, setPeringatan] = useState<string | null>(null);
  const { galat, umum, tangkap } = useGalatKolom();
  const simpan = () => tangkap(async () => {
    const h = await api('gaji.tambah', { pegawaiId, komponenKode: kode, nominal: Number(nominal.replace(/\D/g, '')), berlakuMulai: mulai, noSk: sk || null });
    onSelesai();
    // EMP-08: peringatan tidak memblokir penyimpanan.
    if (h.peringatan || h.usulanSubGrade) {
      setPeringatan([h.peringatan, h.usulanSubGrade ? `Usulan Sub Grade dari masa kerja: ${h.usulanSubGrade}.` : null].filter(Boolean).join(' '));
      toast.info('Versi gaji disimpan dengan catatan.');
    } else {
      toast.berhasil('Versi gaji disimpan.');
      onTutup();
    }
  });
  return (
    <Dialog judul="Tambah versi gaji" onTutup={onTutup}>
      <div className="tumpuk">
        {umum && <div className="galat-umum">{umum}</div>}
        {peringatan && <div className="catatan">{peringatan}</div>}
        <Pilihan label="Komponen" value={kode} onChange={setKode} wajib kosong={null} salah={galat.komponenKode}
          opsi={(master?.komponenGaji ?? [{ kode: 'GAJI_POKOK', nama: 'Gaji Pokok' }, { kode: 'TUNJ_JABATAN', nama: 'Tunjangan Jabatan' }]).map((k) => ({ nilai: k.kode, label: k.nama }))} />
        <div className="formulir">
          <Isian label="Nominal (Rp)" value={nominal} onChange={(v) => setNominal(v.replace(/[^\d]/g, ''))} wajib mode="numeric" salah={galat.nominal} bantuan={nominal ? formatRupiah(Number(nominal)) : undefined} />
          <Isian label="Berlaku mulai" jenis="date" value={mulai} onChange={setMulai} wajib salah={galat.berlakuMulai} />
        </div>
        <Isian label="No. SK" value={sk} onChange={setSk} />
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>{peringatan ? 'Tutup' : 'Batal'}</button>
          {!peringatan && <Tombol onClick={simpan} disabled={!nominal || !mulai}>Simpan</Tombol>}
        </div>
      </div>
    </Dialog>
  );
}

function DialogStatus({ pegawaiId, onTutup, onSelesai }: { pegawaiId: string; onTutup: () => void; onSelesai: () => void }) {
  const [status, setStatus] = useState<StatusPegawai>('aktif');
  const [mulai, setMulai] = useState('');
  const [ket, setKet] = useState('');
  const { galat, umum, tangkap } = useGalatKolom();
  const berhenti = status === 'berhenti' || status === 'meninggal';
  return (
    <Dialog judul="Ubah status pegawai" onTutup={onTutup}>
      <div className="tumpuk">
        <div className="redup">Status baru dicatat sebagai riwayat; status lama ditutup, tidak ditimpa (EMP-04).</div>
        {umum && <div className="galat-umum">{umum}</div>}
        <Pilihan label="Status baru" value={status} onChange={(v) => setStatus(v as StatusPegawai)} kosong={null} opsi={STATUS_PEGAWAI.map((s) => ({ nilai: s, label: LABEL_STATUS_PEGAWAI[s] }))} />
        <Isian label={berhenti ? 'Tanggal berhenti' : 'Berlaku mulai'} jenis="date" value={mulai} onChange={setMulai} wajib salah={galat.tglMulai} />
        <Isian label={berhenti ? 'Alasan berhenti' : 'Keterangan'} value={ket} onChange={setKet} wajib={berhenti} salah={galat.keterangan} baris={2} />
        {berhenti && <div className="catatan">Akun pegawai dinonaktifkan otomatis pada hari setelah tanggal berhenti (USR-09). Data lamanya tetap tersimpan.</div>}
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol disabled={!mulai} pesanBerhasil="Status diperbarui." onClick={() => tangkap(async () => { await api('pegawai.ubahStatus', { pegawaiId, status, tglMulai: mulai, keterangan: ket || null }); onSelesai(); onTutup(); })}>Simpan</Tombol>
        </div>
      </div>
    </Dialog>
  );
}
