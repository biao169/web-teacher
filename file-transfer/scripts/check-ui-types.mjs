import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { PROJECT_ROOT } from '../server/config.mjs';
const host = resolve(process.argv[2] || join(PROJECT_ROOT, '../academic-cms'));
const require = createRequire(join(host, 'package.json'));
const ts = require('typescript');
const generated = ts.readConfigFile(join(host, '.nuxt/tsconfig.app.json'), ts.sys.readFile).config;
const nuxtRequire = createRequire(require.resolve('nuxt/package.json'));
await mkdir(join(PROJECT_ROOT, 'reports'), { recursive: true });
const temp = await mkdtemp(join(PROJECT_ROOT, 'reports/typecheck-'));
try {
  const config = join(temp, 'tsconfig.json');
  // Nuxt's generated aliases are relative to .nuxt. Preserve that base while
  // resolving Vue's template types for sources outside the host root.
  const paths = Object.fromEntries(Object.entries(generated.compilerOptions.paths).map(([key, values]) => [key, values.map(value => resolve(host, '.nuxt', value))]));
  paths.vue = [join(dirname(require.resolve('vue/package.json')), 'dist/vue.d.ts')];
  await writeFile(config, JSON.stringify({ compilerOptions: { ...generated.compilerOptions, noEmit: true, paths }, vueCompilerOptions: { ...generated.vueCompilerOptions, plugins: (generated.vueCompilerOptions?.plugins || []).map(plugin => nuxtRequire.resolve(plugin)) }, include: [join(host, '.nuxt/nuxt.d.ts'), join(PROJECT_ROOT, 'web/**/*.ts'), join(PROJECT_ROOT, 'web/**/*.vue'), join(PROJECT_ROOT, 'shared/**/*.ts'), join(PROJECT_ROOT, 'shared/**/*.mts')] }));
  const child = spawn(process.execPath, [require.resolve('vue-tsc/bin/vue-tsc.js'), '--noEmit', '-p', config], { cwd: host, stdio: 'inherit' });
  const result = await new Promise((ok, fail) => { child.on('error', fail); child.on('exit', code => ok(code)); });
  process.exitCode = result ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
