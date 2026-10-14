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


/*
 * One-time desktop navigation overflow hint.
 *
 * 独立于 Header fit / ResizeObserver。
 * 只根据浏览器最终实际计算出的
 * scrollWidth > clientWidth 判断是否可滚动。
 */
(()=>{
 const states=new WeakMap();
 /*
 * 可控速度的平滑横向滚动。
 *
 * duration:
 *   900 = 较慢
 *   1100 = 更柔和
 *   1300 = 很慢
 */
function smoothScrollToX(element,target,duration=1000){
  const start=element.scrollLeft;

  const distance=target-start;

  if(Math.abs(distance)<1){
    element.scrollLeft=target;
    return;
  }

  const startTime=performance.now();

  /*
    * easeInOutCubic：
    * 开始慢 → 中间稍快 → 结束慢
    */
  function ease(t){
    return t<0.5
    ? 4*t*t*t
    : 1-Math.pow(-2*t+2,3)/2;
  }

  function frame(now){
    if(!element.isConnected)return;

    const elapsed=now-startTime;
    const progress=Math.min(elapsed/duration,1);

    element.scrollLeft=
    start+distance*ease(progress);

    if(progress<1){
    requestAnimationFrame(frame);
    }else{
    element.scrollLeft=target;
    }
  }

  requestAnimationFrame(frame);
}
let cleaned=false;

function cleanup(){
 if(cleaned)return;
 cleaned=true;

 window.removeEventListener(
  'pageshow',
  kick
 );

 document.removeEventListener(
  'public-header-updated',
  kick
 );

 document.removeEventListener(
  'teacher:identity-change',
  kick
 );

 document.removeEventListener(
  'teacher:identity-restored',
  kick
 );

 document.removeEventListener(
  'teacher:identity-invalidated',
  kick
 );

 document.removeEventListener(
  'public-reading-change',
  kick
 );

 window.removeEventListener(
  'resize',
  onResize
 );
}

 function start(){
  const nav=
   document.querySelector('#academic-main-nav');

  if(!nav)return;

  /*
   * 手机端使用抽屉导航，
   * 不执行水平滚动提示。
   */
  if(window.innerWidth<=650)return;

  let state=states.get(nav);

  /*
   * 已经执行过，
   * 或者已经正在检测，
   * 不重复启动。
   */
  if(state?.done||state?.running)return;

  state={
   done:false,
   running:true,
   attempts:0,
   timer:0
  };

  states.set(nav,state);

  function probe(){
   if(!nav.isConnected){
    state.running=false;
    return;
   }

   if(window.innerWidth<=650){
    state.running=false;
    return;
   }

   /*
    * 使用浏览器最终真实尺寸。
    *
    * 你当前实测：
    *
    * clientWidth = 936
    * scrollWidth = 1069
    * maxScroll = 133
    */
   const maxScroll=
    nav.scrollWidth-nav.clientWidth;

   /*
    * 如果暂时还没有形成 overflow，
    * 说明 Header / 字体 / 用户状态等
    * 可能仍在调整布局。
    *
    * 每 300ms 检查一次，
    * 最多检查约 9 秒。
    */
   if(maxScroll<=4){
    state.attempts++;

    if(state.attempts<30){
     state.timer=setTimeout(
      probe,
      300
     );
    }else{
     /*
      * 这次没有 overflow。
      *
      * 不标记 done，
      * 以后 resize / identity change
      * 仍然可以重新启动。
      */
     state.running=false;
    }

    return;
   }

   /*
    * 已经确认存在真实 overflow。
    *
    * 再等待 550ms，
    * 让 Header、字体和账号区域彻底稳定。
    */
   state.timer=setTimeout(()=>{

    if(!nav.isConnected){
     state.running=false;
     return;
    }

    if(window.innerWidth<=650){
     state.running=false;
     return;
    }

    /*
     * 动画开始前重新测量一次，
     * 不使用旧尺寸。
     */
    const currentMax=
     nav.scrollWidth-nav.clientWidth;

    if(currentMax<=4){
     state.running=false;
     state.attempts=0;

     /*
      * 布局刚好发生变化，
      * 再重新检测。
      */
     start();

     return;
    }

    /*
     * 保存当前位置。
     *
     * 正常首次进入页面应该是 0，
     * 但保留当前值可以兼容 BFCache
     * 或浏览器恢复滚动位置。
     */
    const startLeft=
     nav.scrollLeft;

    /*
     * 最多移动 400px。
     *
     * 你当前最大滚动距离是 133px，
     * 因此会从：
     *
     * 0 -> 80 -> 0
     */
    const distance=
     Math.min(
      400,
      currentMax
     );

    /*
     * 从这一刻开始认为提示已经执行，
     * 防止其他事件重复启动动画。
     */
    state.done=true;
    state.running=false;

    /*
     * 第一阶段：
     * 平滑向右移动。
     */
    smoothScrollToX(
      nav,
      Math.min(
        startLeft+distance,
        currentMax
      ),
      1100
    );

    /*
     * 第二阶段：
     * 停留 1000ms 后，
     * 平滑返回原始位置。
     */
    // state.timer=setTimeout(()=>{
    //   if(!nav.isConnected)return;
    //   smoothScrollToX(
    //     nav,
    //     startLeft,
    //     1100
    //   );
    // },1000);
    state.timer=setTimeout(()=>{
      if(!nav.isConnected){
        cleanup();
        return;
      }

      smoothScrollToX(
        nav,
        startLeft,
        1100
      );

      /*
        * 等返回动画结束以后，
        * 清理所有只为滚动提示服务的监听器。
        */
      setTimeout(()=>{
        cleanup();
      },2200);

      },1000);

   },550);
  }

  /*
   * 等两帧。
   *
   * 第一帧：
   * class / Grid 变化提交。
   *
   * 第二帧：
   * clientWidth / scrollWidth
   * 已经使用最终布局重新计算。
   */
  requestAnimationFrame(()=>{
   requestAnimationFrame(
    probe
   );
  });
 }

 function kick(){
  setTimeout(
   start,
   0
  );
 }

 /*
  * 普通首次加载。
  */
 if(document.readyState==='loading'){
  document.addEventListener(
   'DOMContentLoaded',
   kick,
   {once:true}
  );
 }else{
  kick();
 }

 /*
  * 所有资源加载完成后再补一次。
  */
 window.addEventListener(
  'load',
  kick,
  {once:true}
 );

 /*
  * 浏览器前进 / 后退缓存恢复。
  */
 window.addEventListener(
  'pageshow',
  kick
 );

 /*
  * Public Header 被更新。
  */
 document.addEventListener(
  'public-header-updated',
  kick
 );

 /*
  * 登录状态改变以后，
  * academic-account 的宽度可能变化，
  * 导致 nav 的 clientWidth 发生变化。
  */
 document.addEventListener(
  'teacher:identity-change',
  kick
 );

 document.addEventListener(
  'teacher:identity-restored',
  kick
 );

 document.addEventListener(
  'teacher:identity-invalidated',
  kick
 );

 /*
  * 阅读字号改变以后，
  * 导航按钮宽度也可能发生变化。
  */
 document.addEventListener(
  'public-reading-change',
  kick
 );

 /*
  * 用户调整浏览器窗口大小。
  */
 let resizeTimer=0;

 function onResize(){
  clearTimeout(resizeTimer);

  resizeTimer=setTimeout(
    kick,
    160
  );
}

window.addEventListener(
  'resize',
  onResize,
  {passive:true}
);
})();
