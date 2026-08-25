# Benchmarks

Plain Node scripts (not a test runner) so memory runs get `--expose-gc`
and a deterministic single process.

## Setup

```sh
yarn bench:fixtures   # synthesize large PNGs into bench/fixtures/ (gitignored)
```

Fixtures are generated with a seeded PRNG, so every run produces identical
files — before/after comparisons measure the same data.

## Running

```sh
yarn bench       # CPU: constructor parse + decodePixels timings
yarn bench:mem   # Memory: retained heap, source-buffer pinning, decode peak
```

## Comparing two versions

The library under test is selected with `PNG_LIB` (defaults to this
checkout's `lib/png-js.cjs`), so a baseline can be measured with the same
harness:

```sh
git worktree add ../png.js-baseline <base-commit>
(cd ../png.js-baseline && yarn && yarn build)

PNG_LIB=../png.js-baseline/lib/png-js.cjs node bench/cpu.js --json before-cpu.json
node bench/cpu.js --json after-cpu.json
node bench/compare.js before-cpu.json after-cpu.json

PNG_LIB=../png.js-baseline/lib/png-js.cjs node --expose-gc bench/memory.js --json before-mem.json
node --expose-gc bench/memory.js --json after-mem.json
node bench/compare.js before-mem.json after-mem.json
```

## What memory.js measures

Retention metrics use `heapUsed + arrayBuffers` (Buffer/TypedArray backing
stores live outside the V8 heap), per fixture, relative to a GC'd baseline:

- **retained by instance** — memory kept alive by a constructed `PNG` after
  GC, while the caller still holds the file buffer.
- **after dropping file buf** — same, after the caller releases its file
  buffer reference. If this stays near "retained", the instance pins the
  source file.
- **after decode / after releasing png** — residuals confirming decode
  doesn't grow instance state and nothing outlives the instance.
- **construct peak RSS / decode peak RSS** — true peak resident set size of
  parse (and parse+decode) measured in a fresh child process per fixture,
  minus a read-only baseline run. This catches transient allocation spikes
  that in-process sampling misses.

Retention metrics share one process across fixtures, so for kilobyte-sized
fixtures the residual columns can go slightly negative when a previous
fixture's memory is collected mid-measurement — treat sub-megabyte values
as noise. The peak RSS columns are per-process and don't have this problem.
