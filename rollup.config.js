import nodeResolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import { uglify } from 'rollup-plugin-uglify';
import { plugin as analyze } from 'rollup-plugin-analyzer';

const { UGLIFY } = process.env;

export default {
  input: 'es/png.js',
  output: {
    name: 'PNG',
    format: 'umd',
  },
  plugins: [
    // analyze(),
    nodeResolve({
      jsnext: true,
    }),
    commonjs(),
    UGLIFY === 'true' && uglify(),
  ],
};
