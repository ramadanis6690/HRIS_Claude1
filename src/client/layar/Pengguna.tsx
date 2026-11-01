// User Management (SRS USR-01 – USR-10, AUTH-08). Sembilan peran dalam satu
// daftar: struktural dari jabatan (hanya-baca), admin dicentang Super Admin.
import { useState } from 'react';
import type { AkunBaru, BarisAkun, PeranAdmin } from '../../bersama/aksi.js';
import { PERAN_ADMIN } from '../../bersama/aksi.js';
import { api } from '../api.js';
import { Dialog, Isian, JudulLayar, Kartu, Konfirmasi, Memuat, Pil, Tabel, Tombol, useGalatKolom, useMuat } from '../komponen/dasar.js';
import { waktuLengkap } from '../format.js';
import { useSesi } from '../Sesi.js';

export const LABEL_PERAN: Record<string, string> = {
  employee: 'Employee', manager: 'Manager / Atasan', direksi: 'Direksi', dirut: 'Dirut',
  super_admin: 'Super Admin', admin_hrd: 'Admin HRD', admin_payroll: 'Admin Payroll', admin_finance: 'Admin Finance', auditor: 'Auditor',
};

function DaftarSandi({ akun, onTutup }: { akun: AkunBaru[]; onTutup: () => void }) {
  return (
    <Dialog judul="Kata sandi sementara" onTutup={onTutup}>
      <div className="tumpuk">
        <div className="catatan">Ditampilkan <strong>sekali saja</strong>. Sampaikan langsung ke masing-masing pegawai. Mereka wajib menggantinya saat login pertama.</div>
        <div className="tabel-wadah">
          <table className="tabel">
            <thead><tr><th>Nama</th><th>NPP</th><th>Kata sandi sementara</th></tr></thead>
            <tbody>{akun.map((a) => <tr key={a.pegawaiId}><td>{a.nama}</td><td className="mono">{a.npp}</td><td className="mono" style={{ fontWeight: 600 }}>{a.sandiSementara}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="aksi-formulir"><button className="tombol" onClick={onTutup}>Sudah dicatat</button></div>
      </div>
    </Dialog>
  );
}

function DialogPeran({ akun, onTutup, onSelesai }: { akun: BarisAkun; onTutup: () => void; onSelesai: () => void }) {
  const [peran, setPeran] = useState<PeranAdmin[]>(akun.peranAdmin);
  const [alasan, setAlasan] = useState('');
  const { galat, umum, tangkap } = useGalatKolom();
  const konflik = (peran.includes('admin_payroll') && peran.includes('admin_finance')) || (peran.includes('auditor') && peran.length > 1);
  const ganti = (p: PeranAdmin) => setPeran((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
  return (
    <Dialog judul={`Peran ${akun.nama}`} onTutup={onTutup}>
      <div className="tumpuk">
        {umum && <div className="galat-umum">{umum}</div>}
        <div><span className="redup">Peran struktural (dari jabatan): </span><Pil jenis="disetujui">{LABEL_PERAN[akun.peranStruktural]}</Pil></div>
        <div className="tumpuk" style={{ gap: 8 }}>
          {PERAN_ADMIN.map((p) => (
            <label key={p} className="kotak-centang"><input type="checkbox" checked={peran.includes(p)} onChange={() => ganti(p)} /> {LABEL_PERAN[p]}</label>
          ))}
        </div>
        {konflik && (
          <div className="catatan">
            Kombinasi ini melemahkan pemisahan tugas.
            {peran.includes('admin_payroll') && peran.includes('admin_finance') && ' Orang ini dapat menghitung payroll pada Tahap 2 dan mencairkannya pada Tahap 5.'}
            {' '}Boleh disimpan dengan alasan tertulis; peringatannya tetap tampil di Beranda Super Admin.
          </div>
        )}
        <Isian label={konflik ? 'Alasan (wajib)' : 'Alasan (opsional)'} value={alasan} onChange={setAlasan} wajib={konflik} salah={galat.alasan} baris={2} />
        <div className="aksi-formulir">
          <button className="tombol sekunder" onClick={onTutup}>Batal</button>
          <Tombol pesanBerhasil="Peran disimpan." onClick={() => tangkap(async () => { await api('pengguna.aturPeran', { pegawaiId: akun.pegawaiId, peran, alasan: alasan || null }); onSelesai(); onTutup(); })}>Simpan peran</Tombol>
        </div>
      </div>
    </Dialog>
  );
}

export function Pengguna() {
  const { sesi } = useSesi();
  const superAdmin = sesi?.peranAdmin.includes('super_admin') ?? false;
  const muatan = useMuat(() => api('pengguna.daftar', {}), []);
  const [sandiBaru, setSandiBaru] = useState<AkunBaru[] | null>(null);
  const [pilih, setPilih] = useState<string[]>([]);
  const [reset, setReset] = useState<BarisAkun | null>(null);
  const [aktif, setAktif] = useState<BarisAkun | null>(null);
  const [alasanAktif, setAlasanAktif] = useState('');
  const [peran, setPeran] = useState<BarisAkun | null>(null);
  const d = muatan.data;

  const buat = async (ids: string[]) => {
    const h = await api('pengguna.buatAkun', { pegawaiIds: ids });
    setSandiBaru(h);
    setPilih([]);
    muatan.muatUlang();
  };

  return (
    <>
      <JudulLayar judul="User Management" keterangan="Akun selalu menunjuk satu pegawai. NPP dan email diambil dari Data Pegawai." />
      <Memuat muatan={muatan}>
        {d && (
          <div className="tumpuk">
            {d.konflik.length > 0 && (
              <div className="catatan">
                {d.konflik.map((k) => <div key={k.pegawaiId + k.kombinasi}><strong>{k.nama}</strong>: {k.kombinasi}. {k.akibat} Alasan: {k.alasan ?? 'tidak tercatat'}.</div>)}
              </div>
            )}
            {d.tanpaAkun.length > 0 && (
              <Kartu judul={`Pegawai aktif tanpa akun (${d.tanpaAkun.length})`} aksi={
                <>
                  <Tombol gaya="sekunder" kecil disabled={pilih.length === 0} onClick={() => buat(pilih)}>Buatkan akun terpilih ({pilih.length})</Tombol>
                  <Tombol kecil onClick={() => buat(d.tanpaAkun.map((p) => p.id))}>Buatkan semua</Tombol>
                </>
              } rapat>
                <Tabel
                  data={d.tanpaAkun} kunci={(p) => p.id} cari={false} kosong=""
                  kolom={[
                    { judul: '', lebar: 40, isi: (p) => <input type="checkbox" aria-label={`Pilih ${p.nama}`} checked={pilih.includes(p.id)} onChange={() => setPilih((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} /> },
                    { judul: 'NPP', isi: (p) => <span className="mono">{p.npp}</span> },
                    { judul: 'Nama', isi: (p) => p.nama },
                    { judul: 'Email', isi: (p) => p.email },
                    { judul: '', isi: (p) => <Tombol kecil gaya="hantu" onClick={() => buat([p.id])}>Buatkan akun</Tombol> },
                  ]}
                />
              </Kartu>
            )}
            <Kartu judul="Akun" rapat>
              <Tabel
                data={d.akun} kunci={(a) => a.penggunaId} kosong="Belum ada akun." perHalamanAwal={20}
                kolom={[
                  { judul: 'Pegawai', isi: (a) => <div><div>{a.nama}</div><div className="redup kecil mono">{a.npp} · {a.email}</div></div>, cari: (a) => `${a.nama} ${a.npp} ${a.email}` },
                  { judul: 'Peran', isi: (a) => <div className="baris"><Pil jenis="disetujui">{LABEL_PERAN[a.peranStruktural]}</Pil>{a.peranAdmin.map((p) => <Pil key={p} jenis="proses">{LABEL_PERAN[p]}</Pil>)}</div> },
                  { judul: 'Status', isi: (a) => <div className="baris"><Pil jenis={a.aktif ? 'selesai' : 'ditolak'}>{a.aktif ? 'Aktif' : 'Nonaktif'}</Pil>{a.terkunciSampai && <Pil jenis="menunggu">Terkunci</Pil>}{a.wajibGantiSandi && <Pil jenis="draf">Sandi sementara</Pil>}</div> },
                  { judul: 'Login terakhir', isi: (a) => (a.loginTerakhir ? waktuLengkap(a.loginTerakhir) : 'Belum pernah') },
                  {
                    judul: '', isi: (a) => (
                      <div className="baris" style={{ justifyContent: 'flex-end' }}>
                        {superAdmin && <button className="tombol hantu kecil" onClick={() => setPeran(a)}>Peran</button>}
                        <button className="tombol hantu kecil" onClick={() => setReset(a)}>Reset sandi</button>
                        <button className="tombol hantu kecil" onClick={() => { setAlasanAktif(''); setAktif(a); }}>{a.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
                      </div>
                    ),
                  },
                ]}
              />
            </Kartu>
          </div>
        )}
      </Memuat>
      {sandiBaru && <DaftarSandi akun={sandiBaru} onTutup={() => setSandiBaru(null)} />}
      {reset && (
        // NFR-10: konfirmasi yang menyebutkan akibatnya.
        <Konfirmasi judul={`Reset kata sandi ${reset.nama}?`} akibat="Kata sandi lama langsung tidak berlaku dan semua sesinya dicabut. Kata sandi sementara ditampilkan sekali." label="Reset kata sandi" bahaya
          onTutup={() => setReset(null)} onYa={async () => { const h = await api('pengguna.resetSandi', { penggunaId: reset.penggunaId }); setSandiBaru([{ pegawaiId: reset.pegawaiId, nama: reset.nama, npp: reset.npp, sandiSementara: h.sandiSementara }]); muatan.muatUlang(); }} />
      )}
      {aktif && (
        <Dialog judul={`${aktif.aktif ? 'Nonaktifkan' : 'Aktifkan'} akun ${aktif.nama}`} onTutup={() => setAktif(null)}>
          <div className="tumpuk">
            <div>{aktif.aktif ? 'Akun tidak bisa dipakai login dan semua sesinya langsung dicabut. Data pegawai, presensi, dan riwayatnya tidak terhapus.' : 'Akun bisa dipakai login lagi.'}</div>
            <Isian label="Alasan" value={alasanAktif} onChange={setAlasanAktif} wajib baris={2} />
            <div className="aksi-formulir">
              <button className="tombol sekunder" onClick={() => setAktif(null)}>Batal</button>
              <Tombol gaya={aktif.aktif ? 'bahaya' : 'utama'} disabled={!alasanAktif.trim()} pesanBerhasil="Status akun diperbarui."
                onClick={async () => { await api('pengguna.aturAktif', { penggunaId: aktif.penggunaId, aktif: !aktif.aktif, alasan: alasanAktif }); setAktif(null); muatan.muatUlang(); }}>
                {aktif.aktif ? 'Nonaktifkan' : 'Aktifkan'}
              </Tombol>
            </div>
          </div>
        </Dialog>
      )}
      {peran && <DialogPeran akun={peran} onTutup={() => setPeran(null)} onSelesai={muatan.muatUlang} />}
    </>
  );
}
