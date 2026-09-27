/** Caret-aware multi-value replacement; commas inside names and institutions remain literal. */
export function historyFragment(value,caret=value.length,multiple=false){
 const position=Math.max(0,Math.min(value.length,caret??value.length));
 let start=0,end=value.length;
 if(multiple){
  for(let i=position-1;i>=0;i--)if(/[;；\r\n]/u.test(value[i])){start=i+1;break}
  for(let i=position;i<value.length;i++)if(/[;；\r\n]/u.test(value[i])){end=i;break}
 }
 const current=value.slice(start,end),leading=current.match(/^\s*/u)[0],trailing=current.trim()?current.match(/\s*$/u)[0]:'';
 const exclude=multiple?(value.slice(0,start)+';'+value.slice(end)).split(/[;；\r\n]/u).map(v=>v.trim()).filter(v=>v&&v.length<=240).slice(0,50):[];
 return {query:current.trim(),exclude,start,end,leading,trailing,signature:JSON.stringify([value,position,multiple])};
}
export function replaceHistoryFragment(value,fragment,candidate){
 const text=value.slice(0,fragment.start)+fragment.leading+candidate+fragment.trailing+value.slice(fragment.end);
 return {value:text,caret:fragment.start+fragment.leading.length+candidate.length};
}
