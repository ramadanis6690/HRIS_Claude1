// Presensi pegawai: check-in GPS + foto, check-out GPS (SRS ATT-01 – ATT-15).
// Layar ini tidak memuat peta (ATT-14). Jam, jarak, dan keterlambatan dihitung server.
import { useEffect, useRef, useState } from 'react';
import type { PresensiRingkas } from '../../bersama/aksi.js';
import { api, GalatApi, keBase64 } from '../api.js';
import { JudulLayar, Kartu, Memuat, Pil, Tabel, toast, useMuat } from '../komponen/dasar.js';
import { Ikon } from '../komponen/Ikon.js';
import { hariTanggal, jam, namaBulan, tanggalPendek } from '../format.js';
import { jamWIB } from '../../core/tanggal.js';

const SISI_FOTO = 720; // ATT-06: sisi terpanjang 720 px, JPEG kualitas 0,6
const KUALITAS = 0.6;

interface Posisi {
  lat: number;
  lng: number;
  akurasi: number;
}

function ambilLokasi(): Promise<Posisi> {
  return new Promise((ok, gagal) => {
    if (!window.isSecureContext) return gagal(new Error('Lokasi hanya bisa dibaca lewat HTTPS. Buka aplikasi dari alamat https://.'));
    if (!('geolocation' in navigator)) return gagal(new Error('Browser ini tidak mendukung GPS. Gunakan Chrome atau Safari terbaru.'));
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude, akurasi: p.coords.accuracy }),
      (e) => {
        // ATT-08: jelaskan cara memulihkan, jangan gagal diam-diam.
        if (e.code === e.PERMISSION_DENIED) {
          gagal(new Error('Izin lokasi ditolak. Buka pengaturan situs di browser (ikon gembok di samping alamat) → Lokasi → Izinkan, lalu muat ulang halaman.'));
        } else if (e.code === e.POSITION_UNAVAILABLE) {
          gagal(new Error('Lokasi tidak tersedia. Nyalakan GPS / Lokasi di HP, lalu coba lagi.'));
        } else {
          gagal(new Error('GPS terlalu lama merespons. Coba lagi di dekat jendela atau di luar ruangan.'));
        }
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

async function kompres(sumber: CanvasImageSource, lebar: number, tinggi: number): Promise<Blob> {
  const skala = Math.min(1, SISI_FOTO / Math.max(lebar, tinggi));
  const c = document.createElement('canvas');
  c.width = Math.round(lebar * skala);
  c.height = Math.round(tinggi * skala);
  c.getContext('2d')!.drawImage(sumber, 0, 0, c.width, c.height);
  return new Promise((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error('Foto gagal diproses'))), 'image/jpeg', KUALITAS));
}

function bacaGambar(f: File): Promise<HTMLImageElement> {
  return new Promise((ok, gagal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => gagal(new Error('Berkas bukan foto yang bisa dibaca.'));
    img.src = URL.createObjectURL(f);
  });
}

type Langkah = 'diam' | 'lokasi' | 'kamera' | 'pratinjau' | 'kirim';

