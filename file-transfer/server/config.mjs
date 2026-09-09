import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { bridgeKey } from './bridge-token.mjs';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULTS = Object.freeze({ configVersion: 1, host: '127.0.0.1', port: 8787, dataDirectory: 'storage/data', bridgePublicKey: '' });

export function assertRuntime(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major !== 24 || minor < 19) throw new Error('FT_RUNTIME: 请使用 Node.js >=24.19.0 <25（本版验证版本为 24.19.0）。');
}

export function validateConfig(input = {}, root = PROJECT_ROOT) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('FT_CONFIG: 配置必须是 JSON 对象。');
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new TypeError(`FT_CONFIG: 不支持配置项 ${key}；传输权限与链路在快传管理页配置。`);
  }
  const value = { ...DEFAULTS, ...input };
  if (value.configVersion !== 1) throw new TypeError('FT_CONFIG: configVersion 必须为 1。');
  if (value.bridgePublicKey !== '') {
    try { bridgeKey(value.bridgePublicKey, 'public'); }
    catch { throw new TypeError('FT_CONFIG: bridgePublicKey 必须为 Ed25519 SPKI DER 的 Base64 公钥。'); }
  }
  if (typeof value.host !== 'string' || !isIP(value.host) || value.host.includes('%')) throw new TypeError('FT_CONFIG: host 必须是 IP 地址，例如 127.0.0.1。');
  if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) throw new TypeError('FT_CONFIG: port 必须为 1–65535 的整数。');
  const parts = typeof value.dataDirectory === 'string' ? value.dataDirectory.split('/') : [];
  if (parts.length < 2 || parts[0] !== 'storage' || parts.some(p => !p || p === '.' || p === '..' || /[\\:<>"|?*\u0000-\u001f]/u.test(p) || /[. ]$/u.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(p))) {
    throw new TypeError('FT_CONFIG: dataDirectory 必须位于本工具 storage/ 下，使用 / 分隔且不能包含回退路径。');
  }
  return Object.freeze({ ...value, projectRoot: resolve(root), dataPath: resolve(root, ...parts) });
}

/** Resolve relative paths against this project, never the launching shell's cwd. */
export function loadConfig({ env = process.env, root = PROJECT_ROOT } = {}) {
  const fileName = env.FT_CONFIG ?? 'config.local.json';
  const filePath = isAbsolute(fileName) ? fileName : resolve(root, fileName);
  let raw = {};
  try { raw = JSON.parse(readFileSync(filePath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT' || env.FT_CONFIG !== undefined) throw new Error('FT_CONFIG: 无法读取配置 JSON；请检查 FT_CONFIG 和配置文件。', { cause: error });
  }
  // Validate file first; arrays, unknown keys and malformed values must not be hidden by env overrides.
  validateConfig(raw, root);
  if (env.FT_HOST !== undefined) raw.host = env.FT_HOST;
  if (env.FT_PORT !== undefined) {
    if (!/^[1-9][0-9]{0,4}$/u.test(env.FT_PORT)) throw new TypeError('FT_CONFIG: FT_PORT 必须为端口整数。');
    raw.port = Number(env.FT_PORT);
  }
  if (env.FT_DATA_DIR !== undefined) raw.dataDirectory = env.FT_DATA_DIR;
  if (env.FT_BRIDGE_PUBLIC_KEY !== undefined) raw.bridgePublicKey = env.FT_BRIDGE_PUBLIC_KEY;
  return validateConfig(raw, root);
}
