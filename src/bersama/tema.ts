// Token warna tema DPJM (design_final.md §10.2) — satu sumber untuk CSS dan chart.
// Tidak ada warna yang ditulis langsung di komponen (SRS UI-06).

export type Token =
  | 'canvas' | 'bg' | 'surface' | 'ink' | 'ink-muted' | 'line' | 'line-strong' | 'topbar' | 'topbar-ink'
  | 'accent' | 'accent-ink' | 'danger' | 'danger-tint' | 'info' | 'info-tint' | 'progress' | 'progress-tint'
  | 'warning' | 'warning-tint' | 'success' | 'success-tint' | 'neutral-tint' | 'c1' | 'c2' | 'track'
  | 'sidebar' | 'sidebar-ink' | 'sidebar-aktif';

export const TERANG: Record<Token, string> = {
  canvas: '#F2F3F3', bg: '#FFFFFF', surface: '#F7F7F7', ink: '#171717', 'ink-muted': '#5C5C5C',
  line: '#E4E4E4', 'line-strong': '#8A8A8A', topbar: '#0F3D2E', 'topbar-ink': '#FFFFFF',
  accent: '#0F3D2E', 'accent-ink': '#FFFFFF',
  danger: '#B3261E', 'danger-tint': '#FBE9E7', info: '#1F5F99', 'info-tint': '#E8F0F8',
  progress: '#A4480F', 'progress-tint': '#FBEBDD', warning: '#8A5A00', 'warning-tint': '#FBF1DE',
  success: '#2E7D4F', 'success-tint': '#E6F2EA', 'neutral-tint': '#F2F2F2',
  c1: '#2E9B74', c2: '#B5730A', track: '#E4E4E4',
  sidebar: '#0F3D2E', 'sidebar-ink': '#DCE8E3', 'sidebar-aktif': '#1E5A45',
};

export const GELAP: Record<Token, string> = {
  ...TERANG,
  canvas: '#0E0E0E', bg: '#121212', surface: '#1C1C1C', ink: '#EDEDED', 'ink-muted': '#A3A3A3',
  line: '#2C2C2C', 'line-strong': '#6B6B6B', topbar: '#0B1F18', accent: '#4DA98A', 'accent-ink': '#0B1F18',
  danger: '#F2857C', 'danger-tint': '#3A1715', info: '#7FB2E5', 'info-tint': '#15263A',
  progress: '#F0A36B', 'progress-tint': '#3A2210', warning: '#E8B75A', 'warning-tint': '#33270E',
  success: '#6FC495', 'success-tint': '#12291C', 'neutral-tint': '#222222', track: '#2C2C2C',
  sidebar: '#0B1F18', 'sidebar-ink': '#C9D8D2', 'sidebar-aktif': '#18402F',
};

export function cssTema(): string {
  const blok = (t: Record<Token, string>) => Object.entries(t).map(([k, v]) => `--${k}:${v};`).join('');
  return `:root{${blok(TERANG)}}:root[data-theme="dark"]{${blok(GELAP)}}`;
}
