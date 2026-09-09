import { SERVICE } from '../shared/contracts.mjs';
import { assertRuntime, loadConfig } from '../server/config.mjs';

let service;
try {
  assertRuntime();
  const config = loadConfig();
  const { createService } = await import('../server/service.mjs');
  service = createService(config);
  const address = await service.listen();
  const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  console.log(JSON.stringify({ event: 'ready', service: 'academic-file-transfer', url: `http://${host}:${address.port}`, milestone: SERVICE.milestone, availability: 'check-session-policy' }));
  const stop = async () => {
    try { await service.close(); console.log(JSON.stringify({ event: 'stopped' })); }
    catch { process.exitCode = 1; }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  if (service) await service.close();
  const message = error.code === 'ERR_MODULE_NOT_FOUND' ? '缺少依赖：请在 file-transfer 目录运行 pnpm install --frozen-lockfile 后重试。' : error.code === 'EADDRINUSE' ? '端口已被占用，请修改 FT_PORT 或 config.local.json 中的 port。'
    : error.message.startsWith('FT_') ? error.message : `服务启动失败（${error.code ?? 'storage/config'}），请检查配置和独立数据目录权限。`;
  console.error(message);
  process.exitCode = 1;
}
