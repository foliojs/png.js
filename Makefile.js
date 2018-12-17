// https://github.com/shelljs/shelljs#command-reference
// https://devhints.io/shelljs
// https://github.com/shelljs/shelljs/wiki/The-make-utility
require('shelljs/make');

config.fatal = true;
config.verbose = true;

const readline = require('readline');
const { execFileSync } = require('child_process');

const packageJson = require('./package.json');

target.all = () => {
  target.clean();
  target.lint();
  target.compileTS();
  target.rollupUMD();
  target.rollupUMDMin();
};

target.lint = () => {
  exec(`prettier --loglevel error --write "src/**/*.ts"`);
  exec('tslint --project ./tsconfig.json --fix');
};

target.clean = () => {
  rm('-rf', 'lib');
  rm('-rf', 'es');
  rm('-rf', 'dist');
};

target.compileTS = () => {
  target.clean();
  exec('tsc --module CommonJS --outDir lib');
  exec('tsc --module ES2015 --outDir es');
};

target.rollupUMD = () => {
  env.UGLIFY = false;
  exec(`rollup -c rollup.config.js -o dist/png-ts.js`);
};

target.rollupUMDMin = () => {
  env.UGLIFY = true;
  exec(`rollup -c rollup.config.js -o dist/png-ts.min.js`);
};

/* =============================== Release ================================== */

target.releaseNext = () => {
  const version = `${packageJson.version}@next`;
  console.log('Releasing version', version);

  target.all();

  execFileSync('yarn', ['publish', '--tag', 'next'], { stdio: 'inherit' });
};

// Extra confirmation to avoid accidental releases to @latest
const promptForVerionToBeReleased = async (version) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question = `Enter "${version}" to proceed with the release: `;
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

target.releaseLatest = async () => {
  const currentBranch = exec('git rev-parse --abbrev-ref HEAD').stdout.trim();
  if (currentBranch !== 'master') {
    console.error('Must be on `master` branch to cut an @latest release.');
    return;
  }

  const version = `${packageJson.version}@latest`;
  console.log('Releasing version', version);

  target.all();

  const enteredVersion = await promptForVerionToBeReleased(version);
  if (enteredVersion !== version) {
    console.error('Entered version does match. Aborting release.');
    return;
  }

  execSync('yarn', ['publish', '--tag', 'latest'], { stdio: 'inherit' });

  const tagName = `v${packageJson.version}`;
  exec(`git commit -am 'Bump version to ${packageJson.version}'`);
  exec('git push');
  exec(`git tag ${tagName}`);
  exec(`git push origin ${tagName}`);
  console.log('Created git tag:', tagName);

  const zipName = `png-ts_${tagName}.zip`;
  exec(`zip -r ${zipName} .`);
  console.log('Zip archive of', tagName, 'written to', zipName);

  console.log('🎉   Release of', version, 'complete!  🎉');
};
