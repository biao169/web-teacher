import { byteCount } from './contracts.mjs';

export const VPN_WINDOW_BYTES = 1048576;
export const VPN_WINDOW_MS = 2000;
export function bytesToUnit(value, unit = 'GB') {
  if (value === null) return '';
  const n = BigInt(value), scale = unit === 'GiB' ? 1073741824n : 1000000000n;
  if (n < 0n) throw new TypeError('FT_BYTES');
  const precision = unit === 'GiB' ? 30 : 9;
  const tail = (n % scale * (10n ** BigInt(precision)) / scale).toString().padStart(precision, '0').replace(/0+$/u, '');
  return (n / scale).toString() + (tail ? '.' + tail : '');
}
export function unitToBytes(value, unit = 'GB', nullable = false) {
  if (value === '' && nullable) return null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,30})?$/u.test(value)) throw new TypeError('FT_BYTES');
  const [whole, fraction = ''] = value.split('.'), divisor = 10n ** BigInt(fraction.length);
  return byteCount(((BigInt(whole) * divisor + BigInt(fraction || '0')) * (unit === 'GiB' ? 1073741824n : 1000000000n) / divisor).toString());
}
export function billedBytes(rx, tx, billing) { return (billing === 'outbound' ? 0n : BigInt(rx)) + (billing === 'inbound' ? 0n : BigInt(tx)); }
export const VPN_REASONS = {
  FT_VPN_DISABLED: ['VPN 额度保护已关闭，计费链路保持禁用。', 'VPN budget protection is off; metered paths stay closed.'],
  FT_VPN_UNCONFIGURED: ['请先配置 VPN 每日和每月额度。', 'Configure both daily and monthly VPN budgets.'],
  FT_METER_UNCONFIGURED: ['尚未接入出口统计。', 'Exit usage is not connected.'],
  FT_METER_SCOPE: ['出口统计覆盖范围尚未核验。', 'The usage coverage has not been verified.'],
  FT_METER_BASELINE: ['需先填写今日及本月已用流量。', 'Enter the usage already consumed today and this month.'],
  FT_METER_UNAVAILABLE: ['出口统计暂时不可用，计费链路已停用。', 'Exit usage is unavailable; metered paths are disabled.'],
  FT_METER_STALE: ['出口统计已过期，等待新数据后再判断额度。', 'Exit usage is stale. Waiting for a fresh sample.'],
  FT_METER_RESET: ['出口计数器重置或更换，请核对账单后重新校准。', 'The exit counter reset or changed. Check billing and recalibrate.'],
  FT_METER_CHANGED: ['统计来源或计费规则已更改，请重新校准。', 'The source or billing rules changed. Recalibrate usage.'],
  FT_METER_INVALID: ['出口数据格式或计费周期不匹配。', 'Exit data or billing periods do not match.'],
  FT_VPN_DAILY: ['今日 VPN 可用额度不足，相关链路已禁用。', 'The daily VPN budget is insufficient; affected paths are disabled.'],
  FT_VPN_MONTHLY: ['本月 VPN 可用额度不足，相关链路已禁用。', 'The monthly VPN budget is insufficient; affected paths are disabled.'],
  FT_VPN_HARD_GATE_REQUIRED: ['严格模式：尚未接入可核验的出口硬限额／断流能力。', 'Strict mode: a verifiable enforced exit cap is not connected.'],
  FT_VPN_PATH_UNKNOWN: ['无法确认是否经过 VPN，当前规则禁止此路径。', 'The VPN route is unknown and blocked by the current policy.'],
  FT_VPN_LEASE: ['本次流量授权已过期或撤销，传输已停止。', 'This traffic grant expired or was revoked. Transfer stopped.'],
  FT_VPN_RECONCILE: ['请等待活动预留结束，并核对最新出口用量。', 'Wait for active reservations to end and verify the latest exit usage.'],
};
export function vpnReason(code, zh = true) { return VPN_REASONS[code]?.[zh ? 0 : 1] || (zh ? '请检查出口统计与额度设置。' : 'Check exit usage and budget settings.'); }
