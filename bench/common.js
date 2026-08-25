import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const benchDir = path.dirname(fileURLToPath(import.meta.url));
export const repoDir = path.dirname(benchDir);
export const fixturesDir = path.join(benchDir, 'fixtures');

// The library under test. Point PNG_LIB at another checkout's build to
// measure a baseline with the same harness.
export function loadPNG() {
  const libPath = process.env.PNG_LIB
    ? path.resolve(process.env.PNG_LIB)
    : path.join(repoDir, 'lib/png-js.cjs');
  return { PNG: require(libPath), libPath };
}

export function benchFixtures() {
  const generated = fs.existsSync(fixturesDir)
    ? fs
        .readdirSync(fixturesDir)
        .filter(f => f.endsWith('.png'))
        .map(f => path.join(fixturesDir, f))
    : [];
  if (generated.length === 0) {
    console.error(
      'No generated fixtures found. Run `yarn bench:fixtures` first.'
    );
  }
  const small = [
    'interlaced-rgb-alpha-8bit.png',
    'rgb-alpha-8bit.png',
    'transparent-white-palette-8bit.png',
  ].map(f => path.join(repoDir, 'test/images', f));
  return [...generated, ...small].map(file => ({
    name: path.basename(file),
    buffer: fs.readFileSync(file),
  }));
}

export function decodePixels(png) {
  return new Promise(resolve => png.decodePixels(resolve));
}

export const mb = bytes => (bytes / 1024 / 1024).toFixed(2) + ' MB';
export const ms = v => v.toFixed(2) + ' ms';

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function printTable(rows) {
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c =>
    Math.max(c.length, ...rows.map(r => String(r[c]).length))
  );
  const line = vals =>
    vals.map((v, i) => String(v).padEnd(widths[i])).join('  ');
  console.log(line(cols));
  console.log(line(widths.map(w => '-'.repeat(w))));
  for (const row of rows) console.log(line(cols.map(c => row[c])));
}
