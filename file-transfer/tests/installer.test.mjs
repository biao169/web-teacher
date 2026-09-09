import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fixture } from './helpers.mjs';
import { integrateTeacher } from '../scripts/integrate-teacher.mjs';

const patch = JSON.parse(readFileSync(new URL('../integration/teacher-site/patches/teacher-step2.json', import.meta.url), 'utf8'));
function teacherFixture(t) {
  const { root } = fixture(t);
  writeFileSync(join(root, 'package.json'), '{"name":"academic-cms"}');
  for (const item of patch.files) { const path = join(root, item.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, item.blocks.map(b => b.before).join('\n// local customization\n')); }
  return root;
}
test('installer preflights all files, applies once and reverts while keeping unrelated edits', t => {
  const root = teacherFixture(t);
  const originals = patch.files.map(item => readFileSync(join(root, item.path), 'utf8'));
  assert.equal(integrateTeacher(root, 'check').written, false);
  const applied = integrateTeacher(root, 'apply'); t.after(() => rmSync(applied.backup, { recursive: true, force: true }));
  assert.equal(applied.changed.length, 3);
  assert.equal(integrateTeacher(root, 'apply').written, false);
  const file = join(root, patch.files[0].path); writeFileSync(file, readFileSync(file, 'utf8') + '\n// preserved later edit\n');
  const reverted = integrateTeacher(root, 'revert'); t.after(() => rmSync(reverted.backup, { recursive: true, force: true }));
  patch.files.forEach((item, i) => assert.equal(readFileSync(join(root, item.path), 'utf8'), originals[i] + (i === 0 ? '\n// preserved later edit\n' : '')));
});
test('an incompatible teacher file stops the entire patch without partial writes', t => {
  const root = teacherFixture(t);
  const first = readFileSync(join(root, patch.files[0].path), 'utf8');
  writeFileSync(join(root, patch.files[2].path), 'incompatible customized sidebar');
  assert.throws(() => integrateTeacher(root, 'apply'), /尚未修改/u);
  assert.equal(readFileSync(join(root, patch.files[0].path), 'utf8'), first);
});
test('installer upgrades the previous Windows path integration to a file URL and stays repeatable', t => {
  const root = teacherFixture(t);
  const first = patch.files[0];
  const previous = first.blocks[0].previous?.[0];
  assert.ok(previous);
  for (const item of patch.files) {
    const path = join(root, item.path);
    const content = item === first ? previous : item.blocks.map(block => block.after).join('\n// local customization\n');
    writeFileSync(path, content);
  }
  const applied = integrateTeacher(root, 'apply');
  t.after(() => rmSync(applied.backup, { recursive: true, force: true }));
  assert.deepEqual(applied.changed, ['nuxt.config.ts']);
  const config = readFileSync(join(root, 'nuxt.config.ts'), 'utf8');
  assert.match(config, /new URL\([^\n]+\)\.href/u);
  assert.doesNotMatch(config, /fileURLToPath\(new URL\('\.\.\/file-transfer/u);
  assert.equal(integrateTeacher(root, 'apply').written, false);
});
