import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // The legacy standalone bundle (png.js) touches document/window at load
    // time and registers the global `PNG` used by the specs' browser branches.
    environment: 'jsdom',
    // Order matters: patch-canvas must stub getContext before png.js loads.
    setupFiles: ['./test/patch-canvas.js', './zlib.js', './png.js'],
    snapshotFormat: {
      printBasicPrototype: true,
    },
  },
});
