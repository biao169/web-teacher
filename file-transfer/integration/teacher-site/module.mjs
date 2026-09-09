import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SERVICE, ROUTES } from '../../shared/contracts.mjs';

export const normalizeNuxtPath = path => path.replaceAll('\\', '/');

export default function fileTransferModule(options = {}, nuxt) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['enabled', 'navigation'].includes(k))) throw new TypeError('FT_MODULE: unsupported option');
  const enabled = options.enabled === undefined ? false : options.enabled;
  const navigation = options.navigation === undefined ? true : options.navigation;
  if (typeof enabled !== 'boolean' || typeof navigation !== 'boolean') throw new TypeError('FT_MODULE: options must be boolean');
  if (!enabled) return;
  if (!nuxt?.options?.alias || !nuxt.options.runtimeConfig?.public || !nuxt.hook) throw new TypeError('FT_MODULE: a Nuxt context is required');
  if (Object.hasOwn(nuxt.options.alias, '#file-transfer-contracts') || Object.hasOwn(nuxt.options.runtimeConfig.public, 'fileTransfer')) throw new Error('FT_MODULE: integration namespace is already registered');
  // Nitro writes these values into virtual ESM modules. Forward slashes avoid
  // Windows backslashes becoming JavaScript escapes such as \f, \t and \b.
  const local = relative => normalizeNuxtPath(fileURLToPath(new URL(relative, import.meta.url)));
  const aliases = {
    '#file-transfer-contracts': local('../../shared/contracts.mjs'),
    '#ft-teacher-auth': normalizeNuxtPath(resolve(nuxt.options.rootDir, 'server/utils/auth-runtime.ts')),
    '#ft-teacher-auth-http': normalizeNuxtPath(resolve(nuxt.options.rootDir, 'server/utils/auth-http.ts')),
    '#ft-teacher-bounded-json': normalizeNuxtPath(resolve(nuxt.options.rootDir, 'server/utils/bounded-json.ts')),
  };
  Object.assign(nuxt.options.alias, aliases);
  nuxt.options.runtimeConfig.fileTransfer = { serviceOrigin: 'http://127.0.0.1:8787', signingKey: '' };
  nuxt.options.runtimeConfig.public.fileTransfer = {
    enabled: true, navigation, milestone: SERVICE.milestone, protocolVersion: SERVICE.protocolVersion,
    routesRegistered: true, transferAvailable: false,
  };
  nuxt.hook('pages:extend', pages => {
    for (const [name, path, file, layout] of [
      ['file-transfer-zh', ROUTES.publicZh, '../../web/public/transfer.vue', 'public'],
      ['file-transfer-en', ROUTES.publicEn, '../../web/public/transfer.vue', 'public'],
      ['file-transfer-admin', ROUTES.admin, '../../web/admin/index.vue', false],
    ]) {
      if (pages.some(page => page.path.replace(/\/$/u, '') === path.replace(/\/$/u, ''))) throw new Error('FT_MODULE: route collision');
      pages.push({ name, path, file: local(file), meta: { layout } });
    }
  });
  nuxt.hook('components:extend', components => {
    for (const [pascalName, file] of [['FileTransferNavEntry', '../../web/components/NavEntry.vue'], ['FileTransferAdminEntry', '../../web/components/AdminEntry.vue']]) {
      components.push({ pascalName, kebabName: pascalName.replace(/[A-Z]/gu, c => `-${c.toLowerCase()}`).slice(1), export: 'default', filePath: local(file), shortPath: file, chunkName: pascalName, global: true, mode: 'all', prefetch: false, preload: false });
    }
  });
  nuxt.hook('nitro:config', config => {
    config.alias = { ...config.alias, ...aliases };
    config.externals ??= {}; config.externals.inline ??= [];
    config.externals.inline.push(local('../../'));
    config.experimental ??= {}; config.experimental.websocket = true;
    config.handlers ??= [];
    config.handlers.push({ route: ROUTES.signal, handler: local('./server/signal.mjs') });
    config.handlers.push({ route: '/transfer-api/**', handler: local('./server/bridge.mjs') });
  });
  for (const path of ['/zh/transfer', '/en/transfer', '/transfer-admin', '/transfer-admin/**', '/transfer-api/**']) {
    nuxt.options.routeRules[path] = { ...nuxt.options.routeRules[path], headers: { 'cache-control': 'private, no-store, max-age=0', vary: 'Cookie', 'x-robots-tag': 'noindex, nofollow' } };
  }
}
