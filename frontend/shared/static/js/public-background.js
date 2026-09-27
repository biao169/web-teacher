/* CSS owns drawing and motion. Pause it when this public page is not visible. */
(() => {
 const layer=document.querySelector('body.section-public .public-ambient');
 if(!layer)return;
 // A small, deterministic vector drawing; no downloads, canvas or animation loop.
 const ns='http://www.w3.org/2000/svg';
 const element=(name,attributes)=>{const node=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);return node;};
 if(!layer.querySelector('.public-ambient-pattern')){
  for(const side of ['left','right']){
   const svg=element('svg',{class:`public-ambient-pattern public-ambient-pattern--${side}`,viewBox:'0 0 360 600','aria-hidden':'true',focusable:'false'});
   const lines=element('g',{class:'public-ambient-pattern-lines'});
   for(const d of ['M24 172 L108 114 L206 164 L224 274 L130 334 L36 282 Z M108 114 L130 334 M24 172 L224 274 M206 164 L36 282', 'M40 438 L116 398 L186 444 L154 526 Z', 'M-40 82 C100 12 232 30 318 130 S340 330 248 390 S72 446 42 608'])lines.append(element('path',{d}));
   svg.append(lines);
   const dots=element('g',{class:'public-ambient-pattern-nodes'});
   for(const [cx,cy] of [[24,172],[108,114],[206,164],[224,274],[130,334],[36,282]])dots.append(element('circle',{cx,cy,r:'3'}));
   svg.append(dots);layer.append(svg);
  }
 }
 const sync=()=>{document.documentElement.dataset.publicMotion=document.hidden?'paused':'running'};
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pagehide',()=>{document.documentElement.dataset.publicMotion='paused'});
 window.addEventListener('pageshow',sync);
 sync();
})();
