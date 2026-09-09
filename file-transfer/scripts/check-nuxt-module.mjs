// Optional host compatibility check. Uses an existing Nuxt installation without editing it.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

if (!process.argv[2]) throw new Error('Usage: node scripts/check-nuxt-module.mjs <teacher-project>');
const teacher = resolve(process.argv[2]);
const require = createRequire(join(teacher, 'package.json'));
// Load the installed Nuxt directly: the kit wrapper searches from the fixture cwd.
const { loadNuxt } = await import(pathToFileURL(join(dirname(require.resolve('nuxt/package.json')), 'dist/index.mjs')).href);
const modulePath = new URL('../integration/teacher-site/module.mjs', import.meta.url).href;
assert.equal(new URL(modulePath).protocol, 'file:');
for (const enabled of [false, true]) {
  const root = mkdtempSync(join(tmpdir(), 'ft-nuxt-测试 space-'));
  let nuxt;
  try {
    writeFileSync(join(root, 'package.json'), '{"private":true,"type":"module"}');
    nuxt = await loadNuxt({ cwd: root, ready: true, overrides: {
      dev: false, telemetry: false, devtools: { enabled: false }, compatibilityDate: '2026-09-07',
      modulesDir: [join(teacher, 'node_modules')], modules: [[modulePath, { enabled }]],
    } });
    const state = nuxt.options.runtimeConfig.public.fileTransfer;
    if (enabled) {
      assert.equal(state.enabled, true); assert.equal(state.routesRegistered, true);
      assert.equal(state.transferAvailable, false);
      assert.equal(nuxt.options.alias['#file-transfer-contracts'], fileURLToPath(new URL('../shared/contracts.mjs', import.meta.url)));
      const pages = [];
      await nuxt.callHook('pages:extend', pages);
      assert.ok(pages.some(page => page.path === '/zh/transfer' && page.meta.layout === 'public'));
      assert.ok(pages.some(page => page.path === '/transfer-admin/' && page.meta.layout === false));
    } else {
      assert.equal(state, undefined);
      assert.equal(nuxt.options.alias['#file-transfer-contracts'], undefined);
      const pages = []; await nuxt.callHook('pages:extend', pages);
      assert.ok(!pages.some(page => page.path.includes('transfer')));
    }
    console.log(JSON.stringify({ check: 'nuxt-module', enabled, passed: true }));
  } finally {
    if (nuxt) await nuxt.close();
    rmSync(root, { recursive: true, force: true });
  }
}
