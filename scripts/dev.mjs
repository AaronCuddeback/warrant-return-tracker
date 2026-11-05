// Dev loop: builds main/preload, starts the Vite dev server, then launches Electron against it.
import { spawn, execSync } from 'node:child_process';
import { createServer } from 'vite';

execSync('node scripts/build-main.mjs', { stdio: 'inherit' });
const server = await createServer({ configFile: 'vite.config.mts' });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
const electron = (await import('electron')).default;
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, WRT_DEV_URL: url } });
child.on('exit', async () => { await server.close(); process.exit(0); });
