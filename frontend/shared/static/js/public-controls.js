/* Public-only progressive controls; no form, account or transfer mutation. */
(() => {
  'use strict';
  if (!document.body.classList.contains('section-public')) return;
  function prepareMedia(scope) {
    for (const frame of scope.querySelectorAll('[data-public-media]')) {
      const img = frame.querySelector('img'), fallback = frame.querySelector('[data-media-fallback]');
      if (!img || !fallback || img.dataset.fallbackReady) continue;
      img.dataset.fallbackReady = '1';
      const failed = () => { img.hidden = true; fallback.hidden = false; };
      img.addEventListener('error', failed, {once:true});
      if (img.complete && !img.naturalWidth) failed();
    }
  }
  prepareMedia(document);
  document.addEventListener('public:appended', event => prepareMedia(event.target));
  const button = document.querySelector('[data-back-top]');
  const marker = document.querySelector('[data-top-marker]');
  if (!button || !marker) return;
  const update = () => {
    const hidden = window.scrollY < 400;
    if (hidden && document.activeElement === button) {
      const target = document.querySelector('#main') || document.querySelector('main');
      if (target) {
        const previous = target.getAttribute('tabindex');
        target.setAttribute('tabindex','-1'); target.focus({preventScroll:true});
        if (previous === null) target.removeAttribute('tabindex'); else target.setAttribute('tabindex',previous);
      }
    }
    button.hidden = hidden;
  };
  let queued = false;
  const changed = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } };
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(update); observer.observe(marker);
  } else window.addEventListener('scroll', changed, {passive:true});
  window.addEventListener('pageshow', update);
  button.addEventListener('click', () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,behavior:reduced?'auto':'smooth'});
  });
  update();
})();
