import { loadConfig, assertRuntime } from '../server/config.mjs';
import { ROUTES, SERVICE } from '../shared/contracts.mjs';
try {
  assertRuntime();
  const config = loadConfig();
  const host = config.host === '0.0.0.0' ? '127.0.0.1' : config.host === '::' ? '::1' : config.host;
  const origin = `http://${host.includes(':') ? `[${host}]` : host}:${config.port}`;
  const response = await fetch(origin + ROUTES.ready, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  const body = await response.json();
  if (!response.ok || body.name !== SERVICE.name || body.protocolVersion !== SERVICE.protocolVersion || body.status !== 'ready') throw new Error('Not ready');
  console.log(JSON.stringify({ status: 'ready', transferAvailable: body.transferAvailable }));
} catch {
  console.error('健康检查失败：请先启动服务，并确认两条命令使用相同配置。');
  process.exitCode = 1;
}
