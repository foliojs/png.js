// Memory benchmark: measures heap retained by a parsed PNG instance,
// whether the instance pins the source file buffer, the transient cost of
// decodePixels, and (via a child process per fixture) true peak RSS of the
// whole parse+decode pipeline.
// Usage: node --expose-gc bench/memory.js [--json out.json]
// Set PNG_LIB=<path to png-js.cjs> to benchmark a different build.
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  loadPNG,
  benchFixtures,
  fixturesDir,
  repoDir,
  mb,
  printTable,
} from './common.js';

if (typeof global.gc !== 'function') {
  console.error('Run with --expose-gc (yarn bench:mem)');
  process.exit(1);
}

const { PNG, libPath } = loadPNG();

// Buffers and typed arrays live outside the V8 heap, so retained size is
// heapUsed + arrayBuffers.
function gcUsage() {
  global.gc();
  global.gc();
  const { heapUsed, arrayBuffers } = process.memoryUsage();
  return heapUsed + arrayBuffers;
}

// True peak RSS of parse+decode, measured in a fresh child process so
// transient allocation spikes (which in-process sampling misses) count.
// The read-only run isolates the cost of just loading the file.
function peakRSS(file, decode) {
  const script = `
    const PNG = require(${JSON.stringify(libPath)});
    const buffer = require('fs').readFileSync(${JSON.stringify(file)});
    const mode = ${JSON.stringify(decode)};
    const done = () => console.log(process.resourceUsage().maxRSS);
    if (mode === 'read') done();
    else {
      const png = new PNG(buffer);
      if (mode === 'construct') done();
      else png.decodePixels(done);
    }
  `;
  const res = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    throw new Error(`peak child failed for ${file}: ${res.stderr}`);
  }
  return parseInt(res.stdout, 10); // kilobytes (libuv normalizes all platforms)
}

const rssUnit = 1024;

async function measure(name, file, readBuffer) {
  const baseline = gcUsage();

  let buffer = readBuffer();
  const fileSize = buffer.length;
  let png = new PNG(buffer);

  // Heap+buffers the instance keeps alive once construction churn is
  // collected (caller still holds the file buffer).
  const retained = gcUsage() - baseline;

  // Drop the caller's reference to the file buffer. If the instance pins
  // the source data, this barely moves.
  buffer = null;
  const retainedAfterDrop = gcUsage() - baseline;

  let pixelBytes = 0;
  await new Promise(resolve => {
    png.decodePixels(pixels => {
      pixelBytes = pixels.length;
      resolve();
    });
  });

  // Let the event loop turn so zlib's deferred handle cleanup releases its
  // internal buffers before sampling.
  await new Promise(resolve => setImmediate(resolve));

  // Residual after decode with pixels dropped: decodePixels should not
  // grow what the instance retains.
  const afterDecode = gcUsage() - baseline;
  png = null;
  const leaked = gcUsage() - baseline;

  const readRSS = peakRSS(file, 'read') * rssUnit;
  const constructPeakRSS = peakRSS(file, 'construct') * rssUnit - readRSS;
  const decodePeakRSS = peakRSS(file, 'decode') * rssUnit - readRSS;

  return {
    fixture: name,
    fileSize,
    pixelBytes,
    retained,
    retainedAfterDrop,
    afterDecode,
    leaked,
    constructPeakRSS,
    decodePeakRSS,
  };
}

const results = [];
for (const { name, buffer } of benchFixtures()) {
  const file = fs.existsSync(path.join(fixturesDir, name))
    ? path.join(fixturesDir, name)
    : path.join(repoDir, 'test/images', name);
  // Hand each measurement its own buffer read so dropping it is meaningful.
  const bytes = Uint8Array.prototype.slice.call(buffer);
  results.push(await measure(name, file, () => Buffer.from(bytes)));
}

const jsonIndex = process.argv.indexOf('--json');
if (jsonIndex !== -1) {
  const out = process.argv[jsonIndex + 1];
  if (!out) {
    console.error('Usage: node --expose-gc bench/memory.js --json <outfile>');
    process.exit(1);
  }
  fs.writeFileSync(out, JSON.stringify({ libPath, results }, null, 2));
  console.log(`Wrote ${out}`);
} else {
  console.log(`Library: ${libPath}\n`);
  printTable(
    results.map(r => ({
      fixture: r.fixture,
      file: mb(r.fileSize),
      pixels: mb(r.pixelBytes),
      'retained by instance': mb(r.retained),
      'after dropping file buf': mb(r.retainedAfterDrop),
      'after decode': mb(r.afterDecode),
      'after releasing png': mb(r.leaked),
      'construct peak RSS': mb(r.constructPeakRSS),
      'decode peak RSS': mb(r.decodePeakRSS),
    }))
  );
}
