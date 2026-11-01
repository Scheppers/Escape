import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const out = resolve(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['index.html', 'game.js', 'style.css', 'config.js', 'online.js', 'vragen.json', '_redirects']) {
  await copyFile(resolve(root, file), resolve(out, file));
}
await cp(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
console.log('Built static site to dist/. Serverless functions stay in netlify/functions/.');
