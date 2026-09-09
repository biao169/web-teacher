import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { loadConfig, validateConfig, assertRuntime } from '../server/config.mjs';
import { byteCount } from '../shared/contracts.mjs';

test('default config is isolated and validation has no filesystem side effects', t => {
  const { root } = fixture(t);
  const config = loadConfig({ root, env: {} });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.dataPath, join(root, 'storage', 'data'));
  assert.equal(existsSync(config.dataPath), false);
});
test('relative config file is resolved against project root; env overrides work', t => {
  const { root } = fixture(t);
  writeFileSync(join(root, 'custom.json'), JSON.stringify({ port: 9000 }));
  const config = loadConfig({ root, env: { FT_CONFIG: 'custom.json', FT_PORT: '9001', FT_HOST: '::1', FT_DATA_DIR: 'storage/测试 space' } });
  assert.equal(config.port, 9001);
  assert.equal(config.host, '::1');
  assert.equal(config.dataPath, join(root, 'storage', '测试 space'));
});
test('missing explicit config, malformed JSON and malformed config fail', t => {
  const { root } = fixture(t);
  assert.throws(() => loadConfig({ root, env: { FT_CONFIG: 'missing.json' } }), /FT_CONFIG/u);
  for (const text of ['{', 'null', '[]', '"text"', '{"port": "9000"}', '{"enableTurn":true}']) {
    writeFileSync(join(root, 'config.local.json'), text);
    assert.throws(() => loadConfig({ root, env: {} }), /FT_CONFIG/u);
  }
});
test('invalid ports, hosts and unknown enable switches fail closed', t => {
  const { root } = fixture(t);
  for (const port of [0, -1, 65536, 1.5, '8787', null]) assert.throws(() => validateConfig({ port }, root));
  for (const port of ['', '0', '01', '12x', '1e3', '65536']) assert.throws(() => loadConfig({ root, env: { FT_PORT: port } }));
  for (const host of ['https://example.com', 'localhost', '', null]) assert.throws(() => validateConfig({ host }, root));
  for (const key of ['transfersEnabled', 'turnEnabled', 'vpnEnabled', '__proto__']) assert.throws(() => validateConfig(JSON.parse(`{"${key}":true}`), root));
});
test('storage paths cannot escape or become Windows device paths', t => {
  const { root } = fixture(t);
  for (const dataDirectory of ['../academic-cms/data', '/tmp/data', 'D:\\shared\\data', 'storage', 'storage/../../academic-cms', 'storage/a/../data', 'storage//data', 'storage\\data', 'storage/NUL', 'storage/con.txt', 'storage/a.', 'storage/a ', 'storage/a:b']) {
    assert.throws(() => validateConfig({ dataDirectory }, root), /FT_CONFIG/u, dataDirectory);
  }
});
test('byte count parsing preserves large totals and distinguishes zero from unlimited', () => {
  assert.equal(byteCount('0'), '0');
  assert.equal(byteCount('9223372036854775807'), '9223372036854775807');
  for (const input of [null, 10, '-1', '01', '1.5', '1e3', '9223372036854775808']) assert.throws(() => byteCount(input));
});
test('unsupported runtimes fail with a useful version requirement', () => {
  for (const version of ['22.20.0', '24.18.0', '25.0.0']) assert.throws(() => assertRuntime(version), /FT_RUNTIME/u);
  assert.doesNotThrow(() => assertRuntime('24.19.0'));
});
