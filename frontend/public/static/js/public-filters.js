/* One progressive select enhancement; native selects still own form values. */
(() => {
  'use strict';
  const form=document.querySelector('[data-person-form]');if(!form)return;
  let opened=null;
  const controls=[];
  function visible(node){return !node.disabled&&!node.closest('[hidden]');}
  function close(restore=false){
    if(!opened)return;
    const s=opened;opened=null;s.panel.hidden=true;s.trigger.setAttribute('aria-expanded','false');
    s.list.removeAttribute('aria-activedescendant');if(restore)s.trigger.focus({preventScroll:true});
  }
  function position(s){
    const rect=s.trigger.getBoundingClientRect(),viewport=window.visualViewport;
    const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight,top=viewport?.offsetTop||0,left=viewport?.offsetLeft||0;
    if(rect.bottom<top||rect.top>top+height){close();return;}
    s.panel.style.maxWidth=Math.max(0,Math.min(width-24,608))+'px';s.panel.style.maxHeight=Math.max(0,height-24)+'px';
    const panel=s.panel.getBoundingClientRect(),below=top+height-rect.bottom-17,above=rect.top-top-17;
    const useBelow=below>=Math.min(panel.height,220)||below>=above,available=Math.max(0,useBelow?below:above);
    const overlay=available<120,limit=Math.max(0,Math.min(height-24,overlay?360:available,360));
    s.panel.style.maxHeight=limit+'px';
    s.panel.style.left=Math.max(left+12,Math.min(rect.left,left+width-panel.width-12))+'px';
    s.panel.style.top=(overlay?top+12:Math.max(top+12,useBelow?rect.bottom+5:rect.top-Math.min(panel.height,limit)-5))+'px';
  }
  function active(s,index){
    s.active=Math.max(0,Math.min(index,s.options.length-1));
    s.options.forEach((node,i)=>node.classList.toggle('is-active',i===s.active));
    const node=s.options[s.active];if(!node)return;
    s.list.setAttribute('aria-activedescendant',node.id);
    node.scrollIntoView?.({block:'nearest'});
  }
  function sync(s){
    const choice=s.select.selectedOptions[0],label=s.host.dataset.facetLabel||s.select.getAttribute('aria-label');
    const value=choice?.textContent||'';
    s.trigger.querySelector('.facet-current').textContent=s.select.value?label+' · '+value:s.select.options[0].textContent;
    s.trigger.setAttribute('aria-label',label+': '+value);s.trigger.title=label+': '+value;
    s.trigger.classList.toggle('has-value',!!s.select.value);
    s.list.replaceChildren();s.options=[];
    [...s.select.options].forEach((option,index)=>{
      const node=document.createElement('div');node.id=s.list.id+'-'+index;node.className='facet-option';node.setAttribute('role','option');node.setAttribute('aria-selected',String(option.selected));node.dataset.index=String(index);node.textContent=option.textContent;s.options.push(node);s.list.append(node);
    });
    if(opened===s){active(s,Math.min(s.active,s.options.length-1));position(s);}
  }
  function open(s,last=false){
    close();opened=s;s.panel.hidden=false;s.trigger.setAttribute('aria-expanded','true');
    position(s);if(opened!==s)return;
    s.list.focus({preventScroll:true});active(s,last?s.options.length-1:s.select.selectedIndex);
  }
  function choose(s,index){
    if(!s.select.options[index])return;
    s.select.selectedIndex=index;sync(s);close(true);s.select.dispatchEvent(new Event('change',{bubbles:true}));
  }
  for(const host of form.querySelectorAll('[data-person-facet]')){
    const select=host.querySelector('select'),trigger=host.querySelector('[data-facet-trigger]');if(!select||!trigger)continue;
    const panel=document.createElement('div');panel.className='facet-panel';panel.hidden=true;
    const list=document.createElement('div');list.className='facet-options';list.id=select.id+'-options';list.tabIndex=0;list.setAttribute('role','listbox');list.setAttribute('aria-label',host.dataset.facetLabel||select.getAttribute('aria-label'));panel.append(list);
    const more=host.querySelector('[data-facet-more]');if(more)panel.append(more);
    const note=document.createElement('span');note.className='facet-status';note.setAttribute('role','status');note.setAttribute('aria-live','polite');panel.append(note);host.append(panel);
    const s={host,select,trigger,panel,list,more,note,options:[],active:0,prefix:'',typedAt:0};controls.push(s);
    trigger.setAttribute('aria-controls',list.id);sync(s);select.hidden=true;trigger.hidden=false;
    trigger.addEventListener('click',()=>opened===s?close(true):open(s));
    trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(s,event.key==='ArrowUp');}});
    list.addEventListener('click',event=>{const option=event.target.closest('[role=option]');if(option)choose(s,Number(option.dataset.index));});
    list.addEventListener('pointermove',event=>{const option=event.target.closest('[role=option]');if(option)active(s,Number(option.dataset.index));});
    select.addEventListener('change',()=>sync(s));
    select.addEventListener('public:facet-options',()=>{const wasMore=document.activeElement===more;sync(s);if(opened===s&&wasMore&&more.hidden)list.focus({preventScroll:true});});
    host.addEventListener('public:facet-status',event=>{note.textContent=event.detail||'';if(opened===s)position(s);});
    panel.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close(true);return;}
      if(event.key==='Tab'){
        if(document.activeElement===list&&!event.shiftKey&&more&&visible(more)){event.preventDefault();more.focus();return;}
        if(document.activeElement===more&&event.shiftKey){event.preventDefault();list.focus();return;}
        close(true); // Let the browser's normal Tab action continue from the trigger.
        return;
      }
      if(event.target!==list)return;
      const moves={ArrowDown:s.active+1,ArrowUp:s.active-1,Home:0,End:s.options.length-1};
      if(Object.hasOwn(moves,event.key)){event.preventDefault();active(s,moves[event.key]);}
      else if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(s,s.active);}
      else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
        event.preventDefault();const now=Date.now();s.prefix=(now-s.typedAt<700?s.prefix:'')+event.key.toLocaleLowerCase();s.typedAt=now;
        const index=s.options.findIndex(node=>node.textContent.toLocaleLowerCase().startsWith(s.prefix));if(index>=0)active(s,index);
      }
    });
  }
  document.addEventListener('pointerdown',event=>{if(opened&&!opened.host.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(opened&&!opened.host.contains(event.target))close();});
  const reposition=()=>{if(opened)position(opened);};
  document.addEventListener('public-reading-change',reposition);
  window.addEventListener('resize',reposition);window.visualViewport?.addEventListener('resize',reposition);
  document.addEventListener('scroll',event=>{if(opened&&!opened.panel.contains(event.target))reposition();},true);
  form.addEventListener('submit',()=>close());form.addEventListener('reset',()=>{close();queueMicrotask(()=>controls.forEach(sync));});
  document.addEventListener('teacher:navigation-start',()=>close());window.addEventListener('pagehide',()=>close());window.addEventListener('pageshow',()=>controls.forEach(sync));
})();
