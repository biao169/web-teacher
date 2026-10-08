// Browser status reads only; never invokes executor or task mutation endpoints.
export function createStatusPoller({run,visible=()=>true,blocked=()=>false,onError=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}){
 let enabled=true,timer=null,running=false,started=false;
 const clear=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 const schedule=()=>{clear();if(started&&enabled&&visible()&&!running)timer=setTimer(tick,60000);};
 async function tick(){timer=null;if(!started||!enabled||!visible())return;if(blocked()){schedule();return;}running=true;try{await run();}catch(e){onError(e);}finally{running=false;schedule();}}
 return {get enabled(){return enabled;},start(){started=true;schedule();},stop(){started=false;clear();},setEnabled(value){enabled=!!value;schedule();},visibilityChanged(){started=true;schedule();}};
}
