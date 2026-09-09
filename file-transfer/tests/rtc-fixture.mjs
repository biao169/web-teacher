// Inspectable RTC adapter only; no real ICE or browser network is exercised.
import assert from 'node:assert/strict';
export function rtcAdapters({wan=false,iceServers=[]}={}){const peers=[];
 class Channel extends EventTarget {
  label='file-transfer-v1';ordered=true;maxRetransmits=null;maxPacketLifeTime=null;readyState='connecting';bufferedAmount=0;
  send(data){if(this.readyState!=='open')throw Error('closed');if(typeof data!=='string')data=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);setImmediate(()=>{if(this.other.readyState==='open')this.other.dispatchEvent(new MessageEvent('message',{data}))})}
  close(){this.readyState='closed'}
 }
 return class RTC extends EventTarget {
  constructor(options){super();assert.deepEqual(options.iceServers,iceServers);this.id=peers.length+2;peers.push(this);this.iceGatheringState='complete';this.sctp={maxMessageSize:65536};this.connectionState='new';}
  createDataChannel(){this.channel=new Channel();return this.channel}
  description(type){return{type,sdp:`v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 AB:CD\r\na=candidate:1 1 udp 1 ${wan?'8.8.8.':'192.168.1.'}${this.id} ${wan?6000+this.id:5000+this.id} typ ${wan?'srflx raddr 192.168.1.'+this.id+' rport '+(5000+this.id):'host'}\r\n`}}
  async createOffer(){return this.description('offer')} async createAnswer(){return this.description('answer')}
  async setLocalDescription(d){this.localDescription=d}
  async setRemoteDescription(d){this.other=peers.find(p=>p!==this&&p.description(d.type).sdp===d.sdp);if(d.type==='offer'){this.channel=new Channel();this.channel.other=this.other.channel;this.other.channel.other=this.channel;const event=new Event('datachannel');event.channel=this.channel;this.dispatchEvent(event)}else{this.connectionState=this.other.connectionState='connected';setImmediate(()=>{for(const c of[this.channel,this.other.channel]){c.readyState='open';c.dispatchEvent(new Event('open'))}})}}
  async getStats(){return new Map([['t',{type:'transport',selectedCandidatePairId:'p'}],['p',{state:'succeeded',localCandidateId:'a',remoteCandidateId:'b'}],['a',{address:`192.168.1.${this.id}`,port:5000+this.id,candidateType:'host',protocol:'udp'}],['b',{address:`${wan?'8.8.8.':'192.168.1.'}${this.other.id}`,port:(wan?6000:5000)+this.other.id,candidateType:wan?'srflx':'host',protocol:'udp'}]])}
  close(){this.connectionState='closed';this.channel?.close()}
 }
}
