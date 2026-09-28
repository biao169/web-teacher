/** Shared page selection for record lists and inventory reports. */
export function mountTableSelection(root){
 const events=new AbortController(),boxes=()=>[...root.querySelectorAll('[data-select-row]')],all=root.querySelector('[data-select-all]'),count=root.querySelector('[data-selected-count]');
 const chosen=()=>boxes().filter(box=>box.checked).map(box=>box.closest('tr'));
 function paint(){
  const items=boxes(),n=chosen().length;
  if(count)count.textContent=`已选 ${n} 项`;
  if(all){all.checked=!!items.length&&n===items.length;all.indeterminate=n>0&&n<items.length}
 }
 all?.addEventListener('change',()=>{boxes().forEach(box=>{if(!box.disabled)box.checked=all.checked});paint()},{signal:events.signal});
 root.addEventListener('change',event=>{if(event.target.matches('[data-select-row]'))paint()},{signal:events.signal});
 root.querySelector('[data-selection-clear]')?.addEventListener('click',()=>{boxes().forEach(box=>box.checked=false);paint()},{signal:events.signal});
 paint();return {chosen,paint,dispose:()=>events.abort()};
}
