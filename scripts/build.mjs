import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await mkdir(dist, { recursive: true });
for (const name of ['index.html', 'privacy.html', 'terms.html', '404.html', 'src']) {
  await cp(path.join(root, name), path.join(dist, name), { recursive: true });
}
const domain = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);
if (domain) {
  const origin = new URL(domain).origin;
  for (const name of ['index.html', 'privacy.html', 'terms.html', '404.html']) {
    const file = path.join(dist, name);
    const html = (await readFile(file, 'utf8')).replace('content="./social-card.png"', `content="${origin}/social-card.png"`);
    await writeFile(file, html);
  }
}
await cp(path.join(root, 'public'), dist, { recursive: true });
await mkdir(path.join(dist, 'fonts'), { recursive: true });
for (const weight of [400, 500, 600, 700]) {
  const file = `geist-latin-${weight}-normal.woff2`;
  await cp(path.join(root, 'node_modules/@fontsource/geist/files', file), path.join(dist, 'fonts', file));
}
await cp(path.join(root, 'node_modules/@fontsource/geist/LICENSE'), path.join(dist, 'fonts/LICENSE.txt'));
await mkdir(path.join(dist, 'icons'), { recursive: true });
for (const name of ['arrow-up-right', 'arrow-right', 'arrow-down', 'github-logo', 'check', 'copy', 'brain', 'desktop', 'eye', 'code', 'cursor', 'terminal-window', 'shield-check', 'arrow-elbow-down-right', 'globe', 'x', 'list', 'plus', 'warning-circle', 'check-circle', 'lightning', 'file-text']) {
  await cp(path.join(root, 'node_modules/@phosphor-icons/core/assets/regular', `${name}.svg`), path.join(dist, 'icons', `${name}.svg`));
}
await cp(path.join(root, 'node_modules/@phosphor-icons/core/LICENSE'), path.join(dist, 'icons/LICENSE.txt'));
await writeFile(path.join(dist, '.build-info'), 'Static site built with Node.js. No application server required.\n');
console.log('Built static site in dist/ (4 pages, local fonts and icons).');
