/** One editor and one draft, moved between the bounded inline panel and a modal workspace. */
export function richtextWindow({form,body,tools,notice,host,imageTools,preview,beforeClose}){
 const shell=document.createElement('section'),top=document.createElement('div'),scroller=document.createElement('div'),anchor=document.createElement('span');
 shell.className='native-richtext-workspace';shell.setAttribute('aria-label','新闻富文本编辑区');top.className='native-richtext-top';scroller.className='native-richtext-scroll';scroller.setAttribute('aria-label','正文滚动区');
 body.after(anchor,shell);top.append(tools,notice,imageTools);scroller.append(host,preview);shell.append(top,scroller);
 const dialog=document.createElement('dialog');dialog.className='native-richtext-dialog';dialog.setAttribute('aria-label','独立新闻正文编辑窗口');
 const heading=document.createElement('header'),title=document.createElement('strong'),close=document.createElement('button');title.textContent='新闻正文编辑 · 关闭窗口后仍需保存新闻';close.type='button';close.className='btn btn-outline-secondary btn-sm';close.textContent='完成编辑 / 返回表单';close.dataset.richWindowClose='';heading.append(title,close);dialog.append(heading);form.append(dialog);
 const open=document.createElement('button');open.type='button';open.className='btn btn-outline-primary btn-sm';open.textContent='⛶ 独立窗口编辑';open.dataset.richWindowOpen='';open.setAttribute('aria-expanded','false');tools.prepend(open);
 let savedOverflow='',opened=false;
 function restore(){if(!opened)return;opened=false;anchor.after(shell);open.hidden=false;open.setAttribute('aria-expanded','false');document.body.style.overflow=savedOverflow;open.focus({preventScroll:true})}
 function finish(){if(!opened)return;beforeClose();dialog.close();restore()}
 open.addEventListener('click',()=>{if(form.inert||opened)return;if(typeof dialog.showModal!=='function'){notice.textContent='当前浏览器不支持独立窗口；可继续在下方固定工具栏编辑区操作。';return}savedOverflow=document.body.style.overflow;dialog.append(shell);try{dialog.showModal();opened=true;open.hidden=true;open.setAttribute('aria-expanded','true');document.body.style.overflow='hidden';close.focus({preventScroll:true})}catch{anchor.after(shell);notice.textContent='独立窗口暂时无法打开，草稿已保留。'}});
 close.addEventListener('click',finish);dialog.addEventListener('cancel',event=>{event.preventDefault();finish()});dialog.addEventListener('close',restore);
 return {top,shell,scroller,close:finish,setEnabled(enabled){if(!enabled)finish();shell.classList.toggle('is-text-mode',!enabled);open.hidden=!enabled},setToolbar(toolbar){top.insertBefore(toolbar,imageTools)}};
}
