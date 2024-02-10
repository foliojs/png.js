import replace from '@rollup/plugin-replace';
import ignore from 'rollup-plugin-ignore';
import alias from '@rollup/plugin-alias';
import nodeResolve from '@rollup/plugin-node-resolve';

import pkg from './package.json' assert { type: 'json' };

const cjs = {
  exports: 'named',
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
  browser
    ? Object.keys(pkg.dependencies)
    : ['fs', ...Object.keys(pkg.dependencies)];

const getPlugins = ({ browser }) => [
  ...(browser
    ? [
        ignore(['fs']),
        alias({
          entries: [{ find: 'zlib', replacement: 'browserify-zlib' }],
        }),
        nodeResolve({ browser, preferBuiltins: !browser }),
      ]
    : []),
  replace({
    preventAssignment: true,
    values: {
      BROWSER: JSON.stringify(browser),
    },
  }),
];

const serverConfig = {
  input,
  output: [
    getESM({ file: 'lib/png-js.js' }),
    getCJS({ file: 'lib/png-js.cjs' }),
  ],
  external: getExternal({ browser: false }),
  plugins: getPlugins({ browser: false }),
};

const browserConfig = {
  input,
  output: [
    getESM({ file: 'lib/png-js.browser.js' }),
    getCJS({ file: 'lib/png-js.browser.cjs' }),
  ],
  external: getExternal({ browser: true }),
  plugins: getPlugins({ browser: true }),
};

export default [serverConfig, browserConfig];
