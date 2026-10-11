/* One automatic fetch per failure document; failed attempts never navigate. */
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
  let timer = null, disposed = false, sent = false, controller = null, timeout = null;
  const stop = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const stopped = () => {
    status.textContent = en ? 'Automatic retry stopped' : '自动重试已停止';
    message.textContent = en ? 'Please use Reload when you are ready.' : '您可以在准备好后点击重新加载。';
  };
  const send = async () => {
    if (disposed || sent) return;
    stop(); sent = true;
    const url = new URL(location.href);
    url.searchParams.set('__recover', '1');
    status.textContent = en ? 'Loading fresh content…' : '正在加载最新内容…';
    controller = new AbortController();
    timeout = setTimeout(() => controller?.abort(), 15000);
    try {
      const result = await fetch(url.pathname + url.search, {cache:'no-store',credentials:'same-origin',redirect:'error',headers:{Accept:'text/html'},signal:controller.signal});
      if (result.status !== 200 || result.headers.get('x-public-recovery') === '1' || !String(result.headers.get('content-type')).includes('text/html')) throw Error('Recovery failed');
      const reader = result.body.getReader(), decoder = new TextDecoder();
      let bytes = 0, body = '';
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2*1024*1024) {await reader.cancel(); throw Error('Recovery response too large');}
        body += decoder.decode(part.value,{stream:true});
      }
      body += decoder.decode();
      if (disposed || controller.signal.aborted) return;
      if (!/<html[\s>]/i.test(body) || /data-public-recovery(?:\s|=|>)/i.test(body)) throw Error('Invalid recovery document');
      url.searchParams.delete('__recover');
      hide(); history.replaceState(history.state,'',url.pathname+url.search+url.hash);
      document.open(); document.write(body); document.close();
    } catch (error) {
      if (!disposed) stopped();
    } finally {
      clearTimeout(timeout); timeout=null; controller=null; sent=false;
    }
  };
  function manual(event) {
    if (event.button !== 0) return;
    event.preventDefault(); send();
  }
  function hide() { disposed = true; stop(); controller?.abort(); clearTimeout(timeout); timeout=null; button.removeEventListener('click', manual); unmountHelper(); }
  function show(event) {
    if (!event.persisted) return;
    // Returning to the error document must never start a new automatic attempt.
    disposed = false; sent = false; stop(); stopped();
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
  if (card.dataset.attempted !== '1' && new URL(location.href).searchParams.get('__recover') !== '1') {
    timer = setTimeout(send, 1000);
  }
})();
