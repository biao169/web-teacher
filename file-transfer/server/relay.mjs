import { pullGuard } from './pull-guard.mjs';
import { createTrafficGate } from './traffic-gate.mjs';
import { decodeWire,wireBytes } from '../shared/wire.mjs';
import { lanError } from '../shared/lan.mjs';
export function createRelay({storage,room,check,send,end,rateKbps,resumePoint=null,now=Date.now}) {
  const controller=new AbortController(),guard=pullGuard(room.summary,resumePoint),gate=createTrafficGate(storage,check,{rateKbps,signal:controller.signal,now});
  let lease=null,pending=false,busy=false,beaconAt=0,started=false;
  const watch=setInterval(()=>{try{check();lease?.assert();if(lease&&now()>=lease.expiresAt)throw lanError('FT_VPN_LEASE')}catch(e){end(e.code||'FT_CONNECTION_CLOSED')}},100);watch.unref?.();
  return{
    async wire(peer,wire){check();const value=decodeWire(wire);
      if(peer===room.sender&&typeof value==='string'&&value==='{"type":"ready"}'){
        if(!started&&now()>=beaconAt){beaconAt=now()+500;send(room.receiver,{type:'relay',wire});}return;
      }
      if(peer===room.receiver){
        if(busy||pending)throw lanError('FT_PROTOCOL');busy=true;
        try{const request=guard.request(value),response=request.request.type==='read'?Math.ceil(request.maxResponseBytes/3)*4+512:6656,total=response+wireBytes(wire);
          await gate.pace(total);lease=gate.reserve(total,total);pending=true;started=true;send(room.sender,{type:'relay',wire});
        }finally{busy=false}
      }else{
        if(!pending||!lease)throw lanError('FT_PROTOCOL');lease.assert();guard.response(value);send(room.receiver,{type:'relay',wire});lease.finish();lease=null;pending=false;
      }
    },
    point:()=>guard.point(),
    complete:()=>guard.complete(),
    close(){controller.abort();clearInterval(watch);lease?.finish();lease=null;},
  };
}
