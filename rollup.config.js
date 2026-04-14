import replace from '@rollup/plugin-replace';
import ignore from 'rollup-plugin-ignore';

import pkg from './package.json' with { type: 'json' };

const cjs = {
  exports: 'default',
  format: 'cjs',
  interop: 'compat',
};

const esm = {
  format: 'es',
};

const getCJS = (override) => Object.assign({}, cjs, override);
const getESM = (override) => Object.assign({}, esm, override);

const input = 'src/index.js';

const getExternal = ({ browser }) =>
  browser ? [...Object.keys(pkg.dependencies), 'zlib'] : ['fs', 'zlib'];

const getPlugins = ({ browser }) => [
  ...(browser ? [ignore(['fs'])] : []),
  replace({
    preventAssignment: true,
    values: {
      BROWSER: JSON.stringify(browser),
    },
  }),
];

const getTreeshake = ({ browser }) => ({
  moduleSideEffects: (id) => (browser ? id !== 'zlib' : id !== 'fflate'),
});

const serverConfig = {
  input,
  output: [
    getESM({ file: 'lib/png-js.js' }),
    getCJS({ file: 'lib/png-js.cjs' }),
  ],
  external: getExternal({ browser: false }),
  plugins: getPlugins({ browser: false }),
  treeshake: getTreeshake({ browser: false }),
};

const browserConfig = {
  input,
  output: [
    getESM({ file: 'lib/png-js.browser.js' }),
    getCJS({ file: 'lib/png-js.browser.cjs' }),
  ],
  external: getExternal({ browser: true }),
  plugins: getPlugins({ browser: true }),
  treeshake: getTreeshake({ browser: true }),
};

export default [serverConfig, browserConfig];
