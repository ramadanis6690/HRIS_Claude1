// Beranda per peran (SRS DSH-01, DSH-07, DSH-08, DSH-15). Bagian yang bukan hak
// pengguna tidak dikirim server sama sekali.
import { api } from '../api.js';
import { Progres } from '../komponen/Chart.js';
import { JudulLayar, Kartu, Memuat, Pil, Ringkas, useMuat } from '../komponen/dasar.js';
import { Ikon } from '../komponen/Ikon.js';
import { hariTanggal, jam, waktuLengkap } from '../format.js';
import { MENU } from '../menu.js';
import { navigasi } from '../rute.js';
import { useSesi } from '../Sesi.js';

const LABEL_STATUS: Record<string, string> = { hadir: 'Hadir', terlambat: 'Terlambat', mangkir: 'Tidak hadir', dinas: 'Dinas', libur: 'Libur', belum: 'Belum' };

export function Beranda() {
  const { sesi } = useSesi();
  const b = useMuat(() => api('beranda.ringkasan', {}), []);
  const d = b.data;
  const jalurMenu = (k: string) => MENU.find((m) => m.kunci === k)?.jalur ?? '/';

  return (
    <>
      <JudulLayar judul={`Selamat datang, ${sesi?.nama.split(' ')[0] ?? ''}`} keterangan={d ? hariTanggal(d.presensiHariIni.tanggal) : undefined} />
      <Memuat muatan={b}>
        {d && (
          <div className="tumpuk">
            {/* DSH-01: jam check-in hari ini paling menonjol. */}
            <Kartu judul="Presensi hari ini" aksi={<button className="tombol kecil" onClick={() => navigasi('/presensi')}><Ikon nama="jam" ukuran={16} /> Buka Presensi</button>}>
              <div className="kisi">
                <Ringkas nada={d.presensiHariIni.presensi ? (d.presensiHariIni.presensi.menitTerlambat ? 'peringatan' : 'sukses') : 'bahaya'}
                  angka={d.presensiHariIni.presensi ? jam(d.presensiHariIni.presensi.masukPada) : 'Belum'}
                  label={d.presensiHariIni.presensi ? `Check-in${d.presensiHariIni.presensi.menitTerlambat ? ` · terlambat ${d.presensiHariIni.presensi.menitTerlambat} menit` : ''}` : 'Anda belum check-in hari ini'}
                  onClick={() => navigasi('/presensi')} />
                <Ringkas angka={d.presensiHariIni.presensi?.pulangPada ? jam(d.presensiHariIni.presensi.pulangPada) : '—'} label="Check-out" nada={d.presensiHariIni.presensi?.pulangPada ? 'sukses' : undefined} />
                <Ringkas angka={`${d.presensiHariIni.jamMasuk}–${d.presensiHariIni.jamPulang}`} label={d.presensiHariIni.hariKerja ? 'Jam kerja hari ini' : 'Hari ini bukan hari kerja'} />
              </div>
            </Kartu>

            <Kartu judul="Kehadiran saya bulan ini">
              {/* DSH-08: tanpa nominal potongan. */}
              <div className="kisi" style={{ marginBottom: 12 }}>
                <Ringkas angka={d.ringkasBulanIni.hadir} label="Hari hadir" nada="sukses" />
                <Ringkas angka={d.ringkasBulanIni.terlambat} label={`Hari terlambat (${d.ringkasBulanIni.menitTerlambat} menit)`} nada={d.ringkasBulanIni.terlambat ? 'peringatan' : undefined} />
                <Ringkas angka={d.ringkasBulanIni.tanpaCheckOut} label="Tanpa check-out" nada={d.ringkasBulanIni.tanpaCheckOut ? 'proses' : undefined} />
              </div>
              <div className="kalender-strip" aria-label="Kehadiran per hari">
                {d.kehadiranBulanIni.map((h) => (
                  <div key={h.tanggal} className={`hari ${h.status}`} title={`${h.tanggal}: ${LABEL_STATUS[h.status]}`}>{Number(h.tanggal.slice(8))}</div>
                ))}
              </div>
              <div className="legenda" style={{ marginTop: 8 }}>
                <span className="l-hadir">Hadir</span><span className="l-terlambat">Terlambat</span><span className="l-mangkir">Tidak hadir</span><span className="l-dinas">Dinas</span><span>Libur</span>
              </div>
            </Kartu>

            {d.tim && (
              <Kartu judul="Kehadiran tim hari ini" aksi={<button className="tombol sekunder kecil" onClick={() => navigasi('/rekap-kehadiran')}>Rekap Kehadiran</button>}>
                <div className="tumpuk">
                  <Progres nilai={d.tim.hadir} target={d.tim.total} label="Sudah check-in" />
                  <div className="tabel-wadah">
                    <table className="tabel">
                      <tbody>
                        {d.tim.nama.map((n) => (
                          <tr key={n.nama}><td>{n.nama}</td><td className="kanan"><Pil jenis={n.keadaan === 'Belum check-in' ? 'menunggu' : n.keadaan === 'Lengkap' ? 'selesai' : 'disetujui'}>{n.keadaan}</Pil></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Kartu>
            )}

            {d.hrd && (
              <div className="kisi-2">
                <Kartu judul="Perlu tindakan Anda">
                  {d.hrd.tindakan.length === 0 ? (
                    <div className="kosong">Tidak ada yang perlu ditindaklanjuti hari ini.</div>
                  ) : (
                    <div className="tumpuk">
                      {d.hrd.tindakan.map((t, i) => (
                        <button key={i} className="ringkas" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)' }}
                          onClick={() => navigasi(t.pegawaiId ? `/pegawai/${t.pegawaiId}` : jalurMenu(t.menu))}>
                          <div style={{ fontWeight: 600 }}>{t.judul}</div>
                          <div className="redup kecil">{t.rincian}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </Kartu>
                <Kartu judul="Kehadiran semua pegawai hari ini">
                  <div className="tumpuk">
                    <Progres nilai={d.hrd.kehadiranHariIni.hadir} target={d.hrd.kehadiranHariIni.total - d.hrd.kehadiranHariIni.tidakWajib} label="Wajib presensi yang sudah check-in" />
                    <div className="kisi">
                      <Ringkas angka={d.hrd.kehadiranHariIni.hadir} label="Hadir" nada="sukses" onClick={() => navigasi('/rekap-kehadiran')} />
                      <Ringkas angka={d.hrd.kehadiranHariIni.belum} label="Belum check-in" nada={d.hrd.kehadiranHariIni.belum ? 'peringatan' : undefined} onClick={() => navigasi('/rekap-kehadiran')} />
                    </div>
                  </div>
                </Kartu>
              </div>
            )}

            {d.auditor && (
              <Kartu judul="Audit" aksi={<button className="tombol sekunder kecil" onClick={() => navigasi('/audit-log')}>Buka Audit Log</button>}>
                <div className="kisi">
                  <Ringkas nada={d.auditor.rantai.utuh ? 'sukses' : 'bahaya'} angka={d.auditor.rantai.utuh ? 'Utuh' : 'RUSAK'} label={d.auditor.rantai.pesan} />
                  <Ringkas angka={d.auditor.perubahanSensitif7Hari} label="Perubahan data sensitif (7 hari)" />
                  <Ringkas angka={d.auditor.resetSandi30Hari} label="Reset kata sandi (30 hari)" />
                  <Ringkas angka={d.auditor.akunTerkunci} label="Akun terkunci saat ini" nada={d.auditor.akunTerkunci ? 'peringatan' : undefined} />
                </div>
              </Kartu>
            )}

            {d.superAdmin && (
              <div className="kisi-2">
                <Kartu judul="Peringatan pemisahan tugas">
                  {/* USR-06a: nama, kombinasi, dan alasan — bukan sekadar ikon. */}
                  {d.superAdmin.konflikPeran.length === 0 ? (
                    <div className="kosong">Tidak ada pemegang kombinasi peran yang bertentangan.</div>
                  ) : (
                    <div className="tumpuk">
                      {d.superAdmin.konflikPeran.map((k) => (
                        <div key={k.pegawaiId + k.kombinasi} className="catatan">
                          <strong>{k.nama}</strong> — {k.kombinasi}
                          <div className="kecil">{k.akibat}</div>
                          <div className="kecil">Alasan: {k.alasan ?? 'tidak tercatat'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Kartu>
                <Kartu judul="Pekerjaan terjadwal" aksi={<button className="tombol sekunder kecil" onClick={() => navigasi('/status-sistem')}>Status Sistem</button>}>
                  <div className="tabel-wadah">
                    <table className="tabel">
                      <tbody>
                        {d.superAdmin.pekerjaan.map((p) => (
                          <tr key={p.pekerjaan}>
                            <td className="mono">{p.pekerjaan}</td>
                            <td>{p.terakhir ? waktuLengkap(p.terakhir) : 'Belum pernah'}</td>
                            <td className="kanan"><Pil jenis={p.terlambat ? 'ditolak' : 'selesai'}>{p.terlambat ? 'Periksa' : 'Berhasil'}</Pil></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Kartu>
              </div>
            )}
          </div>
        )}
      </Memuat>
    </>
  );
}
