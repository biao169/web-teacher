/** Column visibility and widths share one versioned, per-module preference controller. */
export function setupColumns(root, table, transient = null) {
 const events=new AbortController(),on=(node,type,handler)=>node.addEventListener(type,handler,{signal:events.signal});
 const boxes=[...root.querySelectorAll('[data-column-toggle]')];
 const headers=new Map([...table.querySelectorAll('th[data-column]')].map(th=>[th.dataset.column,th]));
 const columns=[...headers.keys()],first=columns[0],defaults=new Set(boxes.filter(b=>b.dataset.defaultVisible==='1').map(b=>b.dataset.columnToggle));
 const legacyKey='teacher-native-columns:'+root.dataset.table,key='teacher-native-columns:v2:'+root.dataset.table;
 const feedback=root.querySelector('[data-column-feedback]');

 function read(name) {
  // Browser storage can be disabled or malformed; neither may prevent normal table use.
  try {const text=localStorage.getItem(name);return text&&text.length<=100000?JSON.parse(text):null} catch {return null}
 }
 function sanitize(value) {
  // Only server-approved column names and finite drag widths can affect layout.
  const result=Object.create(null);
  if(!value||typeof value!=='object'||Array.isArray(value))return result;
  for(const col of columns){
   const item=value[col];if(!item||typeof item!=='object'||Array.isArray(item))continue;
   const entry={};
   if(typeof item.hidden==='boolean'&&col!==first)entry.hidden=item.hidden;
   if(typeof item.width==='number'&&Number.isFinite(item.width)&&item.width>=65&&item.width<=800)entry.width=item.width;
   if(Object.keys(entry).length)result[col]=entry;
  }
  return result;
 }
 const previous=sanitize(read(legacyKey)),raw=read(key),saved=sanitize(raw?.version===2?raw.columns:null);
 // Old visibility was written automatically on every load; adopt widths but await an explicit restore for visibility.
 for(const col of columns)if(saved[col]?.width===undefined&&previous[col]?.width!==undefined)saved[col]={...saved[col],width:previous[col].width};
 // A list-only refresh retains current choices even when browser storage is unavailable.
 Object.assign(saved,sanitize(transient));
 function persist(message) {
  // Called only by user changes; never overwrite or remove the recoverable legacy key.
  try {localStorage.setItem(key,JSON.stringify({version:2,columns:saved}));feedback.textContent=message}
  catch {feedback.textContent='已在本页应用；浏览器未能保存列偏好，刷新后可能恢复。'}
 }
 function visibility() {
  // The first field and operation/selection columns cannot be hidden through saved preferences.
  for(const box of boxes){
   const col=box.dataset.columnToggle,visible=col===first||(saved[col]?.hidden===undefined?defaults.has(col):!saved[col].hidden);
   box.checked=visible;table.querySelectorAll(`[data-column="${col}"]`).forEach(cell=>cell.hidden=!visible);
  }
  // Empty results span visible columns only, avoiding phantom space after the action column.
  const empty=table.querySelector('[data-empty-columns]');if(empty)empty.colSpan=boxes.filter(box=>box.checked).length+2;
 }
 let context=null;try{context=document.createElement('canvas').getContext('2d')}catch{}
 if(context)context.font=getComputedStyle(table).font;
 const widths=new Map();
 for(const [col,th] of headers){
  const values=[th.textContent,...[...table.querySelectorAll(`td[data-column="${col}"]`)].slice(0,30).map(td=>td.textContent.trim())];
  const measured=Math.min(330,Math.max(85,...values.map(text=>(context?context.measureText(text.slice(0,120)).width:text.slice(0,120).length*14)+24)));
  widths.set(col,saved[col]?.width??(root.dataset.table==='media_assets'&&col==='size'?100:measured));
 }
 function paintWidths() {
  // Keep the frozen name usable on narrow screens without destroying the stored desktop width.
  for(const [col,th] of headers){
   const width=col===first&&innerWidth<=640?Math.min(140,widths.get(col)):widths.get(col);
   th.style.width=width+'px';th.style.minWidth=width+'px';
  }
 }
 for(const [col,th] of headers){
  const grip=th.querySelector('[data-resize]');
  on(grip,'pointerdown',event=>{
   if(event.button!==0)return;
   event.preventDefault();event.stopPropagation();grip.setPointerCapture(event.pointerId);
   const start=event.clientX,initial=th.getBoundingClientRect().width,oldWidth=widths.get(col);let changed=false;
   // Track only this pointer and constrain live widths without writing storage on each move.
   const move=next=>{
    if(next.pointerId!==event.pointerId)return;
    const width=Math.max(65,Math.min(800,initial+next.clientX-start));
    changed=Math.abs(next.clientX-start)>=1;widths.set(col,width);paintWidths();
   };
   // Cancel restores the previous width; a completed drag persists once.
   const end=next=>{
    if(next.pointerId!==event.pointerId)return;
    grip.removeEventListener('pointermove',move);grip.removeEventListener('pointerup',end);grip.removeEventListener('pointercancel',end);
    if(next.type==='pointercancel'||!changed){widths.set(col,oldWidth);paintWidths();return}
    saved[col]={...saved[col],width:widths.get(col)};persist('列宽已保存；仅影响当前功能。');
   };
   on(grip,'pointermove',move);on(grip,'pointerup',end);on(grip,'pointercancel',end);
  });
 }
 boxes.forEach(box=>on(box,'change',()=>{
  const col=box.dataset.columnToggle;if(col===first){visibility();return}
  saved[col]={...saved[col],hidden:!box.checked};visibility();persist('显示列已保存；仅影响当前功能。');
 }));
 on(root.querySelector('[data-columns-recommended]'),'click',()=>{
  for(const col of columns)saved[col]={...saved[col],hidden:!defaults.has(col)};
  visibility();persist('已恢复推荐列，保留当前列宽。');
 });
 const restore=root.querySelector('[data-columns-legacy]');
 restore.hidden=!Object.values(previous).some(item=>typeof item.hidden==='boolean');
 on(restore,'click',()=>{
  for(const col of columns)saved[col]={...saved[col],hidden:previous[col]?.hidden??!defaults.has(col)};
  visibility();persist('已恢复旧版显隐方案，保留当前列宽。');
 });
 visibility();paintWidths();window.addEventListener('resize',paintWidths);
 root.querySelector('[data-column-controls]').disabled=false;
 return {
  snapshot:()=>Object.fromEntries(columns.map(col=>[col,{hidden:col!==first&&!boxes.find(b=>b.dataset.columnToggle===col).checked,width:widths.get(col)}])),
  dispose:()=>{events.abort();window.removeEventListener('resize',paintWidths)},
 };
}
