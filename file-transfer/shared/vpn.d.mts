export const VPN_WINDOW_BYTES:number;
export const VPN_WINDOW_MS:number;
export function bytesToUnit(value:string|null, unit?:'GB'|'GiB'):string;
export function unitToBytes(value:string, unit?:'GB'|'GiB', nullable?:boolean):string|null;
export function billedBytes(rx:string|bigint,tx:string|bigint,billing:string):bigint;
export function vpnReason(code:string,zh?:boolean):string;
export const VPN_REASONS:Record<string,[string,string]>;
