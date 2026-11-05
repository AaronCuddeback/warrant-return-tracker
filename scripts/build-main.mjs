// Bundles the Electron main + preload processes with esbuild.
// Everything (sql.js, docxtemplater, nodemailer...) is bundled, so the shipped app has
// no node_modules folder and no native modules - nothing for IT security tools to compile or flag.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build');
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

await build({ ...common, entryPoints: [join(root, 'src/main/main.ts')], outfile: join(out, 'main.js') });
await build({ ...common, entryPoints: [join(root, 'src/preload/preload.ts')], outfile: join(out, 'preload.js') });

// sql.js WebAssembly binary
copyFileSync(join(root, 'node_modules/sql.js/dist/sql-wasm.wasm'), join(out, 'sql-wasm.wasm'));

// Built-in templates + icons
for (const dir of ['templates', 'icons']) {
  const src = join(root, 'resources', dir);
  if (existsSync(src)) cpSync(src, join(out, dir), { recursive: true });
}
// pdf.js font / cmap assets for the in-app PDF viewer (served from the renderer "public" folder)
const pub = join(root, 'src', 'renderer', 'public', 'pdfjs');
for (const d of ['standard_fonts', 'cmaps', 'wasm']) {
  const src = join(root, 'node_modules', 'pdfjs-dist', d);
  if (existsSync(src)) cpSync(src, join(pub, d), { recursive: true });
}
console.log('main/preload built');
