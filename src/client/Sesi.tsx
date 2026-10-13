// Sesi pengguna di browser: hanya informasi tampilan. Token tidak pernah ada di
// sini — ia cookie HttpOnly yang dipasang server (AUTH-13).
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { InfoSesi, KunciMenu } from '../bersama/aksi.js';
import { api, aturSaatSesiBerakhir } from './api.js';

interface NilaiSesi {
  sesi: InfoSesi | null;
  siap: boolean;
  aturSesi: (s: InfoSesi | null) => void;
  muatUlang: () => Promise<void>;
  boleh: (m: KunciMenu) => boolean;
}

const KonteksSesi = createContext<NilaiSesi | null>(null);

export function PenyediaSesi({ children }: { children: ReactNode }) {
  const [sesi, setSesi] = useState<InfoSesi | null>(null);
  const [siap, setSiap] = useState(false);
  const muatUlang = useCallback(async () => {
    try {
      setSesi(await api('auth.saya', {}));
    } catch {
      setSesi(null);
    } finally {
      setSiap(true);
    }
  }, []);
  useEffect(() => {
    void muatUlang();
    aturSaatSesiBerakhir((g) => {
      if (g.kode === 'TIDAK_SAH') setSesi(null);
      else void muatUlang();
    });
  }, [muatUlang]);
  const boleh = useCallback((m: KunciMenu) => sesi?.menu.includes(m) ?? false, [sesi]);
  return <KonteksSesi value={{ sesi, siap, aturSesi: setSesi, muatUlang, boleh }}>{children}</KonteksSesi>;
}

export function useSesi(): NilaiSesi {
  const n = use(KonteksSesi);
  if (!n) throw new Error('useSesi di luar PenyediaSesi');
  return n;
}

export const inisial = (nama: string) =>
  nama.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('');
