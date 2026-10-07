/* Shared public timestamp enhancement; UTC attributes remain unchanged for crawlers. */
(()=>{'use strict';if(!document.body.classList.contains('section-public'))return;
let formatter;try{formatter=new Intl.DateTimeFormat(document.documentElement.lang==='en'?'en-GB':'zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});}catch(_){return;}
function prepare(root){for(const node of root.querySelectorAll('time[data-local-time]')){const raw=node.getAttribute('datetime');if(!raw||!/(Z|[+-]\d{2}:\d{2})$/.test(raw))continue;const date=new Date(raw);if(!Number.isFinite(date.getTime()))continue;node.textContent=formatter.format(date);node.title=formatter.resolvedOptions().timeZone;}}
prepare(document);document.addEventListener('public:appended',event=>prepare(event.target));})();
