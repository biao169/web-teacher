/** Display-only author markers; author/citation values are never rewritten. */
import {splitPublicationAuthors} from './publication-tools.mjs?v=0.15.40';
export function authorMarkers(authors,corresponding){
 const key=value=>value.normalize('NFC').replace(/\s+/gu,' ').trim().toLocaleLowerCase();
 const marked=new Set(splitPublicationAuthors(corresponding).map(key));
 return splitPublicationAuthors(authors).map(name=>({name,corresponding:marked.has(key(name))}));
}
export function paintAuthorMarkers(host,authors,corresponding){
 host.replaceChildren();
 const rows=authorMarkers(authors,corresponding);
 rows.forEach((row,index)=>{if(index)host.append(document.createTextNode('；'));const name=document.createElement('span');name.textContent=row.name;if(row.corresponding){const star=document.createElement('sup');star.textContent='*';star.title='通讯作者';star.setAttribute('aria-label','通讯作者');name.append(star)}host.append(name)});
 const unmatched=authorMarkers(corresponding,authors).filter(row=>!row.corresponding).map(row=>row.name);
 if(unmatched.length){const note=document.createElement('small');note.className='native-muted';note.textContent='通讯作者姓名待核对：'+unmatched.join('；');host.append(note)}
 if(!rows.length)host.textContent='填写作者后显示姓名；与通讯作者项一致的姓名右侧显示 *。';
}
