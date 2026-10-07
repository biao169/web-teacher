// Same storage contract as integration/credentials.py. No process cache.
function invalid(){return Object.assign(new Error('Sync credential unavailable'),{kind:'credential'});}
function normalize(value){
 if(typeof value!=='string'||value.length>128)throw invalid();
 value=value.trim();if(!/^[a-fA-F0-9]{64}$/.test(value))throw invalid();return value;
}
export async function resolveSecret(env){
 const row=await env.DB.prepare('SELECT value FROM service_meta WHERE key=?').bind('site_sync.credentials.v1').first();
 let value;
 if(row){
  try{
   if(typeof row.value!=='string'||row.value.length>2048)throw invalid();
   const d=JSON.parse(row.value);
   if(!d||d.version!==1||!['revision','updated_at','updated_by'].every(k=>typeof d[k]==='string'))throw invalid();
   value=normalize(d.key);
  }catch{throw invalid();}
 }else value=normalize(env.TEACHER_SYNC_KEY);
 return Uint8Array.from(value.match(/../g),x=>parseInt(x,16));
}
