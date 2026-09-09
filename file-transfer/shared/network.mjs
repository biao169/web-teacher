import { ipv4, addressAllowed, lanReadiness, lanError, PAIR_LIMITS } from './lan.mjs';
export const CONTROL_MANIFEST_BYTES = 262144;
export const SERVER_FRAME_BYTES = 24576;
const excluded = [[0,0x00ffffff],[0x0a000000,0x0affffff],[0x64400000,0x647fffff],[0x7f000000,0x7fffffff],[0xa9fe0000,0xa9feffff],[0xac100000,0xac1fffff],[0xc0000000,0xc00000ff],[0xc0000200,0xc00002ff],[0xc0a80000,0xc0a8ffff],[0xc6120000,0xc613ffff],[0xc6336400,0xc63364ff],[0xcb007100,0xcb0071ff],[0xe0000000,0xffffffff]];
export function publicNetworks(text='') {
  if(typeof text!=='string'||text.length>1000)throw lanError('FT_WAN_CONFIG',422);
  const list=text.trim()?text.trim().split(/[\s,;]+/u):[];if(list.length>16)throw lanError('FT_WAN_CONFIG',422);
  return list.map(cidr=>{const [ip,bits,extra]=cidr.split('/'),n=ipv4(ip),mask=Number(bits),width=2**(32-mask);
    if(extra!==undefined||n===null||!/^(8|9|[12]\d|3[0-2])$/u.test(bits||'')||n%width||excluded.some(([low,high])=>n<=high&&n+width-1>=low))throw lanError('FT_WAN_CONFIG',422);
    return{cidr,low:n,high:n+width-1};});
}
export function stunServers(text='') {
  if(typeof text!=='string'||text.length>1000)throw lanError('FT_WAN_CONFIG',422);
  const list=text.trim()?text.trim().split(/\s+/u):[];if(list.length>3)throw lanError('FT_WAN_CONFIG',422);
  for(const url of list)if(!/^stuns?:[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?(?::[1-9]\d{0,4})?$/u.test(url)||Number(url.match(/:(\d+)$/u)?.[1]||3478)>65535)throw lanError('FT_WAN_CONFIG',422);
  return list.map(url=>({urls:url}));
}
export function serverPath(settings) {
  if(settings.serverVpnPath==='confirmed-outside-vpn'&&!settings.serverOutsideVerified)throw lanError('FT_SERVER_UNVERIFIED',403);
  return settings.serverVpnPath||'unknown';
}
export function transportReadiness(s, transport, vpn=null) {
  if(transport==='lan-direct')return lanReadiness(s);
  if(!s.enabled)return 'FT_TOOL_DISABLED';
  if(transport==='wan-direct')return !s.wanEnabled?'FT_TOOL_DISABLED':!s.wanVerified||!publicNetworks(s.wanNetworks).length?'FT_WAN_UNVERIFIED':null;
  if(!['server-relay','temporary-share'].includes(transport))return 'FT_PROTOCOL';
  if(!(transport==='server-relay'?s.relayEnabled:s.shareEnabled))return 'FT_TOOL_DISABLED';
  let path;try{path=serverPath(s)}catch(e){return e.code}
  if(path==='confirmed-outside-vpn')return null;
  if(path==='unknown'&&s.vpnUnknownPath!=='meter')return 'FT_VPN_PATH_UNKNOWN';
  return vpn?.reason || (!vpn?.eligibleForControlledTransfer?'FT_METER_UNAVAILABLE':null);
}
export function wanCandidates(description, networks) {
  return description.sdp.split(/\r?\n/u).filter(l=>l.startsWith('a=candidate:')).flatMap(line=>{
    const p=line.slice(2).trim().split(/\s+/u),port=Number(p[5]);
    if(p[1]!=='1'||p[2]?.toLowerCase()!=='udp'||!['host','srflx'].includes(p[7])||!addressAllowed(p[4],networks)||!Number.isInteger(port)||port<1||port>65535)return[];
    const at=p.indexOf('raddr'),rp=p.indexOf('rport');return[{line,address:p[4],port,type:p[7],protocol:'udp',relatedAddress:at<0?null:p[at+1],relatedPort:rp<0?null:Number(p[rp+1])}];});
}
export function safeWanDescription(description,networks) {
  if(!description||!['offer','answer'].includes(description.type)||typeof description.sdp!=='string'||description.sdp.length>PAIR_LIMITS.signalBytes-1000)throw lanError('FT_PROTOCOL');
  const lines=description.sdp.split(/\r?\n/u);
  if(lines.filter(l=>l.startsWith('m=')).length!==1||!lines.some(l=>/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/u.test(l))||!lines.some(l=>l.startsWith('a=fingerprint:sha-256 ')))throw lanError('FT_PROTOCOL');
  const candidates=wanCandidates(description,networks);if(!candidates.length)throw lanError('FT_WAN_ADDRESS_HIDDEN');
  return{type:description.type,sdp:lines.filter(l=>!l.startsWith('a=candidate:')&&!l.startsWith('a=remote-candidates:')&&!l.startsWith('a=ice-options:')||candidates.some(c=>c.line===l)).join('\r\n')};
}
export function validateWanRoute(route,networks) {
  if(!route?.local||!route?.remote)throw lanError('FT_ROUTE_UNKNOWN');
  for(const c of [route.local,route.remote])if(!['host','srflx'].includes(c.type)||c.protocol!=='udp'||!Number.isInteger(c.port)||c.port<1||c.port>65535||!addressAllowed(c.address,networks))throw lanError('FT_ROUTE_UNKNOWN');
  return route;
}
export const NETWORK_REASONS={
 FT_CLOUD_BUDGET:['云端今日或本月文件流量额度不足，此链路暂时停用。局域网直连不受此额度限制。','Cloud file traffic allowance is insufficient. This connection is paused; LAN direct is unaffected.'],
 FT_WAN_UNVERIFIED:['尚未配置并核验远程直连的公网范围。','Internet direct ranges have not been configured and verified.'],
 FT_WAN_ADDRESS_HIDDEN:['未发现已核验的公网候选，可选择受控中继。','No verified public candidate was found. Try controlled relay.'],
 FT_SERVER_UNVERIFIED:['服务器出口是否绕开受限 VPN 尚未核验。','The server exit has not been verified outside the limited VPN.'],
 FT_SHARE_UNAVAILABLE:['分享不存在、已到期、已撤销或领取次数已用完。','This share is unavailable, expired, revoked or fully claimed.'],
 FT_STORAGE_FULL:['临时存储空间或分享数量已达到上限。','Temporary storage or share count has reached its limit.'],
 FT_SHARE_TOO_LARGE:['临时分享／中继的清单上限为 256 KiB，请减少文件数量或缩短路径。','Share/relay manifests are limited to 256 KiB. Use fewer files or shorter paths.'],
 FT_SERVER_STORAGE:['暂存文件读写未完成，请联系管理员检查独立存储目录。','Temporary storage could not be read or written. Ask an administrator to check it.'],
};
