import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import fileTransferModule, { normalizeNuxtPath } from '../integration/teacher-site/module.mjs';

test('Nuxt integration paths use portable separators on Windows', () => {
  assert.equal(normalizeNuxtPath('D:\\Python\\b01-website\\file-transfer\\server\\bridge.mjs'), 'D:/Python/b01-website/file-transfer/server/bridge.mjs');
  assert.equal(normalizeNuxtPath('/srv/file-transfer/server/bridge.mjs'), '/srv/file-transfer/server/bridge.mjs');
});

test('disabled or omitted module option leaves a frozen teacher context untouched', () => {
  const context = Object.freeze({ options: Object.freeze({ alias: Object.freeze({ teacher: 'existing' }), runtimeConfig: Object.freeze({ public: Object.freeze({ language: 'zh' }) }) }) });
  assert.doesNotThrow(() => fileTransferModule({}, context));
  assert.doesNotThrow(() => fileTransferModule({ enabled: false }, context));
  assert.deepEqual(Object.keys(context.options.alias), ['teacher']);
});
test('enabled module registers only namespaced contract metadata', () => {
  const hooks = new Map();
  const context = { hook: (name, fn) => hooks.set(name, fn), options: { rootDir: fileURLToPath(new URL('../', import.meta.url)), routeRules: {}, alias: {}, runtimeConfig: { public: {} }, modules: [], css: [], pages: true } };
  fileTransferModule({ enabled: true }, context);
  assert.equal(context.options.alias['#file-transfer-contracts'], fileURLToPath(new URL('../shared/contracts.mjs', import.meta.url)));
  assert.equal(context.options.runtimeConfig.public.fileTransfer.routesRegistered, true);
  const pages = []; hooks.get('pages:extend')(pages);
  assert.deepEqual(pages.map(p => [p.path, p.meta.layout]), [['/zh/transfer', 'public'], ['/en/transfer', 'public'], ['/transfer-admin/', false]]);
  assert.throws(() => hooks.get('pages:extend')(pages), /collision/u);
  assert.equal(context.options.runtimeConfig.fileTransfer.signingKey, '');
  assert.doesNotMatch(JSON.stringify(context.options.runtimeConfig.public), /signingKey|serviceOrigin/u);
  assert.equal(context.options.runtimeConfig.public.fileTransfer.transferAvailable, false);
  assert.deepEqual(context.options.modules, []); assert.deepEqual(context.options.css, []);
  assert.throws(() => fileTransferModule({ enabled: true }, context), /already registered/u);
});
test('string switches and unknown module options cannot accidentally enable integration', () => {
  for (const options of [{ enabled: 'false' }, { enabled: 1 }, { enableTurn: true }]) assert.throws(() => fileTransferModule(options, {}), /FT_MODULE/u);
});
