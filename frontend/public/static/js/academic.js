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


/* Header menu and fit detection: no network requests. */
(()=>{
  const ready=new WeakSet();

  function setup(){

    for(
      const h of document.querySelectorAll(
        '.academic-header-inner'
      )
    ){

      if(ready.has(h))continue;

      const panel=h.querySelector(
        '[data-public-menu-panel]'
      );

      const nav=h.querySelector(
        '.academic-nav'
      );

      const button=h.querySelector(
        '[data-public-menu]'
      );

      const brand=h.querySelector(
        '.academic-brand'
      );

      const account=h.querySelector(
        '.academic-account'
      );

      const backdrop=h.querySelector(
        '[data-public-menu-backdrop]'
      );

      const closer=panel?.querySelector(
        '[data-public-menu-close]'
      );

      if(
        !panel ||
        !nav ||
        !button ||
        !brand ||
        !account ||
        !backdrop ||
        !closer
      ){
        continue;
      }

      ready.add(h);

      h.classList.add('menu-ready');

      button.hidden=false;


      function close(focus=false){

        h.classList.remove('menu-open');

        document.body.classList.remove(
          'public-menu-open'
        );

        button.setAttribute(
          'aria-expanded',
          'false'
        );

        backdrop.hidden=true;

        if(focus){
          button.focus();
        }
      }


      function open(){

        h.classList.add('menu-open');

        document.body.classList.add(
          'public-menu-open'
        );

        button.setAttribute(
          'aria-expanded',
          'true'
        );

        backdrop.hidden=false;

        panel.scrollTop=0;

        requestAnimationFrame(()=>{
          closer.focus();
        });
      }


      button.addEventListener(
        'click',
        ()=>{

          if(
            h.classList.contains('menu-open')
          ){
            close(true);
          }else{
            open();
          }

        }
      );


      closer.addEventListener(
        'click',
        ()=>close(true)
      );


      backdrop.addEventListener(
        'click',
        ()=>close(true)
      );


      /*
       * Close when a navigation/language/account link
       * inside the floating panel is selected.
       */
      panel.addEventListener(
        'click',
        event=>{

          if(
            event.target.closest('a[href]')
          ){
            close();
          }

        }
      );


      /*
       * Escape closes the menu.
       * Tab remains inside the floating menu.
       */
      h.addEventListener(
        'keydown',
        event=>{

          if(
            event.key==='Escape' &&
            h.classList.contains('menu-open')
          ){

            event.preventDefault();

            close(true);

            return;
          }


          if(
            event.key!=='Tab' ||
            !h.classList.contains('menu-open')
          ){
            return;
          }


          const controls=[
            ...panel.querySelectorAll(
              'a[href],button:not([disabled])'
            )
          ];


          if(!controls.length)return;


          const first=controls[0];
          const last=controls.at(-1);


          if(
            event.shiftKey &&
            document.activeElement===first
          ){

            event.preventDefault();

            last.focus();

          }else if(
            !event.shiftKey &&
            document.activeElement===last
          ){

            event.preventDefault();

            first.focus();
          }

        }
      );


      /*
       * Switching desktop/mobile always resets
       * the floating menu state.
       */
      const mobile=window.matchMedia?.(
        '(max-width:650px)'
      );

      mobile?.addEventListener(
        'change',
        ()=>{
          close();
          fit();
        }
      );


      /*
       * Existing desktop navigation fit detection.
       */
      function fit(){

        if(!h.isConnected)return;


        if(window.innerWidth<=1100){

          h.classList.remove(
            'nav-second-row'
          );

          return;
        }


        const items=[
          ...nav.children
        ];


        const gap=
          parseFloat(
            getComputedStyle(nav).columnGap
          )||0;


        const headerStyle=
          getComputedStyle(h);


        const spacing=
          parseFloat(
            headerStyle.columnGap
          )||0;


        const padding=
          (parseFloat(
            headerStyle.paddingLeft
          )||0)
          +
          (parseFloat(
            headerStyle.paddingRight
          )||0);


        const required=
          items.reduce(
            (total,item)=>
              total+
              item.getBoundingClientRect().width,
            0
          )
          +
          Math.max(
            0,
            items.length-1
          )*gap;


        const available=
          h.clientWidth
          -padding
          -brand.getBoundingClientRect().width
          -account.getBoundingClientRect().width
          -spacing*2;


        h.classList.toggle(
          'nav-second-row',
          required>available+1
        );
      }


      if(window.ResizeObserver){

        const observer=
          new ResizeObserver(fit);

        for(
          const node of [
            h,
            brand,
            account,
            nav
          ]
        ){
          observer.observe(node);
        }

      }else{

        window.addEventListener(
          'resize',
          fit
        );
      }


      document.fonts?.ready.then(fit);

      fit();
    }
  }


  setup();


  document.addEventListener(
    'public-header-updated',
    setup
  );

})();

