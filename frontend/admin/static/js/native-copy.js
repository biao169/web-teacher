/** One text-only clipboard action for lists/details; never opens mail or sends a request. */
import {notify} from './native-notifications.js';
export async function copyText(value){
 // Prefer Clipboard API; HTTP/older-browser fallback remains tied to the explicit click.
 if(navigator.clipboard){try{await navigator.clipboard.writeText(value);return}catch(error){/* Use the local selection fallback. */}}
 const field=document.createElement('textarea'),focused=document.activeElement;
 field.value=value;field.readOnly=true;field.className='native-copy-buffer';document.body.append(field);field.select();
 try{if(!document.execCommand('copy'))throw new Error('浏览器未允许复制，请手动选择文字复制。')}
 finally{field.remove();focused?.focus({preventScroll:true})}
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-copy-value]');if(!button)return;
 button.disabled=true;
 try{await copyText(button.dataset.copyValue);notify((button.dataset.copyLabel||'内容')+'已复制','success',{id:'copy'})}
 catch(error){notify(error.message,'error',{id:'copy'})}
 finally{button.disabled=false}
});
