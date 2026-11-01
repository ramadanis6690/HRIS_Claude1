// Pengembangan: server (tsx watch, :3000) dan tampilan (Vite, :5173) bersamaan.
// Vite meneruskan /api ke server (vite.config.ts).
import { spawn } from 'node:child_process';

const proses = [
  spawn('npx', ['tsx', 'watch', 'src/server/main.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const henti = () => {
  for (const p of proses) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', henti);
process.on('SIGTERM', henti);
for (const p of proses) p.on('exit', (kode) => kode && kode !== 0 && henti());
