/* One delayed retry per image, shared by logo and media enhancements. */
window.teacherImageRetry = (() => {
  const states = new WeakMap(), pending = new Map();
  let stopped = false;
  function stopImages() {
    stopped = true;
    for (const [img,timer] of pending) { clearTimeout(timer); states.get(img).retried=false; }
    pending.clear();
  }
  window.addEventListener('pagehide',stopImages);
  document.addEventListener('teacher:navigation-start',stopImages);
  document.addEventListener('teacher:navigation-cancel',()=>{stopped=false;for(const img of document.images)if(states.has(img)&&img.complete&&!img.naturalWidth)img.dispatchEvent(new Event('error'));});
  window.addEventListener('pageshow', () => { stopped = false; });
  return (img, fallback) => {
    if (states.has(img)) return;
    const state = {retried:false}; states.set(img, state);
    const clear = () => { clearTimeout(pending.get(img)); pending.delete(img); };
    img.addEventListener('load', clear);
    const failed = () => {
      if (stopped || !img.isConnected || pending.has(img)) return;
      if (state.retried) { fallback(); return; }
      state.retried = true;
      const source = img.getAttribute('src');
      pending.set(img, setTimeout(() => {
        pending.delete(img);
        if (stopped || !img.isConnected || img.getAttribute('src') !== source) return;
        // Same URL: preserve signed URLs and HTTP caching, no random query keys.
        if (source) img.setAttribute('src', source);
        else fallback();
      }, 1000));
    };
    img.addEventListener('error', failed);
    if (img.complete && !img.naturalWidth && img.getAttribute('src')) failed();
  };
})();
// Share the current public language with the integrated file-transfer page.
if(['en','zh','zh-CN'].includes(document.documentElement.lang))document.cookie='public_language='+(document.documentElement.lang.startsWith('en')?'en':'zh')+'; Path=/; SameSite=Lax; Max-Age=31536000'+(location.protocol==='https:'?'; Secure':'');
/* Progressive enhancement; content and forms remain server-rendered. */
function enhancePublicHeader() {
  'use strict';
  for (const logo of document.querySelectorAll('[data-brand-logo]')) {
    window.teacherImageRetry(logo, () => {logo.hidden = true;});
  }
  const current = new URL(window.location.href);
  for (const link of document.querySelectorAll('[data-public-language]')) {
    const target = new URL(link.href, current);
    if (!link.hasAttribute('data-language-resolved') && /^\/(zh|en)(\/|$)/.test(current.pathname)) {
      target.pathname = current.pathname.replace(/^\/(zh|en)(?=\/|$)/, '/' + link.dataset.publicLanguage);
      target.search = current.search;
      target.hash = current.hash;
    }
    target.hash=current.hash;
    link.href = target.href;
  }
  for (const link of document.querySelectorAll('.academic-nav [data-navigation-id]')) {
    const target = new URL(link.href, current);
    if (target.origin !== current.origin) continue;
    const path = target.pathname.replace(/\/$/, '');
    const here = current.pathname.replace(/\/$/, '');
    const filtersMatch = [...target.searchParams].every(([key, value]) => current.searchParams.getAll(key).includes(value));
    if (filtersMatch && (here === path || (path.split('/').length > 2 && here.startsWith(path + '/')))) {
      link.setAttribute('aria-current', 'page');
    }
  }
}
enhancePublicHeader();
document.addEventListener('public-header-updated',enhancePublicHeader);
