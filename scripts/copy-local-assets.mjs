import { access, copyFile, mkdir } from 'node:fs/promises';

const files = [
  ['assets/9rdwe.png', 'dist/assets/9rdwe.png'],
  ...['wp', 'wn', 'wb', 'wr', 'wq', 'wk', 'bp', 'bn', 'bb', 'br', 'bq', 'bk']
    .map((piece) => [`assets/ejgfv/${piece}.png`, `dist/assets/ejgfv/${piece}.png`]),
];

let copied = 0;
for (const [source, destination] of files) {
  try {
    await access(source);
    await mkdir(new URL('.', new URL(`../${destination}`, import.meta.url)), { recursive: true });
    await copyFile(source, destination);
    copied += 1;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

if (copied === files.length) console.log('Copied the local Green + Neo board theme into dist/assets.');
else console.log(`Copied ${copied}/${files.length} local theme images. Missing files use the built-in board and piece fallback.`);
