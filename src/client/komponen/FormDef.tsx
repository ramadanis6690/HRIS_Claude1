// Formulir yang dibangun dari definisi kolom bersama (src/bersama/pegawai.ts),
// sehingga setiap field di layar punya kolom di basis data (SRS EMP-19).
import type { DefKolom } from '../../bersama/pegawai.js';
import { LABEL_STATUS_PEGAWAI, type MasterData, type StatusPegawai } from '../../bersama/aksi.js';
import { Isian, Pilihan, Saklar } from './dasar.js';

export type NilaiForm = Record<string, string | boolean | number | null>;

export function FieldDef({
  def, nilai, ubah, salah, master,
}: {
  def: DefKolom;
  nilai: NilaiForm;
  ubah: (kolom: string, v: string | boolean | null) => void;
  salah?: string | null;
  master?: MasterData | null;
}) {
  const v = nilai[def.kolom];
  const teks = v === null || v === undefined ? '' : String(v);
  switch (def.jenis) {
    case 'ya_tidak':
      return <Saklar label={def.label} checked={v === true} onChange={(b) => ubah(def.kolom, b)} />;
    case 'tanggal':
      return <Isian label={def.label} jenis="date" value={teks} onChange={(s) => ubah(def.kolom, s || null)} wajib={def.wajib} salah={salah} />;
    case 'angka':
      return <Isian label={def.label} jenis="number" value={teks} onChange={(s) => ubah(def.kolom, s || null)} wajib={def.wajib} salah={salah} mode="numeric" />;
    case 'pilihan':
      return (
        <Pilihan
          label={def.label} value={teks} onChange={(s) => ubah(def.kolom, s || null)} wajib={def.wajib} salah={salah}
          opsi={(def.opsi ?? []).map((o) => ({ nilai: o, label: def.kolom === 'status_pegawai' ? LABEL_STATUS_PEGAWAI[o as StatusPegawai] : o === 'L' ? 'Laki-laki' : o === 'P' ? 'Perempuan' : o }))}
        />
      );
    case 'unit':
      return <Pilihan label={def.label} value={teks} onChange={(s) => ubah(def.kolom, s || null)} salah={salah} opsi={(master?.unit ?? []).filter((u) => u.aktif || u.id === teks).map((u) => ({ nilai: u.id, label: `${u.kode} — ${u.nama}` }))} kosong="Tidak ada unit" />;
    case 'jabatan':
      return <Pilihan label={def.label} value={teks} onChange={(s) => ubah(def.kolom, s || null)} salah={salah} opsi={(master?.jabatan ?? []).filter((j) => j.aktif || j.id === teks).map((j) => ({ nilai: j.id, label: j.nama }))} kosong="Belum diisi" />;
    case 'titik_kantor':
      return <Pilihan label={def.label} value={teks} onChange={(s) => ubah(def.kolom, s || null)} salah={salah} opsi={(master?.titikKantor ?? []).filter((t) => t.aktif || t.id === teks).map((t) => ({ nilai: t.id, label: t.nama }))} kosong="Bebas (titik aktif mana pun)" />;
    default:
      return (
        <Isian
          label={def.label} value={teks} onChange={(s) => ubah(def.kolom, s)} wajib={def.wajib} salah={salah} maks={def.maks}
          jenis={def.kolom === 'email' ? 'email' : def.kolom.includes('hp') ? 'tel' : 'text'}
          mode={['nik', 'bank_rekening', 'rek_ahli_waris'].includes(def.kolom) ? 'numeric' : undefined}
          baris={(def.maks ?? 0) >= 300 ? 2 : undefined}
        />
      );
  }
}

/** Nilai formulir → data kirim: teks kosong jadi null. */
export function keData(nilai: NilaiForm): Record<string, unknown> {
  return Object.fromEntries(Object.entries(nilai).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v]));
}
