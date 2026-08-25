// CPU benchmark: times constructor parse and decodePixels per fixture.
// Usage: node bench/cpu.js [--json out.json]
// Set PNG_LIB=<path to png-js.cjs> to benchmark a different build.
import fs from 'fs';
import {
  loadPNG,
  benchFixtures,
  decodePixels,
  median,
  ms,
  printTable,
} from './common.js';

const { PNG, libPath } = loadPNG();

const WARMUP = 3;
// Iteration counts scale down for large files to keep runtime sane.
const iterationsFor = buffer => (buffer.length > 1024 * 1024 ? 15 : 200);

async function timeOne(fn, iterations) {
  const samples = [];
  for (let i = 0; i < WARMUP; i++) await fn();
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  return { median: median(samples), min: Math.min(...samples) };
}

const results = [];
for (const { name, buffer } of benchFixtures()) {
  const iterations = iterationsFor(buffer);
  const construct = await timeOne(() => new PNG(buffer), iterations);
  // Construct once outside the timed loop so decode samples measure only
  // inflate + unfilter, not a fresh parse per iteration.
  const png = new PNG(buffer);
  const decode = await timeOne(() => decodePixels(png), iterations);
  results.push({
    fixture: name,
    iterations,
    constructMedianMs: construct.median,
    constructMinMs: construct.min,
    decodeMedianMs: decode.median,
    decodeMinMs: decode.min,
  });
}

const jsonIndex = process.argv.indexOf('--json');
if (jsonIndex !== -1) {
  const out = process.argv[jsonIndex + 1];
  if (!out) {
    console.error('Usage: node bench/cpu.js --json <outfile>');
    process.exit(1);
  }
  fs.writeFileSync(out, JSON.stringify({ libPath, results }, null, 2));
  console.log(`Wrote ${out}`);
} else {
  console.log(`Library: ${libPath}\n`);
  printTable(
    results.map(r => ({
      fixture: r.fixture,
      iters: r.iterations,
      'construct (median)': ms(r.constructMedianMs),
      'construct (min)': ms(r.constructMinMs),
      'decode (median)': ms(r.decodeMedianMs),
      'decode (min)': ms(r.decodeMinMs),
    }))
  );
}
