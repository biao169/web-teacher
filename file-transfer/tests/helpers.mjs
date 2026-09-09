import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig } from '../server/config.mjs';
export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'file-transfer-测试 space-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, config: validateConfig({}, root) };
}
