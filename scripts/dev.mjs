// Development: API server with reload (port 8080) + Vite dev server with proxy (port 5173).
import { spawn } from 'node:child_process';

const procs = [
  spawn('npx', ['tsx', 'watch', '--conditions=development', 'apps/server/src/main.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'development' } }),
  spawn('npx', ['vite', '--port', '5173'], { stdio: 'inherit', cwd: 'apps/web' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) { stop(); process.exit(code); } });
