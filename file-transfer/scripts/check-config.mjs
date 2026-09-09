import { loadConfig, assertRuntime } from '../server/config.mjs';
try {
  assertRuntime();
  const config = loadConfig();
  console.log(JSON.stringify({ status: 'valid', configVersion: config.configVersion, host: config.host, port: config.port, dataDirectory: config.dataDirectory }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