function AlurCheckIn({ onSelesai, onBatal }: { onSelesai: () => void; onBatal: () => void }) {
  const [langkah, setLangkah] = useState<Langkah>('lokasi');
  const [posisi, setPosisi] = useState<Posisi | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cadangan, setCadangan] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const aliran = useRef<MediaStream | null>(null);

  const hentikanKamera = () => {
    aliran.current?.getTracks().forEach((t) => t.stop());
    aliran.current = null;
  };

  const bukaKamera = async (batal: () => boolean = () => false) => {
    setCadangan(null);
    setLangkah('kamera');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera langsung tidak didukung browser ini.');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
      if (batal()) return s.getTracks().forEach((t) => t.stop());
      aliran.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => undefined);
      }
    } catch (e) {
      // ATT-07: tawarkan kamera bawaan HP dan sebutkan sebabnya.
      const izin = e instanceof DOMException && e.name === 'NotAllowedError';
      setCadangan(izin ? 'Izin kamera ditolak. Anda masih bisa memakai kamera bawaan HP di bawah ini.' : 'Kamera langsung tidak bisa dibuka. Pakai kamera bawaan HP di bawah ini.');
    }
  };

  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const p = await ambilLokasi();
        if (batal) return;
        setPosisi(p);
        await bukaKamera(() => batal);
      } catch (e) {
        if (!batal) setGalat(e instanceof Error ? e.message : 'Lokasi gagal dibaca.');
      }
    })();
    return () => {
      batal = true;
      hentikanKamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sekali saat alur dibuka
  }, []);

  useEffect(() => () => {
    if (urlFoto) URL.revokeObjectURL(urlFoto);
  }, [urlFoto]);

  const jepret = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const b = await kompres(v, v.videoWidth, v.videoHeight);
    hentikanKamera();
    setFoto(b);
    setUrlFoto(URL.createObjectURL(b));
    setLangkah('pratinjau');
  };

  const dariBerkas = async (f: File | undefined) => {
    if (!f) return;
    try {
      const img = await bacaGambar(f);
      const b = await kompres(img, img.naturalWidth, img.naturalHeight);
      setFoto(b);
      setUrlFoto(URL.createObjectURL(b));
      setLangkah('pratinjau');
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Foto gagal dibaca.');
    }
  };

  const kirim = async () => {
    if (!posisi || !foto) return;
    setLangkah('kirim');
    setGalat(null);
    try {
      const p = await api('presensi.checkIn', { ...posisi, foto: await keBase64(foto) });
      toast.berhasil(`Check-in tercatat pukul ${jam(p.masukPada)}${p.menitTerlambat ? ` (terlambat ${p.menitTerlambat} menit)` : ''}.`);
      onSelesai();
    } catch (e) {
      setGalat(e instanceof GalatApi ? e.message : 'Check-in gagal. Coba lagi.');
      setLangkah('pratinjau');
      if (e instanceof GalatApi && e.kode === 'AKURASI_LEMAH') {
        // Ambil ulang posisi untuk percobaan berikutnya.
        ambilLokasi().then(setPosisi).catch(() => undefined);
      }
    }
  };

  return (
    <div className="panel-presensi">
      {galat && <div className="galat-umum" role="alert" style={{ maxWidth: 420 }}>{galat}</div>}
      {langkah === 'lokasi' && !galat && <div className="baris"><Ikon nama="lokasi" /> Membaca lokasi GPS…</div>}
      {posisi && <div className="redup kecil">Lokasi terbaca (akurasi ±{Math.round(posisi.akurasi)} m)</div>}
      {langkah === 'kamera' && !cadangan && (
        <>
          <div className="kamera"><video ref={video} playsInline muted /></div>
          <button className="tombol besar" onClick={jepret}><Ikon nama="kamera" /> Ambil foto</button>
        </>
      )}
      {langkah === 'kamera' && cadangan && (
        <>
          <div className="catatan" style={{ maxWidth: 420 }}>{cadangan}</div>
          <label className="tombol besar">
            <Ikon nama="kamera" /> Buka kamera HP
            <input type="file" accept="image/*" capture="user" className="sr" onChange={(e) => dariBerkas(e.target.files?.[0])} />
          </label>
        </>
      )}
      {(langkah === 'pratinjau' || langkah === 'kirim') && urlFoto && (
        <>
          <div className="kamera"><img src={urlFoto} alt="Pratinjau foto check-in" /></div>
          <div className="baris">
            <button className="tombol sekunder" disabled={langkah === 'kirim'} onClick={() => { setFoto(null); setUrlFoto(null); void bukaKamera(); }}>Ulangi foto</button>
            <button className="tombol besar" disabled={langkah === 'kirim'} onClick={kirim}>{langkah === 'kirim' ? 'Mengirim…' : 'Kirim check-in'}</button>
          </div>
        </>
      )}
      <button className="tombol hantu" onClick={onBatal}>Batal</button>
    </div>
  );
}

function labelSumber(p: PresensiRingkas): { teks: string; jenis: 'selesai' | 'disetujui' | 'proses' | 'menunggu' } {
  if (p.sumber === 'koreksi_hr') return { teks: 'Koreksi HRD', jenis: 'proses' };
  if (p.sumber === 'dinas_luar') return { teks: 'Dinas luar', jenis: 'disetujui' };
  if (!p.pulangPada) return { teks: 'Tanpa check-out', jenis: 'menunggu' };
  return { teks: 'Lengkap', jenis: 'selesai' };
}

