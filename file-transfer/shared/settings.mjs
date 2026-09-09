import { publicNetworks, stunServers, transportReadiness } from './network.mjs';
import { lanNetworks, assertAccess } from './lan.mjs';
import { TRANSPORTS, byteCount } from './contracts.mjs';

// This schema is used by both the form and the authoritative service validator.
// No credentials, host paths or executable configuration belong here.
const field = (key, zh, en, type, value, extra = {}) => ({ key, zh, en, type, value, ...extra });
export const SETTINGS_SECTIONS = [
  { id: 'cloud', zh: 'Cloudflare 应用流量保护', en: 'Cloudflare traffic guard', fields: [
    field('cloudBudgetEnabled', '启用云端文件链路日/月上限（仅 Cloudflare 版）', 'Limit cloud file traffic (Cloudflare only)', 'boolean', true),
    field('cloudDailyBytes', '每日文件链路流量上限（UTC）', 'Daily file traffic cap (UTC)', 'bytes', '1073741824'),
    field('cloudMonthlyBytes', '每月文件链路流量上限（UTC）', 'Monthly file traffic cap (UTC)', 'bytes', '10737418240'),
  ] },
  { id: 'general', zh: '开放与说明', en: 'Availability', fields: [
    field('enabled', '允许开放传输（链路完成后生效）', 'Enable transfers when available', 'boolean', false),
    field('noticeZh', '中文停用说明', 'Disabled message · Chinese', 'text', '文件快传正在准备中。', { max: 500 }),
    field('noticeEn', '英文停用说明', 'Disabled message · English', 'text', 'File transfer is being prepared.', { max: 500 }),
  ] },
  { id: 'links', zh: '链路与速率', en: 'Connections & speed', fields: [
    field('lanNetworks', '已核验的局域网 IPv4 网段（每行一个，如 192.168.1.0/24）', 'Verified LAN IPv4 ranges (one per line, e.g. 192.168.1.0/24)', 'text', '', { max: 1000 }),
    field('lanVerified', '确认：上述网段间文件路由已核验不经过 VPN；变更网络后须重新核验', 'Confirmed: routes within these ranges bypass VPN; recheck after network changes', 'boolean', false),
    field('lanEnabled', '局域网直连：同网更快，双方在线', 'LAN direct: faster nearby, both online', 'boolean', true),
    field('wanEnabled', '广域网直连：双方在线，尝试直接连接', 'Internet direct: both online', 'boolean', true),
    field('relayEnabled', '中继：直连失败时接力，计入出口流量', 'Relay: fallback, uses metered traffic', 'boolean', false),
    field('shareEnabled', '临时分享：可稍后领取，占用服务器空间', 'Temporary sharing: receive later, uses storage', 'boolean', false),
    field('lanRateKbps', '局域网速率上限 · Kbit/s（留空不限速）', 'LAN rate · Kbit/s (empty: unlimited)', 'integer', null, { min: 1, max: 1000000000, nullable: true }),
    field('wanRateKbps', '其他链路速率上限 · Kbit/s（留空不限速）', 'Other connections · Kbit/s (empty: unlimited)', 'integer', 10000, { min: 1, max: 1000000000, nullable: true }),
    field('wanNetworks', '允许远程直连的公网 IPv4 范围（每行 CIDR）', 'Allowed public IPv4 ranges for internet direct (CIDR per line)', 'text', '', { max: 1000 }),
    field('wanVerified', '已核验上述直连范围绕开受限 VPN', 'Verified these direct ranges bypass the limited VPN', 'boolean', false),
    field('stunUrls', 'STUN 地址（可选，每行一个）', 'STUN URLs (optional, one per line)', 'text', '', { max: 1000 }),
    field('serverVpnPath', '服务器文件链路的 VPN 路径', 'VPN route for server file traffic', 'select', 'unknown', { options: [['unknown','尚未确认','Unknown'],['confirmed-vpn','经过受限 VPN','Through limited VPN'],['confirmed-outside-vpn','绕开受限 VPN','Outside limited VPN']] }),
    field('serverOutsideVerified', '已核验服务器及教师代理链路绕开受限出口', 'Verified server and teacher proxy paths bypass the limited exit', 'boolean', false),
  ] },
  { id: 'personal', zh: '个人额度与匿名共享额度', en: 'Personal & shared guest allowance', fields: [
    field('personalTimeZone', '个人额度重置时区', 'Personal allowance reset timezone', 'timezone', 'Asia/Shanghai', { max: 100 }),
    field('guestDailyBytes', '所有匿名访客每日合计 · GB（留空不限制）', 'All guests daily total · GB (empty: unlimited)', 'bytes', null, { nullable: true }),
    field('guestMonthlyBytes', '所有匿名访客每月合计 · GB（留空不限制）', 'All guests monthly total · GB (empty: unlimited)', 'bytes', null, { nullable: true }),
    field('guestConcurrency', '所有匿名访客同时任务数', 'Concurrent tasks across all guests', 'integer', 10, { min: 1, max: 100 }),
  ] },
  { id: 'vpn', zh: 'VPN 流量防护', en: 'VPN traffic budget', fields: [
    field('vpnBudgetUnit', '流量显示与输入单位', 'Traffic display and input unit', 'select', 'GB', { options: [['GB', 'GB · 十亿字节', 'GB · 10⁹ bytes'], ['GiB', 'GiB · 2³⁰ 字节', 'GiB · 2³⁰ bytes']] }),
    field('vpnProtectionMode', '额度保护模式', 'Budget protection mode', 'select', 'strict', { options: [['strict', '严格：没有出口断流能力不放行', 'Strict: require an enforced exit cap'], ['estimate', '估算：轮询统计与保守预留', 'Estimated: polling and conservative reservations']] }),
    field('vpnMeterSource', '出口统计来源', 'Exit usage source', 'select', 'off', { options: [['off', '尚未接入', 'Not connected'], ['interface', '本机网卡（Linux / Windows）', 'Local interface (Linux / Windows)'], ['snapshot', '外部账单／网关快照', 'External billing / gateway snapshot']] }),
    field('vpnInterface', '出口网卡完整名称（本机采集时填写）', 'Exact exit interface name (local collection)', 'text', '', { max: 200 }),
    field('vpnSourceId', '出口／账户标识（须与快照一致）', 'Exit / account ID (must match snapshot)', 'text', 'vpn-main', { max: 100 }),
    field('vpnScopeVerified', '已核验：统计覆盖该 VPN 账户的教师站、快传及其他共用流量', 'Verified: the source covers website, transfers and other traffic sharing this VPN account', 'boolean', false),
    field('vpnPollSeconds', '采集间隔 · 秒', 'Polling interval · seconds', 'integer', 10, { min: 2, max: 60 }),
    field('vpnStaleSeconds', '统计失联判定 · 秒', 'Stale sample threshold · seconds', 'integer', 30, { min: 6, max: 300 }),
    field('vpnOverheadPercent', '受控传输协议开销预留 · %', 'Controlled transfer overhead reserve · %', 'integer', 10, { min: 0, max: 100 }),
    field('vpnGuard', '启用 VPN 额度保护', 'Enable VPN budget guard', 'boolean', true),
    field('vpnDailyBytes', '每日流量额度 · GB（留空：未配置）', 'Daily traffic · GB (empty: unconfigured)', 'bytes', null, { nullable: true }),
    field('vpnMonthlyBytes', '每月流量额度 · GB（留空：未配置）', 'Monthly traffic · GB (empty: unconfigured)', 'bytes', null, { nullable: true }),
    field('vpnReserveBytes', '预留流量 · GB', 'Reserved traffic · GB', 'bytes', '1000000000'),
    field('vpnWarningPercent', '剩余流量提醒阈值 · %', 'Warn at remaining budget · %', 'integer', 20, { min: 1, max: 99 }),
    field('vpnTimeZone', '额度重置时区（如 Asia/Shanghai）', 'Reset timezone (e.g. Asia/Shanghai)', 'timezone', 'Asia/Shanghai', { max: 100 }),
    field('vpnBilling', 'VPN 计费方向', 'VPN billing direction', 'select', 'both', { options: [['both', '上传 + 下载', 'Upload + download'], ['outbound', '仅上传出口', 'Outbound only'], ['inbound', '仅下载入口', 'Inbound only']] }),
    field('vpnUnknownPath', '无法确认是否经过 VPN 的路径', 'Unknown VPN route', 'select', 'block', { options: [['block', '禁用该路径', 'Block path'], ['meter', '按 VPN 流量保守计量', 'Meter as VPN traffic']] }),
  ] },
  { id: 'temporary', zh: '临时文件', en: 'Temporary files', fields: [
    field('temporaryHours', '默认保存时长 · 小时', 'Default lifetime · hours', 'integer', 24, { min: 1, max: 720 }),
    field('temporaryMaxDownloads', '默认最多下载次数', 'Default download limit', 'integer', 1, { min: 1, max: 10000 }),
    field('temporaryStorageBytes', '临时存储总量 · GB', 'Temporary storage cap · GB', 'bytes', '10000000000'),
    field('temporaryCleanupMinutes', '到期清理检查间隔 · 分钟', 'Expiry cleanup interval · minutes', 'integer', 15, { min: 1, max: 1440 }),
  ] },
  { id: 'records', zh: '记录与维护', en: 'Records & maintenance', fields: [
    field('recoveryHours', '中断任务恢复期限 · 小时', 'Recovery window · hours', 'integer', 24, { min: 1, max: 72 }),
    field('checkpointMiB', '检查点最小间隔 · MiB', 'Minimum checkpoint interval · MiB', 'integer', 4, { min: 1, max: 16 }),
    field('automaticRetries', '连接中断自动重试次数', 'Automatic connection retries', 'integer', 3, { min: 0, max: 5 }),
    field('recordTransfers', '记录传输元信息（不记录文件正文）', 'Record transfer metadata (no file contents)', 'boolean', true),
    field('recordRetentionDays', '传输记录保留天数', 'Transfer record retention · days', 'integer', 30, { min: 1, max: 365 }),
  ] },
];
export const POLICY_FIELDS = [
  field('send', '允许发送', 'Allow sending', 'boolean', false),
  field('receive', '允许接收', 'Allow receiving', 'boolean', false),
  field('lanRateKbps', '局域网速率 · Kbit/s（留空继承）', 'LAN rate · Kbit/s (empty: inherit)', 'integer', null, { min: 1, max: 1000000000, nullable: true }),
  field('wanRateKbps', '其他链路速率 · Kbit/s（留空继承）', 'Other rate · Kbit/s (empty: inherit)', 'integer', null, { min: 1, max: 1000000000, nullable: true }),
  field('maxFileBytes', '单文件上限 · GB（留空不限制）', 'Per file · GB (empty: unlimited)', 'bytes', null, { nullable: true }),
  field('maxTaskBytes', '单任务上限 · GB（留空不限制）', 'Per task · GB (empty: unlimited)', 'bytes', null, { nullable: true }),
  field('dailyBytes', '个人每日总量 · GB（留空不限制）', 'Daily per person · GB (empty: unlimited)', 'bytes', null, { nullable: true }),
  field('monthlyBytes', '个人每月总量 · GB（留空不限制）', 'Monthly per person · GB (empty: unlimited)', 'bytes', null, { nullable: true }),
  field('maxFiles', '每任务文件数量上限', 'Files per task', 'integer', 1000, { min: 1, max: 100000 }),
  field('concurrency', '同时传输任务数', 'Concurrent tasks', 'integer', 2, { min: 1, max: 32 }),
];
const allFields = SETTINGS_SECTIONS.flatMap(s => s.fields);
export const validUid = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value);
export function defaultRule(kind = 'role', id = '') {
  return { kind, id, ...Object.fromEntries(POLICY_FIELDS.map(f => [f.key, f.value])), send: kind === 'registered', receive: kind === 'registered', links: ['lan-direct', 'wan-direct'] };
}
export function defaultSettings() {
  return { ...Object.fromEntries(allFields.map(f => [f.key, f.value])), rules: [defaultRule('anonymous'), defaultRule('registered')] };
}
export function settingsError(code, status, fields = {}) { return Object.assign(new Error(code), { code, status, fields }); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function checkFields(value, fields, prefix, errors, extra = []) {
  if (!object(value)) { errors[prefix || 'settings'] = 'object'; return; }
  const allowed = new Set([...fields.map(f => f.key), ...extra]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors[`${prefix}${key}`] = 'unknown';
  for (const f of fields) {
    const v = value[f.key]; let valid = false;
    if (v === null && f.nullable) valid = true;
    else if (f.type === 'boolean') valid = typeof v === 'boolean';
    else if (f.type === 'integer') valid = Number.isSafeInteger(v) && v >= f.min && v <= f.max;
    else if (f.type === 'bytes') { try { byteCount(v); valid = true; } catch { /* report below */ } }
    else if (f.type === 'select') valid = f.options.some(o => o[0] === v);
    else if (typeof v === 'string' && v.length <= f.max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v)) {
      valid = true;
      if (f.type === 'timezone') { try { new Intl.DateTimeFormat('en', { timeZone: v }).format(); } catch { valid = false; } }
    }
    if (!valid) errors[`${prefix}${f.key}`] = 'invalid';
  }
}
export function validateSettings(value) {
  const errors = {};
  checkFields(value, allFields, '', errors, ['rules']);
  if (!Array.isArray(value?.rules) || value.rules.length < 2 || value.rules.length > 52) errors.rules = 'count';
  else {
    const seen = new Set();
    if (value.rules[0]?.kind !== 'anonymous' || value.rules[1]?.kind !== 'registered') errors.rules = 'baseOrder';
    value.rules.forEach((r, index) => {
      const p = `rules.${index}.`;
      checkFields(r, POLICY_FIELDS, p, errors, ['kind', 'id', 'links']);
      if (!object(r)) return;
      if (!['anonymous', 'registered', 'role', 'user'].includes(r.kind)) errors[p + 'kind'] = 'invalid';
      if (['anonymous', 'registered'].includes(r.kind) ? r.id !== '' : !validUid(r.id)) errors[p + 'id'] = 'invalid';
      const key = `${r.kind}:${r.id}`;
      if (seen.has(key)) errors[p + 'id'] = 'duplicate'; seen.add(key);
      if (!Array.isArray(r.links) || r.links.length > 4 || new Set(r.links).size !== r.links.length || r.links.some(id => !TRANSPORTS.includes(id))) errors[p + 'links'] = 'invalid';
      if (r.maxFileBytes !== null && r.maxTaskBytes !== null && /^\d+$/u.test(r.maxFileBytes) && /^\d+$/u.test(r.maxTaskBytes) && BigInt(r.maxFileBytes) > BigInt(r.maxTaskBytes)) errors[p + 'maxTaskBytes'] = 'belowFile';
    });
    if (!seen.has('anonymous:') || !seen.has('registered:')) errors.rules = 'baseRequired';
  }
  try { if (value?.lanVerified && !lanNetworks(value.lanNetworks).length) errors.lanNetworks = 'required'; else lanNetworks(value?.lanNetworks); } catch { errors.lanNetworks = 'invalid'; }
  try { if(value?.wanVerified && !publicNetworks(value.wanNetworks).length)errors.wanNetworks='required';else publicNetworks(value?.wanNetworks);stunServers(value?.stunUrls); } catch { errors.wanNetworks='invalid'; }
  if (typeof value?.vpnInterface !== 'string' || /[\\/\u0000-\u001f]/u.test(value.vpnInterface) || value.vpnInterface.trim() !== value.vpnInterface || (value.vpnMeterSource === 'interface' && !value.vpnInterface)) errors.vpnInterface = 'invalid';
  if (typeof value?.vpnSourceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/u.test(value.vpnSourceId)) errors.vpnSourceId = 'invalid';
  if (value?.vpnStaleSeconds < value?.vpnPollSeconds * 2) errors.vpnStaleSeconds = 'belowPollWindow';
  if (value?.vpnDailyBytes !== null && value?.vpnMonthlyBytes !== null && /^\d+$/u.test(value.vpnDailyBytes) && /^\d+$/u.test(value.vpnMonthlyBytes) && BigInt(value.vpnDailyBytes) > BigInt(value.vpnMonthlyBytes)) errors.vpnMonthlyBytes = 'belowDaily';
  if (Object.keys(errors).length) throw settingsError('FT_VALIDATION', 422, errors);
  return structuredClone(value);
}
export function validateSubmission(value) {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'managers,revision,settings' || !Number.isSafeInteger(value.revision) || value.revision < 0) throw settingsError('FT_VALIDATION', 422, { revision: 'invalid' });
  validateSettings(value.settings);
  if (!Array.isArray(value.managers) || value.managers.length < 1 || value.managers.length > 50 || value.managers.some(id => !validUid(id)) || new Set(value.managers).size !== value.managers.length) throw settingsError('FT_VALIDATION', 422, { managers: 'invalid' });
  return structuredClone(value);
}
export function policyFor(settings, identity) {
  const base = settings.rules.find(r => r.kind === (identity.kind === 'user' ? 'registered' : 'anonymous'));
  const rule = identity.kind === 'user' ? settings.rules.find(r => r.kind === 'user' && r.id === identity.uid) || settings.rules.find(r => r.kind === 'role' && r.id === identity.roleId) || base : base;
  return { ...rule, kind: undefined, id: undefined, source: rule.kind, rateSource: { lan: rule.lanRateKbps === null ? 'global' : rule.kind, wan: rule.wanRateKbps === null ? 'global' : rule.kind }, lanRateKbps: rule.lanRateKbps ?? settings.lanRateKbps, wanRateKbps: rule.wanRateKbps ?? settings.wanRateKbps };
}
export function publicPolicy(settings, identity, usage = null, vpn = null) {
  let available = false; const accessReasons = {}, linkAccess = {};
  for (const transport of TRANSPORTS) {
    linkAccess[transport] = {};
    for (const role of ['send','receive']) { try { assertAccess(settings,identity,role,undefined,transport,vpn); linkAccess[transport][role]=null; available=true; } catch(error) { linkAccess[transport][role]=error.code; } }
  }
  for (const role of ['send','receive']) if(TRANSPORTS.every(id=>linkAccess[id][role]))accessReasons[role]=linkAccess['lan-direct'][role];
  let budgetReason;
  if (usage) for (const [name, value] of [['personal', usage.personal], ['pool', usage.guestPool]]) {
    if (!value) continue;
    if (value.activeTasks >= value.concurrency) budgetReason ||= name === 'pool' ? 'FT_GUEST_POOL_CONCURRENCY' : 'FT_CONCURRENCY';
    for (const period of ['daily', 'monthly']) if (value[period].remainingBytes === '0') budgetReason ||= (name === 'pool' ? 'FT_GUEST_POOL_' : 'FT_QUOTA_') + period.toUpperCase();
  }
  if (budgetReason) { available = false; for (const role of ['send', 'receive']) accessReasons[role] ||= budgetReason; }
  return { recovery: {hours:settings.recoveryHours,checkpointMiB:settings.checkpointMiB,automaticRetries:settings.automaticRetries}, usage, vpn, enabled: settings.enabled, accessReasons, notice: { zh: settings.noticeZh, en: settings.noticeEn }, rule: policyFor(settings, identity),
    links: TRANSPORTS.map((id,i)=>({id,configured:settings[['lanEnabled','wanEnabled','relayEnabled','shareEnabled'][i]],available:!budgetReason&&(!linkAccess[id].send||!linkAccess[id].receive),accessReasons:linkAccess[id],reason:budgetReason||transportReadiness(settings,id,vpn)||linkAccess[id].send&&linkAccess[id].receive||null})),
    vpnGuard: settings.vpnGuard, vpnBudgetConfigured: settings.vpnDailyBytes !== null && settings.vpnMonthlyBytes !== null,
    meteringAvailable: Boolean(vpn?.meterAvailable), transferAvailable: available };
}
// Decimal GB, exactly 10^9 bytes. These helpers never round a budget upward.
export function bytesToGB(value) {
  if (value === null) return '';
  const n = BigInt(byteCount(value)); const fraction = (n % 1000000000n).toString().padStart(9, '0').replace(/0+$/u, '');
  return (n / 1000000000n).toString() + (fraction ? '.' + fraction : '');
}
export function gbToBytes(value, nullable = false) {
  if (value === '' && nullable) return null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,9})?$/u.test(value)) throw new TypeError('FT_DECIMAL_GB');
  const [whole, fraction = ''] = value.split('.');
  return byteCount((BigInt(whole) * 1000000000n + BigInt(fraction.padEnd(9, '0'))).toString());
}
