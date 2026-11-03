#!/usr/bin/env node
// Monta a pasta www/ que vai dentro do APK, com os mesmos arquivos que o GitHub Pages publica:
//
//   node tools/build-app.mjs [versionCode] [versionName]
//
// Depois: npx cap sync android. Grava www/app-version.json, que o app lê para saber a própria versão
// (js/appPromo.js compara com a última Release e avisa quando há APK novo).

import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = 'www';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const versionCode = Number(process.argv[2] || 1);
const versionName = process.argv[3] || `${pkg.version}.${versionCode}`;
if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error(`versionCode inválido: ${process.argv[2]}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
// Mesma lista do pages.yml (+ manifesto e service worker, se existirem)
for (const f of ['index.html', '404.html', 'assets', 'css', 'js', 'manifest.webmanifest', 'sw.js']) {
  if (existsSync(f)) cpSync(f, `${OUT}/${f}`, { recursive: true });
}
const run = (script, ...args) => execFileSync(process.execPath, [script, OUT, ...args], { stdio: 'inherit' });
// shortcut: optimize-build chama `npx` sem shell, o que falha no Windows; lá a www/ sai sem empacotar (funciona igual)
if (process.platform !== 'win32') run('tools/optimize-build.mjs');
run('tools/stamp-version.mjs', `app${versionCode}`);
// push: js/push.js só liga os avisos se o build tem Firebase; sem ele, register() derrubaria o app
const push = existsSync('android/app/google-services.json');
writeFileSync(`${OUT}/app-version.json`, JSON.stringify({ version: versionName, versionCode, push }) + '\n');
console.log(`www/ pronta: v${versionName} (versionCode ${versionCode})${push ? '' : ', sem avisos (falta android/app/google-services.json)'}`);
