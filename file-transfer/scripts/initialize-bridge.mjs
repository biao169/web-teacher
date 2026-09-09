import { generateKeyPairSync, createPublicKey, createPrivateKey } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, assertRuntime } from '../server/config.mjs';
import { openStorage } from '../server/storage.mjs';

try {
  assertRuntime();
  const config = loadConfig();
  const storage = openStorage(config); storage.close();
  const path = join(config.dataPath, 'teacher-signing-key.pkcs8');
  let privateKey; let created = false;
  if (existsSync(path)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('FT_KEY_FILE');
    privateKey = createPrivateKey({ key: readFileSync(path), format: 'der', type: 'pkcs8' });
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('FT_KEY_TYPE');
  } else {
    if (config.bridgePublicKey) throw new Error('FT_EXISTING_PUBLIC_KEY: 已配置公钥，拒绝替换现有身份信任。');
    privateKey = generateKeyPairSync('ed25519').privateKey;
    writeFileSync(path, privateKey.export({ format: 'der', type: 'pkcs8' }), { flag: 'wx', mode: 0o600 });
    created = true;
  }
  const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64');
  if (config.bridgePublicKey && config.bridgePublicKey !== publicKey) throw new Error('FT_KEY_MISMATCH: 现有公钥与私钥不匹配。');
  const configPath = resolve(config.projectRoot, process.env.FT_CONFIG ?? 'config.local.json');
  if (existsSync(configPath) && lstatSync(configPath).isSymbolicLink()) throw new Error('FT_CONFIG_LINK');
  const previous = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  writeFileSync(configPath, JSON.stringify({ ...previous, bridgePublicKey: publicKey }, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ status: 'ready', keyCreated: created, message: '身份桥接已初始化，未输出或共享教师网站会话密钥。请重启快传服务。' }));
} catch (error) { console.error(error.message.startsWith('FT_') ? error.message : '身份桥接初始化失败，请检查工具配置与独立存储目录。'); process.exitCode = 1; }
