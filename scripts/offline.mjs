// Copies the single-file build to jogar/FORTISSIMO.html (play offline by opening the file).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
mkdirSync('jogar', { recursive: true });
copyFileSync('dist/index.html', 'jogar/FORTISSIMO.html');
console.log(`jogar/FORTISSIMO.html ${(statSync('jogar/FORTISSIMO.html').size / 1e6).toFixed(2)} MB`);
