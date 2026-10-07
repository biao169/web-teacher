/** Measure intrinsic action grids without a table-width feedback loop or runtime dependencies. */
export function observeActionColumn(table){
 let frame=0;
 const observed=new WeakSet();
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure)};
 const sizes=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 function measure(){
  // max-content grids can shrink as well as grow, independently of the previous column width.
  frame=0;let width=40;
  table.querySelectorAll('.native-row-actions').forEach(grid=>{
   const count=[...grid.children].filter(button=>!button.hidden&&getComputedStyle(button).display!=='none').length;
   const columns=String(Math.min(3,count)||1);
   if(grid.style.getPropertyValue('--action-count')!==columns)grid.style.setProperty('--action-count',columns);
   const cell=grid.closest('.native-actions'),style=getComputedStyle(cell);
   width=Math.max(width,Math.ceil(grid.getBoundingClientRect().width+parseFloat(style.paddingLeft)+parseFloat(style.paddingRight)+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth)));
   if(!observed.has(grid)){sizes?.observe(grid);observed.add(grid)}
  });
  table.querySelectorAll('.native-actions').forEach(cell=>{
   if(cell.style.width!==width+'px'){cell.style.width=width+'px';cell.style.minWidth=width+'px'}
  });
 }
 // Observe only actionable content; ignore our own cell/grid style writes to avoid observer loops.
 const mutations=new MutationObserver(records=>{
  if(records.some(record=>record.type!=='attributes'||record.target.matches('.native-row-actions > *')))schedule();
 });
 mutations.observe(table,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','style']});
 window.addEventListener('resize',schedule);
 document.fonts?.ready.then(schedule);document.fonts?.addEventListener('loadingdone',schedule);
 schedule();
 // No polling or persistent resources survive navigation; callers may explicitly detach a removed table.
 return ()=>{cancelAnimationFrame(frame);sizes?.disconnect();mutations.disconnect();window.removeEventListener('resize',schedule);document.fonts?.removeEventListener('loadingdone',schedule)};
}
