// Login dan ganti kata sandi (SRS AUTH-01 – AUTH-07, AUTH-14).
import { useState, type FormEvent } from 'react';
import { api, GalatApi } from '../api.js';
import { Isian, JudulLayar, Kartu, Saklar, toast } from '../komponen/dasar.js';
import { navigasi } from '../rute.js';
import { useSesi } from '../Sesi.js';
import { periksaSandi } from '../../core/validasi.js';

export function Masuk() {
  const { aturSesi } = useSesi();
  const [username, setUsername] = useState('');
  const [sandi, setSandi] = useState('');
  const [ingat, setIngat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState(false);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    setGalat(null);
    setProses(true);
    try {
      aturSesi(await api('auth.login', { username, sandi, ingat }));
      navigasi('/', true);
    } catch (e2) {
      setGalat(e2 instanceof GalatApi ? e2.message : 'Gagal masuk.');
      setSandi('');
    } finally {
      setProses(false);
    }
  };

  return (
    <div className="masuk-latar">
      <form className="masuk-kartu" onSubmit={kirim}>
        <div className="merek">
          <img src="/logo-dpjm.png" alt="Logo Dana Pensiun Jasa Marga" />
          <div>
            <h1>HRIS DPJM</h1>
            <div className="redup kecil">Dana Pensiun Jasa Marga</div>
          </div>
        </div>
        {galat && <div className="galat-umum" role="alert">{galat}</div>}
        <Isian label="NPP atau email" value={username} onChange={setUsername} wajib otomatis="username" autoFocus />
        <Isian label="Kata sandi" value={sandi} onChange={setSandi} jenis="password" wajib otomatis="current-password" />
        <Saklar label="Ingat perangkat ini (30 hari)" checked={ingat} onChange={setIngat} />
        <button className="tombol penuh" type="submit" disabled={proses || !username || !sandi}>{proses ? 'Memproses…' : 'Masuk'}</button>
        <div className="redup kecil">Lupa kata sandi? Hubungi Admin HRD untuk reset.</div>
      </form>
    </div>
  );
}

export function GantiSandi() {
  const { sesi, muatUlang } = useSesi();
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState<Record<string, string>>({});
  const [proses, setProses] = useState(false);
  const wajib = sesi?.wajibGantiSandi ?? false;

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    const g: Record<string, string> = {};
    const s = periksaSandi(baru);
    if (s) g.sandiBaru = s;
    if (baru !== ulang) g.ulang = 'Tidak sama dengan kata sandi baru';
    setGalat(g);
    if (Object.keys(g).length) return;
    setProses(true);
    try {
      await api('auth.gantiSandi', { sandiLama: lama, sandiBaru: baru });
      toast.berhasil('Kata sandi diganti. Perangkat lain sudah dikeluarkan.');
      setLama('');
      setBaru('');
      setUlang('');
      await muatUlang();
      if (wajib) navigasi('/', true);
    } catch (e2) {
      if (e2 instanceof GalatApi && e2.kolom) setGalat({ [e2.kolom]: e2.message });
      else toast.gagal(e2 instanceof Error ? e2.message : 'Gagal.');
    } finally {
      setProses(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <JudulLayar judul="Ubah Kata Sandi" keterangan={wajib ? 'Kata sandi Anda masih sementara. Ganti dulu sebelum memakai aplikasi.' : 'Minimal 8 karakter, berisi huruf dan angka.'} />
      <Kartu>
        <form className="tumpuk" onSubmit={kirim}>
          <Isian label="Kata sandi lama" value={lama} onChange={setLama} jenis="password" wajib salah={galat.sandiLama} otomatis="current-password" />
          <Isian label="Kata sandi baru" value={baru} onChange={setBaru} jenis="password" wajib salah={galat.sandiBaru} otomatis="new-password" bantuan="Minimal 8 karakter, huruf dan angka." />
          <Isian label="Ulangi kata sandi baru" value={ulang} onChange={setUlang} jenis="password" wajib salah={galat.ulang} otomatis="new-password" />
          <div className="aksi-formulir">
            <button className="tombol" type="submit" disabled={proses || !lama || !baru || !ulang}>{proses ? 'Memproses…' : 'Simpan kata sandi'}</button>
          </div>
        </form>
      </Kartu>
    </div>
  );
}
