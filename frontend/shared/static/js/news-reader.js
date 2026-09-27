/** Shared inline PDF reader: lazy documents, per-page geometry, bounded canvases and explicit recovery. */
const ROOT='/assets/shared/vendor/pdfjs-6.3.289/',documents=new Set(),painted=new Map();
let library,queue=Promise.resolve();
const schedule=job=>{const result=queue.then(job);queue=result.catch(()=>{});return result};
async function pdfLibrary(){
 if(!library)library=import(ROOT+'legacy/build/pdf.min.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc=ROOT+'legacy/build/pdf.worker.min.mjs';return lib}).catch(error=>{library=null;throw error});
 return library;
}
/** Remove pixel/text memory while keeping the exact page height and a keyboard-readable restore action. */
function release(slot){
 slot.task?.cancel();slot.text?.cancel();slot.task=null;slot.text=null;
 if(slot.canvas){slot.canvas.width=slot.canvas.height=0;slot.canvas.remove();slot.canvas=null}
 slot.layer?.remove();slot.layer=null;slot.page?.cleanup();slot.page=null;painted.delete(slot);
 slot.button.hidden=false;slot.button.textContent=slot.owner.say(`重新显示第 ${slot.number} 页`,`Restore page ${slot.number}`);
}
class InlinePDF{
 constructor(node){
  this.public=node.hasAttribute('data-pdf-public');this.en=this.public&&node.dataset.pdfLang==='en';
  this.node=node;this.pages=node.querySelector('.pdf-inline-pages');this.status=node.querySelector('.pdf-inline-status');this.start=node.querySelector('[data-pdf-start]');this.next=node.querySelector('[data-pdf-next]');this.collapse=node.querySelector('[data-pdf-collapse]');this.slots=[];this.generation=0;
  this.start.setAttribute('aria-expanded','false');this.start.hidden=false;this.start.addEventListener('click',()=>this.open());this.next.addEventListener('click',()=>this.append(true));this.collapse.addEventListener('click',()=>{this.pause(true);this.start.focus()});
  // Keep the manual action in the stable header; a separate bottom sentinel owns auto-loading.
  node.querySelector('.pdf-inline-tools').append(this.next);this.sentinel=document.createElement('span');this.sentinel.className='pdf-inline-sentinel';this.sentinel.setAttribute('aria-hidden','true');this.pages.after(this.sentinel);
  if(typeof IntersectionObserver==='function'){
   this.observer=new IntersectionObserver(entries=>{for(const entry of entries){
    if(entry.target===node){if(entry.isIntersecting&&!this.paused&&!this.doc)this.open()}
    else if(entry.target===this.sentinel){if(entry.isIntersecting)this.autoNext()}
    else if(entry.isIntersecting&&this.doc){const slot=this.slots.find(s=>s.element===entry.target);if(slot)this.render(slot)}
    else{const slot=this.slots.find(s=>s.element===entry.target);if(slot)release(slot)}
   }},{rootMargin:'240px 0px'});this.observer.observe(node);this.observer.observe(this.sentinel);
  }
  if(typeof ResizeObserver==='function'){this.width=node.clientWidth;this.resize=new ResizeObserver(()=>{if(Math.abs(node.clientWidth-this.width)>8){this.width=node.clientWidth;for(const slot of this.slots){release(slot);if(this.near(slot.element)&&this.doc)this.render(slot)}}});this.resize.observe(node)}
 }
 say(zh,en){return this.en?en:zh}
 near(element){const box=element.getBoundingClientRect();return box.bottom>=-240&&box.top<innerHeight+240}
 note(text){this.status.textContent=text}
 async open(){
  if(this.busy||this.doc||this.destroyed)return;
  this.paused=false;this.busy=true;this.start.disabled=true;const generation=++this.generation;this.note(this.say('正在加载 PDF…','Loading PDF…'));
  try{await schedule(async()=>{
   if(this.destroyed||generation!==this.generation)return;
   const lib=await pdfLibrary();if(generation!==this.generation)return;
   // Limit simultaneously parsed documents too; a released document resumes only by explicit action.
   while(documents.size>=2){const oldest=documents.values().next().value;oldest.pause(false)}
   documents.add(this);this.lib=lib;
   this.loading=lib.getDocument({url:this.node.dataset.pdfUrl,withCredentials:false,rangeChunkSize:65536,disableAutoFetch:true,disableStream:true,isEvalSupported:false,useWasm:false,enableXfa:false,stopAtErrors:true,maxImageSize:8000000,cMapUrl:ROOT+'cmaps/',cMapPacked:true,standardFontDataUrl:ROOT+'standard_fonts/'});
   const doc=await this.loading.promise;
   if(this.destroyed||generation!==this.generation){await doc.destroy();return}
   if(doc.numPages>2000||doc.numPages<1)throw new Error('页数超过阅读上限');
   this.doc=doc;this.start.setAttribute('aria-expanded','true');this.start.hidden=true;this.collapse.hidden=false;this.next.hidden=false;
  });
  }catch(error){if(generation===this.generation){this.pause(false);this.note(this.public?this.say('PDF 加载失败，请重试。','Could not load PDF. Please retry.'):'PDF 加载失败，请重试或打开原文件。');this.start.textContent=this.say('重试 PDF','Retry PDF')}}
  finally{if(generation===this.generation)this.busy=false;this.start.disabled=false}
  if(this.doc){if(!this.slots.length)await this.append();else{for(const slot of this.slots)if(this.near(slot.element))await this.render(slot);this.progress()}}
 }
 progress(){if(this.doc){this.note(this.public?'':`已展开 ${this.slots.length} / ${this.doc.numPages} 页 · 按页阅读`);this.next.hidden=this.slots.length>=this.doc.numPages}}
 autoNext(){if(this.doc&&!this.busy&&!this.appending&&this.near(this.sentinel)&&!this.next.hidden)this.append()}
 async append(focus=false){
  if(!this.doc||this.appending||this.slots.length>=this.doc.numPages)return;
  this.appending=true;this.next.disabled=true;const generation=this.generation;
  try{
   const number=this.slots.length+1,page=await this.doc.getPage(number);if(generation!==this.generation){page.cleanup();return}
   const viewport=page.getViewport({scale:1}),element=document.createElement('span'),button=document.createElement('button');
   element.className='pdf-inline-page';element.style.aspectRatio=String(viewport.width/viewport.height);element.setAttribute('aria-label',this.say(`第 ${number} 页`,`Page ${number}`));element.dataset.pdfPage=number;
   button.type='button';button.textContent=this.say(`显示第 ${number} 页`,`Show page ${number}`);element.append(button);this.pages.append(element);
   if(this.public&&this.node.dataset.pdfWatermark){const mark=document.createElement('span');mark.className='pdf-watermark';mark.textContent=this.node.dataset.pdfWatermark;mark.setAttribute('aria-hidden','true');element.append(mark)}
   const slot={element,button,number,page,owner:this};button.addEventListener('click',()=>this.doc?this.render(slot):this.open());this.slots.push(slot);this.observer?.observe(element);
   if(focus)slot.element.scrollIntoView({block:'start'});
   await this.render(slot);this.progress();
  }catch(error){if(generation===this.generation){this.note(this.say('这一页加载失败，请点击下一页重试。','Could not load this page. Select Next page to retry.'));this.next.hidden=false}}
  finally{this.appending=false;this.next.disabled=false}
  // A short page may leave the sentinel inside the same observer intersection; fill only near the viewport.
  if(generation===this.generation)requestAnimationFrame(()=>this.autoNext());
 }
 async render(slot){
  if(!this.doc||slot.pending||slot.canvas||this.destroyed)return;
  slot.pending=true;const generation=this.generation;
  try{await schedule(async()=>{
   if(!this.doc||generation!==this.generation)return;
   const page=slot.page||await this.doc.getPage(slot.number);slot.page=page;
   if(generation!==this.generation){page.cleanup();return}
   const base=page.getViewport({scale:1}),width=Math.max(100,slot.element.clientWidth),viewport=page.getViewport({scale:width/base.width});
   while(painted.size>=3)release(painted.keys().next().value);
   const canvas=document.createElement('canvas'),ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(4000000/(viewport.width*viewport.height)));
   canvas.width=Math.max(1,Math.floor(viewport.width*ratio));canvas.height=Math.max(1,Math.floor(viewport.height*ratio));canvas.setAttribute('aria-label',this.say(`PDF 第 ${slot.number} 页`,`PDF page ${slot.number}`));slot.canvas=canvas;slot.element.append(canvas);painted.set(slot,true);slot.button.hidden=true;
   slot.task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});await slot.task.promise;slot.task=null;
   if(generation!==this.generation||!slot.canvas)return;
   const layer=document.createElement('span');layer.className='textLayer';layer.style.setProperty('--total-scale-factor',viewport.scale);slot.layer=layer;slot.element.append(layer);
   try{slot.text=new this.lib.TextLayer({textContentSource:page.streamTextContent(),container:layer,viewport});await slot.text.render()}catch(error){layer.remove();slot.layer=null;this.note(this.say('此页文字层不可用，可查看页面图片。','Text selection is unavailable on this page; the page image is available.'))}
  });}catch(error){if(generation===this.generation){release(slot);if(error.name!=='RenderingCancelledException'){slot.button.textContent=this.say(`重试第 ${slot.number} 页`,`Retry page ${slot.number}`);this.note(this.public?this.say('页面绘制失败，请重试本页。','Page rendering failed. Please retry.'):'页面绘制失败，可重试本页或打开原文件。')}}}
  finally{slot.pending=false}
 }
 pause(collapse){
  ++this.generation;this.start.setAttribute('aria-expanded','false');this.paused=true;this.busy=false;this.appending=false;documents.delete(this);
  for(const slot of this.slots)release(slot);
  this.loading?.destroy().catch(()=>{});this.loading=null;this.doc=null;this.start.hidden=false;this.start.disabled=false;this.start.textContent=this.say('继续阅读 PDF','Resume PDF');this.next.hidden=true;this.collapse.hidden=true;
  if(collapse){for(const slot of this.slots)this.observer?.unobserve(slot.element);this.slots=[];this.pages.replaceChildren()}
  this.note(this.public?'':(collapse?'已收起，点击继续阅读。':'已释放阅读内存，点击继续阅读。'));
 }
 destroy(){this.destroyed=true;this.observer?.disconnect();this.resize?.disconnect();this.pause(true)}
}
/** Return a disposer so replacing a preview cancels workers, observers and outstanding render tasks. */
export function mountNewsReader(root=document){const readers=[...root.querySelectorAll('[data-inline-pdf]')].map(node=>new InlinePDF(node));return()=>readers.forEach(reader=>reader.destroy())}
if(document.body?.classList.contains('section-public'))mountNewsReader();
