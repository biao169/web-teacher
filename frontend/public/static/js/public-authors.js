/* Reuse the existing pure author matching helper; never alter stored author/citation text. */
import {authorMarkers} from '/assets/admin/js/native-corresponding-authors.js?v=0.15.40';
export function paintAuthors(root=document){
  for(const host of root.querySelectorAll('[data-citation-highlight]')){
    if(host.dataset.highlightPainted)continue;
    host.dataset.highlightPainted='1';
    const source=host.textContent,ranges=[];
    for(const token of new Set(host.dataset.citationHighlight.split(/[；;\n]/u).map(x=>x.trim()).filter(Boolean))){
      let from=0,index;
      while((index=source.indexOf(token,from))!==-1){
        const end=index+token.length;
        if(!/[\p{L}\p{N}]/u.test(source[index-1]||'')&&!/[\p{L}\p{N}]/u.test(source[end]||''))ranges.push({start:index,end});
        from=end;
      }
    }
    ranges.sort((a,b)=>a.start-b.start||b.end-a.end);
    const fragment=document.createDocumentFragment();let cursor=0;
    for(const match of ranges){if(match.start<cursor)continue;fragment.append(document.createTextNode(source.slice(cursor,match.start)));const strong=document.createElement('strong');strong.textContent=source.slice(match.start,match.end);fragment.append(strong);cursor=match.end;}
    fragment.append(document.createTextNode(source.slice(cursor)));host.replaceChildren(fragment);
  }
  for(const host of root.querySelectorAll('[data-public-authors]')){
    if(!host.dataset.corresponding)continue;
    const rows=authorMarkers(host.dataset.authors,host.dataset.corresponding);
    host.replaceChildren();
    rows.forEach((row,index)=>{
      if(index)host.append(document.createTextNode('；'));
      const name=document.createElement(row.corresponding?'strong':'span');name.textContent=row.name;
      if(row.corresponding){const star=document.createElement('sup');star.textContent='*';star.title=document.documentElement.lang==='en'?'Corresponding author':'通讯作者';name.append(star);}
      host.append(name);
    });
  }
}
paintAuthors();document.addEventListener('public:appended',event=>paintAuthors(event.target));
