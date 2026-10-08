export async function paused(env){
 if(String(env.TEACHER_SYNC_PAUSED||'0')==='1')return true;
 const row=await env.DB.prepare("SELECT value FROM service_meta WHERE key=?").bind('site_sync.paused.v1').first();
 return Boolean(row&&row.value!==undefined&&row.value!=='0');
}
