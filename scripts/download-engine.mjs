import { mkdir, writeFile } from 'node:fs/promises';

const version = '19.0.1';
const base = `https://unpkg.com/stockfish@${version}/bin/`;
const files = [
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
];
const destination = new URL('../public/engine/', import.meta.url);
await mkdir(destination, { recursive: true });

for (const file of files) {
  const response = await fetch(base + file);
  if (!response.ok) throw new Error(`Could not download ${file}: HTTP ${response.status}`);
  await writeFile(new URL(file, destination), new Uint8Array(await response.arrayBuffer()));
  console.log(`Downloaded ${file}`);
}

const licenseResponse = await fetch('https://raw.githubusercontent.com/nmrugg/stockfish.js/master/Copying.txt');
if (licenseResponse.ok) {
  await writeFile(new URL('Copying.txt', destination), await licenseResponse.text());
  console.log('Downloaded Stockfish license');
} else {
  console.warn('Download the GPL-3.0 license from https://github.com/nmrugg/stockfish.js');
}

