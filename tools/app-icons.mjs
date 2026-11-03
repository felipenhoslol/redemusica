#!/usr/bin/env node
// Gera o ícone e a abertura do app Android a partir do gato de assets/favicon.svg:
//
//   node tools/app-icons.mjs && npx capacitor-assets generate --android --assetPath resources
//
// Só precisa rodar de novo se o favicon mudar; os PNGs gerados em android/ ficam no repositório.

import { readFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const BG = '#0b0a10';
const svg = readFileSync('assets/favicon.svg', 'utf8');
// Só o gato: sem o quadrado escuro do favicon (o fundo do ícone adaptável é uma camada à parte)
const cat = Buffer.from(svg.replace(/<rect width="64" height="64"[^>]*\/>/, ''));
if (cat.length === svg.length) throw new Error('fundo do favicon não encontrado; confira o regex');

const catPng = (size) => sharp(cat, { density: 72 * size / 64 }).resize(size, size).png().toBuffer();
const canvas = (size, background) => sharp({ create: { width: size, height: size, channels: 4, background } });

mkdirSync('resources', { recursive: true });
// Ícone adaptável: o capacitor-assets aplica inset de 16,7% (1024 = 72dp); a área segura é o círculo de 66dp, então o gato ocupa ~86%
const fg = await catPng(880);
await canvas(1024, { r: 0, g: 0, b: 0, alpha: 0 }).composite([{ input: fg, gravity: 'center' }]).png().toFile('resources/icon-foreground.png');
await canvas(1024, BG).png().toFile('resources/icon-background.png');
// Ícone antigo (Android < 8): o gato maior sobre o fundo escuro
await canvas(1024, BG).composite([{ input: await catPng(820), gravity: 'center' }]).png().toFile('resources/icon-only.png');
// Abertura: gato pequeno no centro, fundo escuro
const splash = await canvas(2732, BG).composite([{ input: await catPng(560), gravity: 'center' }]).png().toBuffer();
await sharp(splash).toFile('resources/splash.png');
await sharp(splash).toFile('resources/splash-dark.png');
console.log('resources/: icon-foreground, icon-background, icon-only, splash, splash-dark');
