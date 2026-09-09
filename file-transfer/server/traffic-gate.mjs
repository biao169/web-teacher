import { serverPath } from '../shared/network.mjs';
import { lanError } from '../shared/lan.mjs';
export function createTrafficGate(storage,check,{rateKbps=null,signal,now=Date.now}={}) {
  let nextAt=0;
  async function pace(bytes) {
    check();if(signal?.aborted)throw lanError('FT_CANCELLED');
    if(rateKbps!==null){const delay=Math.max(0,nextAt-now());nextAt=Math.max(now(),nextAt)+bytes*8/rateKbps;
      if(delay)await new Promise((ok,fail)=>{const done=()=>{signal?.removeEventListener('abort',abort);ok()};const timer=setTimeout(done,delay);const abort=()=>{clearTimeout(timer);fail(lanError('FT_CANCELLED'))};signal?.addEventListener('abort',abort,{once:true})});}
    check();if(signal?.aborted)throw lanError('FT_CANCELLED');
  }
  function reserve(rx,tx) {
    check();storage.cloudBudget?.consume(rx,tx);const path=serverPath(storage.readSettings().settings);
    if(path==='confirmed-outside-vpn')return{assert:check,finish(){},expiresAt:now()+2000};
    const lease=storage.vpn.reserve({rxBytes:String(rx),txBytes:String(tx),path},now());
    // Issue before asking the remote client to send the authorized response.
    storage.vpn.spend(lease.token,{sequence:1,rxBytes:String(rx),txBytes:String(tx)},now());
    return{assert(){check();storage.vpn.assertGrant(lease.token,now())},finish(){storage.vpn.finish(lease.token,now())},expiresAt:lease.expiresAt};
  }
  return{pace,reserve};
}