export function Presensi() {
  const hariIni = useMuat(() => api('presensi.hariIni', {}), []);
  const [bulan, setBulan] = useState(() => new Date().toISOString().slice(0, 7));
  const riwayat = useMuat(() => api('presensi.riwayatSaya', { bulan }), [bulan]);
  const [alur, setAlur] = useState(false);
  const [selisih, setSelisih] = useState(0);
  const [, setDetak] = useState(0);

  useEffect(() => {
    if (hariIni.data) setSelisih(new Date(hariIni.data.waktuServer).getTime() - Date.now());
  }, [hariIni.data]);
  useEffect(() => {
    const t = setInterval(() => setDetak((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const checkOut = async () => {
    try {
      const posisi = await ambilLokasi();
      const p = await api('presensi.checkOut', posisi);
      toast.berhasil(`Check-out tercatat pukul ${jam(p.pulangPada)}.`);
      hariIni.muatUlang();
      riwayat.muatUlang();
    } catch (e) {
      toast.gagal(e instanceof Error ? e.message : 'Check-out gagal.');
    }
  };

  const h = hariIni.data;
  const sekarang = new Date(Date.now() + selisih);
  return (
    <>
      <JudulLayar judul="Presensi" keterangan={h ? hariTanggal(h.tanggal) : undefined} />
      <div className="tumpuk">
        <Kartu>
          <Memuat muatan={hariIni}>
            {h && (alur ? (
              <AlurCheckIn onSelesai={() => { setAlur(false); hariIni.muatUlang(); riwayat.muatUlang(); }} onBatal={() => setAlur(false)} />
            ) : (
              <div className="panel-presensi">
                {/* DSH-01: jam check-in hari ini adalah informasi pertama. */}
                <div className="redup">Waktu server (WIB)</div>
                <div className="jam-besar">{jamWIB(sekarang)}</div>
                <div className="redup">Jam kerja {h.jamMasuk}–{h.jamPulang}{!h.hariKerja ? ' · hari ini bukan hari kerja' : ''}{!h.wajibPresensi ? ' · Anda tidak wajib presensi' : ''}</div>
                {h.presensi && (
                  <div className="dua-kolom">
                    <div className="ringkas sukses"><div className="angka">{jam(h.presensi.masukPada)}</div><div className="label">Check-in{h.presensi.menitTerlambat ? ` · terlambat ${h.presensi.menitTerlambat} mnt` : ''}</div></div>
                    <div className={`ringkas ${h.presensi.pulangPada ? 'sukses' : ''}`}><div className="angka">{jam(h.presensi.pulangPada)}</div><div className="label">Check-out</div></div>
                  </div>
                )}
                {h.tombol === 'check_in' && <button className="tombol besar" onClick={() => setAlur(true)}><Ikon nama="kamera" /> Check-in</button>}
                {h.tombol === 'check_out' && <CheckOutTombol onKlik={checkOut} />}
                {h.tombol === null && <Pil jenis="selesai">Presensi hari ini lengkap</Pil>}
                <div className="redup kecil" style={{ maxWidth: 420 }}>Check-in memerlukan izin lokasi dan kamera. Foto hanya dilihat Anda, Admin HRD, dan Manager unit Anda.</div>
              </div>
            ))}
          </Memuat>
        </Kartu>

        <Kartu judul={`Riwayat ${namaBulan(bulan)}`} aksi={<input type="month" value={bulan} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setBulan(e.target.value)} className="tombol sekunder kecil" aria-label="Pilih bulan" />} rapat>
          <Memuat muatan={riwayat}>
            <Tabel
              data={riwayat.data ?? []}
              kunci={(p) => p.id}
              cari={false}
              kosong="Belum ada presensi di bulan ini."
              kolom={[
                { judul: 'Tanggal', isi: (p) => tanggalPendek(p.tanggal) },
                { judul: 'Masuk', isi: (p) => jam(p.masukPada) },
                { judul: 'Pulang', isi: (p) => jam(p.pulangPada) },
                { judul: 'Terlambat', isi: (p) => (p.menitTerlambat ? `${p.menitTerlambat} mnt` : '—') },
                { judul: 'Pulang cepat', isi: (p) => (p.menitPulangCepat ? `${p.menitPulangCepat} mnt` : '—') },
                { judul: 'Kantor', isi: (p) => p.namaKantor ?? '—' },
                { judul: 'Status', isi: (p) => { const s = labelSumber(p); return <Pil jenis={s.jenis}>{s.teks}</Pil>; } },
              ]}
            />
          </Memuat>
        </Kartu>
      </div>
    </>
  );
}

function CheckOutTombol({ onKlik }: { onKlik: () => Promise<void> }) {
  const [proses, setProses] = useState(false);
  return (
    <button className="tombol besar" disabled={proses} onClick={async () => { setProses(true); try { await onKlik(); } finally { setProses(false); } }}>
      <Ikon nama="lokasi" /> {proses ? 'Membaca lokasi…' : 'Check-out'}
    </button>
  );
}
