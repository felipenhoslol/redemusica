#!/usr/bin/env node
// Carimba uma versão nas URLs de CSS/JS para o navegador nunca misturar
// módulos de deploys diferentes (o GitHub Pages guarda cache por ~10 min).
//
//   node tools/stamp-version.mjs <pasta> [versão]
//
// - <pasta>: cópia do site a ser publicada (ex.: _site). Os arquivos são
//   reescritos no lugar, então NÃO rode na pasta do repositório.
// - [versão]: padrão = hash curto do commit atual (git rev-parse --short HEAD).
//
// Reescreve:
//   index.html  href="css/x.css"  e  src="js/x.js"   -> ...?v=<versão>
//   js/*.js     from './x.js' · import './x.js' · import('./x.js')
// Rodar de novo só troca a versão (é idempotente).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execSync } from 'node:child_process';

const [dirArg, versionArg] = process.argv.slice(2);
if (!dirArg) {
  console.error('uso: node tools/stamp-version.mjs <pasta> [versão]');
  process.exit(1);
}
const root = resolve(dirArg);
if (existsSync(join(root, '.git'))) {
  console.error(`recusado: ${root} é o repositório; carimbe uma cópia (ex.: _site).`);
  process.exit(1);
}

const version = versionArg || execSync('git rev-parse --short HEAD').toString().trim();
if (!/^[\w.-]+$/.test(version)) {
  console.error(`versão inválida: ${version}`);
  process.exit(1);
}
const q = `?v=${version}`;

// Caminho local (sem esquema, sem //) terminado em .js/.css, com ?v= opcional já existente.
const stamp = (path) => path.replace(/\?v=[\w.-]*$/, '') + q;

let total = 0;
function rewrite(file, patterns) {
  const before = readFileSync(file, 'utf8');
  let count = 0;
  let after = before;
  for (const re of patterns) {
    after = after.replace(re, (_m, pre, path, post) => {
      count++;
      return pre + stamp(path) + post;
    });
  }
  if (after !== before) writeFileSync(file, after);
  total += count;
  console.log(`${String(count).padStart(3)}  ${file.slice(root.length + 1)}`);
}

rewrite(join(root, 'index.html'), [
  /(\b(?:href|src)=["'])((?:css|js)\/[\w./-]+\.(?:css|js)(?:\?v=[\w.-]*)?)(["'])/g,
]);

const rel = String.raw`(\.\.?\/[\w./-]+\.js(?:\?v=[\w.-]*)?)`;
const jsPatterns = [
  new RegExp(String.raw`(\bfrom\s*["'])${rel}(["'])`, 'g'),        // import/export ... from './x.js'
  new RegExp(String.raw`(\bimport\s*["'])${rel}(["'])`, 'g'),      // import './x.js'
  new RegExp(String.raw`(\bimport\s*\(\s*["'])${rel}(["'])`, 'g'), // import('./x.js')
];
const jsDir = join(root, 'js');
for (const name of readdirSync(jsDir).filter(n => n.endsWith('.js')).sort()) {
  rewrite(join(jsDir, name), jsPatterns);
}

console.log(`versão ${version}: ${total} referências carimbadas em ${root}`);
