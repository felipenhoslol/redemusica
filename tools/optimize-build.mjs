#!/usr/bin/env node
// Otimiza a cópia publicada do site (rode antes do stamp-version.mjs):
//
//   node tools/optimize-build.mjs <pasta>
//
// - CSS: junta os <link> de css/ do index.html, na mesma ordem, num único css/app.css minificado.
// - JS: empacota js/app.js com esbuild (minificado, com code splitting para os import() dinâmicos),
//   trocando ~30 módulos carregados em cascata por poucos arquivos.
// - index.html: <link rel="modulepreload"> para os pedaços que o app.js importa de cara, para o
//   navegador baixar tudo em paralelo.
// Os arquivos são reescritos no lugar, então NÃO rode na pasta do repositório.

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ESBUILD = 'esbuild@0.24.0';
const dirArg = process.argv[2];
if (!dirArg) {
  console.error('uso: node tools/optimize-build.mjs <pasta>');
  process.exit(1);
}
const root = resolve(dirArg);
if (existsSync(join(root, '.git'))) {
  console.error(`recusado: ${root} é o repositório; otimize uma cópia (ex.: _site).`);
  process.exit(1);
}
const esbuild = (args) => execFileSync('npx', ['--yes', ESBUILD, ...args], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });

const indexPath = join(root, 'index.html');
let html = readFileSync(indexPath, 'utf8');

// ─── CSS ────────────────────────────────────────────────────────────────────
const linkRe = /^[ \t]*<link rel="stylesheet" href="(css\/[\w.-]+\.css)">[ \t]*\r?\n/gm;
const cssFiles = [...html.matchAll(linkRe)].map(m => m[1]);
if (!cssFiles.length) throw new Error('nenhum CSS encontrado no index.html');
writeFileSync(join(root, 'css/app.src.css'), cssFiles.map(f => `/* ${f} */\n${readFileSync(join(root, f), 'utf8')}`).join('\n'));
esbuild(['css/app.src.css', '--minify', '--outfile=css/app.css', '--log-level=warning']);
rmSync(join(root, 'css/app.src.css'));
cssFiles.forEach(f => rmSync(join(root, f))); // only the bundle is served
let first = true;
html = html.replace(linkRe, () => {
  if (!first) return '';
  first = false;
  return '  <link rel="stylesheet" href="css/app.css">\n';
});
console.log(`CSS: ${cssFiles.length} arquivos → css/app.css`);

// ─── JS ─────────────────────────────────────────────────────────────────────
const out = join(root, 'js-build');
rmSync(out, { recursive: true, force: true });
esbuild(['js/app.js', '--bundle', '--format=esm', '--splitting', '--minify', '--target=es2020',
  '--chunk-names=chunk-[hash]', `--outdir=js-build`, '--log-level=warning']);
rmSync(join(root, 'js'), { recursive: true, force: true });
renameSync(out, join(root, 'js'));
const outputs = readdirSync(join(root, 'js')).filter(n => n.endsWith('.js'));
console.log(`JS: ${outputs.length} arquivos (${outputs.join(', ')})`);

// Chunks that app.js imports statically: preload them alongside app.js
const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
const staticChunks = [...appSrc.matchAll(/(?:\bfrom|\bimport)\s*["']\.\/(chunk-[\w-]+\.js)["']/g)].map(m => m[1]);
const preload = ['app.js', ...new Set(staticChunks)].map(f => `  <link rel="modulepreload" href="js/${f}">\n`).join('');
html = html.replace('</head>', `${preload}</head>`);

writeFileSync(indexPath, html);
console.log('index.html: CSS único e modulepreload adicionados');
