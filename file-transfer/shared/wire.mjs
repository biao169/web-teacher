import { PAIR_LIMITS, lanError } from './lan.mjs';
export function encodeWire(value) {
  if(typeof value==='string'){if(value.length>1024)throw lanError('FT_PROTOCOL');return{binary:false,data:value};}
  const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
  if(bytes.length>PAIR_LIMITS.frameBytes)throw lanError('FT_PROTOCOL');
  return{binary:true,data:btoa(String.fromCharCode(...bytes))};
}
export function decodeWire(value) {
  if(!value||Object.keys(value).sort().join(',')!=='binary,data'||typeof value.binary!=='boolean'||typeof value.data!=='string')throw lanError('FT_PROTOCOL');
  if(!value.binary){if(value.data.length>1024)throw lanError('FT_PROTOCOL');return value.data;}
  if(value.data.length>Math.ceil(PAIR_LIMITS.frameBytes/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value.data))throw lanError('FT_PROTOCOL');
  const text=atob(value.data);if(btoa(text)!==value.data||text.length>PAIR_LIMITS.frameBytes)throw lanError('FT_PROTOCOL');
  return Uint8Array.from(text,c=>c.charCodeAt(0)).buffer;
}
export const wireBytes=value=>new TextEncoder().encode(JSON.stringify({type:'relay',wire:value})).length;
export class WireChannel extends EventTarget {
  constructor(send,onClose=()=>{}){super();this.deliver=send;this.onClose=onClose;this.readyState='open';this.bufferedAmount=0;this.label='file-transfer-v1';this.ordered=true;this.maxRetransmits=null;this.maxPacketLifeTime=null;}
  send(value){if(this.readyState!=='open')throw lanError('FT_CONNECTION_CLOSED');this.deliver(encodeWire(value));}
  receive(wire){if(this.readyState!=='open')return;const event=new Event('message');Object.defineProperty(event,'data',{value:decodeWire(wire)});this.dispatchEvent(event);}
  close(){if(this.readyState==='closed')return;this.readyState='closed';this.dispatchEvent(new Event('close'));this.onClose();}
}
