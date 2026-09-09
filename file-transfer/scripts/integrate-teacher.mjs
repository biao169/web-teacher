import { readFileSync, writeFileSync, mkdirSync, lstatSync, renameSync, rmSync, realpathSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT } from '../server/config.mjs';

const patch = JSON.parse(readFileSync(new URL('../integration/teacher-site/patches/teacher-step2.json', import.meta.url), 'utf8'));
export function integrateTeacher(rootInput, action = 'check') {
  if (!['check', 'apply', 'revert'].includes(action)) throw new Error('操作必须为 check / apply / revert');
  const root = realpathSync(rootInput);
  if (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name !== 'academic-cms') throw new Error('所选目录不是教师网站工程。');
  const entries = patch.files.map(item => {
    const path = join(root, item.path); const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('接入文件必须为普通文件。');
    const original = readFileSync(path, 'utf8'); let text = original.replaceAll('\r\n', '\n');
    for (const block of item.blocks) {
      const previous = Array.isArray(block.previous) && block.previous.every(value => typeof value === 'string') ? block.previous : [];
      const fromCandidates = action === 'revert' ? [block.after, ...previous] : [block.before, ...previous];
      const to = action === 'revert' ? block.before : block.after;
      const matches = fromCandidates.filter(candidate => text.split(candidate).length - 1 === 1);
      const targetCount = text.split(to).length - 1;
      if (matches.length === 1 && targetCount === 0) text = text.replace(matches[0], to);
      else if (matches.length === 0 && targetCount === 1) continue;
      else throw new Error(`无法安全匹配 ${item.path}，已停止，尚未修改任何文件。请对照补丁合并。`);
    }
    if (original.includes('\r\n')) text = text.replaceAll('\n', '\r\n');
    return { path, relative: item.path, original, next: text, mode: stat.mode };
  });
  const changed = entries.filter(item => item.original !== item.next);
  if (action === 'check' || !changed.length) return { action, changed: changed.map(item => item.relative), written: false };
  const backup = join(PROJECT_ROOT, 'storage', 'integration-backups', randomUUID());
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  for (const item of changed) {
    const path = join(backup, item.relative); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, item.original, { flag: 'wx', mode: item.mode });
  }
  const committed = [];
  try {
    for (const item of changed) {
      // Detect concurrent local edits after preflight; preserve the user's current file on conflict.
      if (readFileSync(item.path, 'utf8') !== item.original) throw new Error('文件在接入期间发生变化，已停止。');
      const temporary = `${item.path}.ft-${randomUUID()}.tmp`;
      try { writeFileSync(temporary, item.next, { flag: 'wx', mode: item.mode }); renameSync(temporary, item.path); }
      finally { rmSync(temporary, { force: true }); }
      committed.push(item);
    }
  } catch (error) {
    for (const item of committed.reverse()) if (readFileSync(item.path, 'utf8') === item.next) writeFileSync(item.path, item.original, { mode: item.mode });
    throw error;
  }
  return { action, changed: changed.map(item => item.relative), written: true, backup };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const action = process.argv[2] ?? 'check';
    const root = resolve(process.argv[3] ?? join(PROJECT_ROOT, '../academic-cms'));
    console.log(JSON.stringify(integrateTeacher(root, action)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
