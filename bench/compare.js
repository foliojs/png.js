// Compares two JSON result files produced by cpu.js or memory.js --json.
// Usage: node bench/compare.js before.json after.json
import fs from 'fs';
import { printTable } from './common.js';

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error('Usage: node bench/compare.js <before.json> <after.json>');
  process.exit(1);
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

const numericKeys = results =>
  Object.keys(results[0]).filter(k => typeof results[0][k] === 'number');

const rows = [];
for (const b of before.results) {
  const a = after.results.find(r => r.fixture === b.fixture);
  if (!a) continue;
  for (const key of numericKeys(before.results)) {
    if (b[key] === 0) continue;
    const delta = ((a[key] - b[key]) / b[key]) * 100;
    rows.push({
      fixture: b.fixture,
      metric: key,
      before: b[key].toFixed(2),
      after: a[key].toFixed(2),
      change: (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%',
    });
  }
}

console.log(`before: ${before.libPath}\nafter:  ${after.libPath}\n`);
printTable(rows);
