/* Manual recovery only. No automatic requests, storage or cache purge. */
(() => {
  'use strict';
  const card = document.querySelector('[data-public-recovery]');
  if (!card) {
    if (!document.querySelector('[data-public-recovery-success]')) return;
    const url = new URL(location.href);
    if (url.searchParams.get('__recover') !== '1') return;
    url.searchParams.delete('__recover');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    return;
  }
  if (card.dataset.recoverySetup) return;
  card.dataset.recoverySetup = '1';
  const button = card.querySelector('[data-recovery-reload]');
  const status = card.querySelector('[data-recovery-status]');
  const message = card.querySelector('[data-recovery-message]');
  const en = document.documentElement.lang === 'en';
  const helper = card.ownerDocument.querySelector('[data-recovery-helper]');
  let drag = null, helperMounted = false;
  let disposed = false, sent = false;
  const stopped = () => {
    status.textContent = en ? 'Automatic retry stopped' : '自动重试已停止';
    message.textContent = en ? 'Please use Reload when you are ready.' : '您可以在准备好后点击重新加载。';
  };
  const send = () => {
    if (disposed || sent) return;
    sent = true;
    const url = new URL(location.href);
    url.searchParams.set('__recover', '1');
    status.textContent = en ? 'Loading fresh content…' : '正在加载最新内容…';
    location.replace(url.pathname + url.search + url.hash);
  };
  function manual(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); send();
  }
  function hide() { disposed = true; button.removeEventListener('click', manual); unmountHelper(); }
  function show(event) {
    if (!event.persisted) return;
    // Returning to the error document must never start a new automatic attempt.
    disposed = false; sent = false; stopped();
    button.removeEventListener('click', manual); button.addEventListener('click', manual); mountHelper();
  }
  // Drag listeners exist only while dragging. No RAF loop, fetch or persistent state.
  function place(x, y) {
    const box = helper.getBoundingClientRect(), avoid = button.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - box.width), maxY = Math.max(0, window.innerHeight - box.height);
    const clamp = (n, max) => Math.max(0, Math.min(n, max));
    const safe = ([a,b]) => a + box.width + 8 <= avoid.left || a >= avoid.right + 8 || b + box.height + 8 <= avoid.top || b >= avoid.bottom + 8;
    const target = [clamp(x,maxX),clamp(y,maxY)];
    const candidates = [target,[avoid.left-box.width-8,target[1]],[avoid.right+8,target[1]],[target[0],avoid.top-box.height-8],[target[0],avoid.bottom+8]]
      .map(([a,b])=>[clamp(a,maxX),clamp(b,maxY)]).filter(safe);
    candidates.sort((a,b)=>Math.hypot(a[0]-target[0],a[1]-target[1])-Math.hypot(b[0]-target[0],b[1]-target[1]));
    helper.style.visibility = candidates.length ? '' : 'hidden';
    if (!candidates.length) return; // Tiny viewport: the Reload control takes priority.
    helper.style.left = candidates[0][0] + 'px'; helper.style.top = candidates[0][1] + 'px';
    helper.style.right = 'auto'; helper.style.bottom = 'auto';
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault(); place(event.clientX-drag.x,event.clientY-drag.y);
  }
  function end(event) {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const id=drag.id; drag=null;
    window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',end); window.removeEventListener('pointercancel',end);
    helper.removeEventListener('lostpointercapture',end);
    if (helper.hasPointerCapture?.(id)) helper.releasePointerCapture(id);
  }
  function begin(event) {
    if (disposed || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); const box=helper.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX-box.left,y:event.clientY-box.top};
    helper.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove',move,{passive:false}); window.addEventListener('pointerup',end); window.addEventListener('pointercancel',end);
    helper.addEventListener('lostpointercapture',end);
  }
  function fit() { const box=helper.getBoundingClientRect(); place(box.left,box.top); }
  function key(event) {
    const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[event.key];
    if (!delta) return; event.preventDefault(); const box=helper.getBoundingClientRect(); place(box.left+delta[0],box.top+delta[1]);
  }
  function mountHelper() {
    if (!helper || helperMounted) return;
    helperMounted=true; helper.addEventListener('pointerdown',begin); helper.addEventListener('keydown',key); window.addEventListener('resize',fit); fit();
  }
  function unmountHelper() {
    if (!helper || !helperMounted) return;
    end(); helperMounted=false; helper.removeEventListener('pointerdown',begin); helper.removeEventListener('keydown',key); window.removeEventListener('resize',fit);
  }
  mountHelper();
  button.addEventListener('click', manual);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  stopped();
})();
