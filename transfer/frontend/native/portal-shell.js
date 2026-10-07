import {t as tr,joinText,errorText,setText,setAttr} from './transfer-i18n.js?v=0.15.96';
/* Display-only controller. Existing transport controllers own every task and request. */
const root=document.querySelector('[data-portal]');
if(root){
 const picker=root.querySelector('[data-mode-picker]'),tabs=[...root.querySelectorAll('[data-mode]')],panels=[...root.querySelectorAll('[data-mode-panel]')];
 const select=tab=>{
  tabs.forEach(item=>{const active=item===tab;setAttr(item,'aria-selected',String(active));item.tabIndex=active?0:-1});
  panels.forEach(panel=>{panel.hidden=panel.dataset.modePanel!==tab.dataset.mode});
 };
 if(picker&&tabs.length){
  panels.forEach(panel=>{setAttr(panel,'role','tabpanel');setAttr(panel,'aria-labelledby','mode-'+panel.dataset.modePanel);panel.tabIndex=0});
  tabs.forEach((tab,index)=>{
   tab.addEventListener('click',()=>select(tab));
   tab.addEventListener('keydown',event=>{
    let next=index;
    if(event.key==='ArrowRight')next=(index+1)%tabs.length;
    else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=tabs.length-1;
    else return;
    event.preventDefault();select(tabs[next]);tabs[next].focus();
   });
  });
  select(tabs.find(tab=>tab.getAttribute('aria-selected')==='true')||tabs[0]);picker.hidden=false;
 }
 // Mirror actual controller feedback without claiming activity/completion from a timer.
 const list=root.querySelector('[data-mode-status]');
 const sources={lan:['lan-status','lan-path'],relay:['relay-status'],cache:['feedback','receive-feedback','stream-feedback']};
 if(list)tabs.forEach(tab=>{
  const li=document.createElement('li'),button=document.createElement('button'),status=document.createElement('span');
  button.type='button';setText(button,tab.querySelector('strong').textContent);
  document.addEventListener('transfer-language-change',()=>setText(button,tab.querySelector('strong').textContent));
  button.addEventListener('click',()=>{select(tab);tab.focus()});
  li.append(button,status);list.append(li);
  const nodes=sources[tab.dataset.mode].map(id=>document.getElementById(id)).filter(Boolean);
  const update=()=>{setText(status,nodes.map(node=>node.textContent.trim()).filter(Boolean).join(' · '))};
  update();const observer=new window.MutationObserver(update);nodes.forEach(node=>observer.observe(node,{childList:true,subtree:true,characterData:true}));
 });
}
