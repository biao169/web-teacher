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

      let nav=h.querySelector(
        '.academic-nav'
      );

      const button=h.querySelector(
        '[data-public-menu]'
      );

      let brand=h.querySelector(
        '.academic-brand'
      );

      let account=h.querySelector(
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
      // function fit(){

      //   if(!h.isConnected)return;


      //   if(window.innerWidth<=1100){

      //     h.classList.remove(
      //       'nav-second-row'
      //     );

      //     return;
      //   }


      //   const items=[
      //     ...nav.children
      //   ];


      //   const gap=
      //     parseFloat(
      //       getComputedStyle(nav).columnGap
      //     )||0;


      //   const headerStyle=
      //     getComputedStyle(h);


      //   const spacing=
      //     parseFloat(
      //       headerStyle.columnGap
      //     )||0;


      //   const padding=
      //     (parseFloat(
      //       headerStyle.paddingLeft
      //     )||0)
      //     +
      //     (parseFloat(
      //       headerStyle.paddingRight
      //     )||0);


      //   const required=
      //     items.reduce(
      //       (total,item)=>
      //         total+
      //         item.getBoundingClientRect().width,
      //       0
      //     )
      //     +
      //     Math.max(
      //       0,
      //       items.length-1
      //     )*gap;


      //   const available=
      //     h.clientWidth
      //     -padding
      //     -brand.getBoundingClientRect().width
      //     -account.getBoundingClientRect().width
      //     -spacing*2;


      //   h.classList.toggle(
      //     'nav-second-row',
      //     required>available+1
      //   );
      // }
      
      // if(window.ResizeObserver){

      //   const observer=
      //     new ResizeObserver(fit);

      //   for(
      //     const node of [
      //       h,
      //       brand,
      //       account,
      //       nav
      //     ]
      //   ){
      //     observer.observe(node);
      //   }

      // }else{

      //   window.addEventListener(
      //     'resize',
      //     fit
      //   );
      // }
      // document.fonts?.ready.then(fit);
      // fit();

      function setBrandWidth(width, smooth=true){

        const value=
          Math.max(
            0,
            Math.round(width)
          )+'px';
        if(smooth){
          h.classList.add(
            'header-width-animate'
          );
        }else{
          h.classList.remove(
            'header-width-animate'
          );
        }

        if(
          h.style.getPropertyValue(
            '--academic-brand-width'
          )===value
        ){
          return;
        }


        h.style.setProperty(
          '--academic-brand-width',
          value
        );
      }


      /*
       * FLIP只负责单行/双行的位置切换。
       */
      const layoutAnimations=
        new WeakMap();


      function changeLayout(
        secondRow,
        brandWidth
      ){
        h.classList.remove(
        'header-width-animate'
      );
        const current=
          h.classList.contains(
            'nav-second-row'
          );


        /*
         * 状态没变化，只修改Logo宽度。
         */
        if(current===secondRow){

          setBrandWidth(
            brandWidth,
            false
          );

          return;
        }


        const elements=[
          brand,
          nav,
          account
        ].filter(Boolean);


        /*
         * 连续resize时取消旧动画。
         */
        for(const element of elements){

          const previous=
            layoutAnimations.get(
              element
            );


          if(previous){

            previous.cancel();

            layoutAnimations.delete(
              element
            );
          }
        }


        /*
         * FLIP：First
         */
        const before=
          new Map(
            elements.map(
              element=>[
                element,
                element.getBoundingClientRect()
              ]
            )
          );


        /*
         * 修改实际布局。
         */
        h.classList.toggle(
          'nav-second-row',
          secondRow
        );


        setBrandWidth(
          brandWidth
        );


        /*
         * FLIP：Last
         *
         * 同步读取新布局。
         */
        const after=
          new Map(
            elements.map(
              element=>[
                element,
                element.getBoundingClientRect()
              ]
            )
          );


        const reduceMotion=
          window.matchMedia?.(
            '(prefers-reduced-motion: reduce)'
          ).matches;


        if(reduceMotion){
          return;
        }


        /*
         * FLIP：Invert + Play
         */
        for(const element of elements){

          const oldRect=
            before.get(element);

          const newRect=
            after.get(element);


          if(
            !oldRect||
            !newRect
          ){
            continue;
          }


          const x=
            oldRect.left-
            newRect.left;


          const y=
            oldRect.top-
            newRect.top;


          if(
            Math.abs(x)<1&&
            Math.abs(y)<1
          ){
            continue;
          }


          const animation=
            element.animate(
              [
                {
                  transform:
                    `translate(${x}px,${y}px)`
                },
                {
                  transform:
                    'translate(0,0)'
                }
              ],
              {
                duration:220,
                easing:
                  'cubic-bezier(.2,.8,.2,1)'
              }
            );


          layoutAnimations.set(
            element,
            animation
          );


          const clearAnimation=()=>{

            if(
              layoutAnimations.get(
                element
              )===animation
            ){

              layoutAnimations.delete(
                element
              );
            }
          };


          animation.addEventListener(
            'finish',
            clearAnimation,
            {once:true}
          );


          animation.addEventListener(
            'cancel',
            clearAnimation,
            {once:true}
          );
        }
      }


      function fit(){

        if(!h.isConnected){
          return;
        }


        /*
         * 手机继续使用现有浮动菜单。
         */
        if(window.innerWidth<=650){

          h.classList.remove(
            'nav-second-row'
          );


          h.style.removeProperty(
            '--academic-brand-width'
          );


          return;
        }


        /*
         * Logo允许缩到的最低宽度。
         */
        const BRAND_MIN=160;


        /*
         * 双行恢复单行时增加28px回差，
         * 防止临界位置反复跳动。
         */
        const RETURN_RESERVE=28;


        /*
         * Header可用宽度。
         */
        const headerStyle=
          getComputedStyle(h);


        const headerGap=
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


        const usable=
          h.clientWidth-
          padding;


        /*
         * Account真实宽度。
         *
         * CSS已经使用：
         * width:max-content
         * grid column:max-content
         */
        const accountNatural=
          Math.ceil(
            account
              .getBoundingClientRect()
              .width
          );


        /*
         * Navigation真正需要的自然宽度。
         */
        const items=[
          ...nav.children
        ].filter(
          item=>
            !item.hidden
            &&
            !item.matches(
              '[data-public-menu-close]'
            )
            &&
            getComputedStyle(item)
              .display!=='none'
        );


        const navStyle=
          getComputedStyle(nav);


        const navGap=
          parseFloat(
            navStyle.columnGap
          )||0;


        const navRequired=
          Math.ceil(

            items.reduce(
              (total,item)=>
                total+
                item
                  .getBoundingClientRect()
                  .width,
              0
            )

            +

            Math.max(
              0,
              items.length-1
            )*navGap

          );


        /*
         * Logo图片 + 网站名称完整自然宽度。
         */
        const logo=
          brand.querySelector(
            '.academic-brand-logo:not([hidden])'
          );


        const brandText=
          brand.querySelector(
            ':scope > span'
          );


        const brandStyle=
          getComputedStyle(
            brand
          );


        const brandGap=
          parseFloat(
            brandStyle.columnGap
          )||0;


        const brandPadding=
          (parseFloat(
            brandStyle.paddingLeft
          )||0)
          +
          (parseFloat(
            brandStyle.paddingRight
          )||0);


        const logoWidth=
          logo
            ? logo
                .getBoundingClientRect()
                .width
            : 0;


        /*
         * scrollWidth取得被省略号隐藏部分的完整宽度。
         */
        const textWidth=
          brandText
            ? brandText.scrollWidth
            : 0;


        const brandNatural=
          Math.ceil(
            logoWidth
            +
            textWidth
            +
            (
              logoWidth&&textWidth
                ? brandGap
                : 0
            )
            +
            brandPadding
          );


        /*
         * 如果Logo本身不足160px，
         * 不人为撑到160px。
         */
        const brandFloor=
          Math.min(
            BRAND_MIN,
            brandNatural
          );


        /*
         * ==================================================
         * 单行空间计算
         *
         * Header =
         *
         * Brand
         * + gap
         * + Navigation
         * + gap
         * + Account
         * ==================================================
         */
        const oneRowBrandRoom=
          usable
          -accountNatural
          -navRequired
          -headerGap*2;


        const isSecondRow=
          h.classList.contains(
            'nav-second-row'
          );


        /*
         * ==================================================
         * 当前是单行
         * ==================================================
         */
        if(!isSecondRow){


          /*
           * Logo还可以保持最低宽度。
           *
           * 导航优先，
           * Logo使用：
           *
           * min(
           *   自然宽度,
           *   剩余空间
           * )
           */
          if(
            oneRowBrandRoom>=
            brandFloor
          ){

            setBrandWidth(
              Math.min(
                brandNatural,
                oneRowBrandRoom
              )
            );


            return;
          }


          /*
           * Logo已经缩到底，
           * Navigation仍然放不下。
           *
           * 此时才切双行。
           */
          const twoRowBrandRoom=
            Math.max(
              0,
              usable
              -accountNatural
              -headerGap
            );


          changeLayout(
            true,
            Math.min(
              brandNatural,
              twoRowBrandRoom
            )
          );


          return;
        }


        /*
         * ==================================================
         * 当前是双行
         * ==================================================
         */


        /*
         * 能恢复单行，而且比临界值额外多28px，
         * 才切回单行。
         */
        if(
          oneRowBrandRoom>=
          brandFloor+
          RETURN_RESERVE
        ){

          changeLayout(
            false,
            Math.min(
              brandNatural,
              oneRowBrandRoom
            )
          );


          return;
        }


        /*
         * 继续双行。
         *
         * 第一行只有：
         *
         * Logo | Account
         *
         * 因此Logo重新使用账号左侧全部剩余空间。
         */
        const twoRowBrandRoom=
          Math.max(
            0,
            usable
            -accountNatural
            -headerGap
          );


        setBrandWidth(
          Math.min(
            brandNatural,
            twoRowBrandRoom
          )
        );
      }
      let fitFrame=0;
      function scheduleFit(){
        if(fitFrame){
          return;
        }
        fitFrame=
          requestAnimationFrame(()=>{
            fitFrame=0;
            fit();
          });
      }
      if(window.ResizeObserver){
        const observer=
          new ResizeObserver(
            scheduleFit
          );
        /*
         * Header总宽度变化。
         */
        observer.observe(
          h
        );

        /*
         * 登录状态、用户名等变化时，
         * Account真实宽度也可能变化。
         *
         * Account是输入条件，
         * 所以允许观察。
         */
        observer.observe(
          account
        );

      }else{

        window.addEventListener(
          'resize',
          scheduleFit,
          {
            passive:true
          }
        );
      }

      /*
      * Navigation内容变化。
      *
      * 导航按钮可能因为：
      *
      * 权限
      * 配置
      * 登录状态
      * 页面更新
      * 语言切换
      *
      * 被增加、删除、隐藏或修改文字。
      *
      * Grid中的nav容器宽度本身可能不会变化，
      * 所以ResizeObserver不能可靠发现这种情况。
      */
      const navMutationObserver=
        new MutationObserver(
          scheduleFit
        );


      navMutationObserver.observe(
        nav,
        {
          /*
          * 添加 / 删除导航按钮。
          */
          childList:true,

          /*
          * 监听按钮内部文字或图标结构变化。
          */
          subtree:true,

          /*
          * 导航文字本身发生改变。
          */
          characterData:true,

          /*
          * 某个导航按钮通过属性被隐藏或改变样式。
          */
          attributes:true,

          attributeFilter:[
            'hidden',
            'class',
            'style'
          ]
        }
      );

      /*
       * 阅读字号变化也会改变导航按钮宽度。
       */
      document.addEventListener(
        'public-reading-change',
        scheduleFit
      );


      document.fonts?.ready.then(
        scheduleFit
      );


      scheduleFit();
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
  function smoothScrollToX(
  element,
  target,
  duration=1000,
  onDone=null
  ){
    let start=element.scrollLeft;
    let remaining=duration;
    let startTime=0;
    let raf=0;
    let paused=false;
    let cancelled=false;

    function ease(t){
      return t<0.5
      ? 4*t*t*t
      : 1-Math.pow(-2*t+2,3)/2;
    }

    function frame(now){
      if(
      cancelled||
      paused||
      !element.isConnected
      ){
      return;
      }

      if(!startTime){
      startTime=now;
      }

      const distance=target-start;

      if(Math.abs(distance)<1){
      element.scrollLeft=target;
      raf=0;
      onDone?.();
      return;
      }

      const elapsed=
      now-startTime;

      const progress=
      Math.min(
        elapsed/remaining,
        1
      );

      element.scrollLeft=
      start+
      distance*ease(progress);

      if(progress<1){
      raf=requestAnimationFrame(frame);
      }else{
      raf=0;
      element.scrollLeft=target;
      onDone?.();
      }
    }

    function pause(){
      if(
      paused||
      cancelled
      ){
      return;
      }

      paused=true;

      if(raf){
      cancelAnimationFrame(raf);
      raf=0;
      }

      const elapsed=
      startTime
        ? Math.min(
          performance.now()-startTime,
          remaining
          )
        : 0;

      remaining=
      Math.max(
        120,
        remaining-elapsed
      );

      /*
      * 记录暂停时真实位置。
      * 用户暂停期间即使使用滚轮改变了位置，
      * resume() 也会重新从当前位置继续。
      */
      start=element.scrollLeft;
      startTime=0;
    }

    function resume(){
      if(
      !paused||
      cancelled
      ){
      return;
      }

      paused=false;

      start=
      element.scrollLeft;

      startTime=0;

      raf=
      requestAnimationFrame(frame);
    }

    function cancel(){
      cancelled=true;
      paused=false;

      if(raf){
      cancelAnimationFrame(raf);
      raf=0;
      }
    }

    raf=
      requestAnimationFrame(frame);

    return {
      pause,
      resume,
      cancel,

      get paused(){
      return paused;
      }
    };
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
    timer:0,

    /*
      * 页面进入时鼠标可能本来就在导航区域。
      */
    pointerInside:nav.matches(':hover'),

    /*
      * 当前自动滚动动画。
      */
    animation:null,

    /*
      * 当前等待过程。
      */
    wait:null,

    /*
      * 自动提示完成后用于删除临时 hover 监听。
      */
    onMouseEnter:null,
    onMouseLeave:null
  };

  states.set(nav,state);
  /*
  * 可暂停的延迟。
  *
  * 用于：
  * 进入页面后的 550ms 等待；
  * 滚动到右侧后的 1000ms 停留。
  */
  function createPausableDelay(
  delay,
  callback
  ){
    let remaining=delay;
    let startedAt=0;
    let timer=0;
    let paused=false;
    let cancelled=false;

    function run(){
      if(
      cancelled||
      paused
      ){
      return;
      }

      startedAt=
      performance.now();

      timer=setTimeout(()=>{
      timer=0;

      if(
        cancelled||
        paused
      ){
        return;
      }

      callback?.();

      },remaining);
    }

    function pause(){
      if(
      paused||
      cancelled
      ){
      return;
      }

      paused=true;

      if(timer){
      const elapsed=
        performance.now()-
        startedAt;

      remaining=
        Math.max(
        0,
        remaining-elapsed
        );

      clearTimeout(timer);
      timer=0;
      }
    }

    function resume(){
      if(
      !paused||
      cancelled
      ){
      return;
      }

      paused=false;
      run();
    }

    function cancel(){
      cancelled=true;
      paused=false;

      if(timer){
      clearTimeout(timer);
      timer=0;
      }
    }

    run();

    return {
      pause,
      resume,
      cancel,

      get paused(){
      return paused;
      }
    };
  }


  /*
  * 鼠标进入导航区域：
  * 暂停等待和正在运行的动画。
  */
  function onMouseEnter(){
  state.pointerInside=true;

  state.wait?.pause();
  state.animation?.pause();
  }


  /*
  * 鼠标离开：
  * 从原来的地方继续。
  */
  function onMouseLeave(){
  state.pointerInside=false;

  state.wait?.resume();
  state.animation?.resume();
  }

  state.onMouseEnter=
  onMouseEnter;

  state.onMouseLeave=
  onMouseLeave;

  nav.addEventListener(
  'mouseenter',
  onMouseEnter
  );

  nav.addEventListener(
  'mouseleave',
  onMouseLeave
  );

  /*
  * 鼠标滚轮控制导航水平滚动。
  *
  * wheel 只更新目标位置，
  * 实际位置通过 requestAnimationFrame
  * 平滑追踪目标，避免每一格滚轮直接跳变。
  */
  let wheelTarget=
  nav.scrollLeft;

  let wheelRaf=0;

  /*
  * 越小越柔和、越慢。
  *
  * 推荐：
  * 0.18 = 较快
  * 0.14 = 柔和
  * 0.10 = 很柔和
  */
  const WHEEL_SMOOTHNESS=.12;

  /*
  * 单次鼠标滚轮最多增加的目标距离。
  * 数值越小，每格滚轮移动越细腻。
  */
  const WHEEL_MAX_STEP=70;

  function animateWheelScroll(){

  if(!nav.isConnected){
    wheelRaf=0;
    return;
  }

  const current=
    nav.scrollLeft;

  const distance=
    wheelTarget-current;

  /*
    * 已经非常接近目标，
    * 直接准确落到目标位置并结束 RAF。
    */
  if(Math.abs(distance)<.5){
    nav.scrollLeft=
    wheelTarget;

    wheelRaf=0;
    return;
  }

  /*
    * 每一帧只移动剩余距离的一部分。
    *
    * 因此效果是：
    * 开始较明显，
    * 然后越来越慢地靠近目标。
    */
  nav.scrollLeft=
    current+
    distance*
    WHEEL_SMOOTHNESS;

  wheelRaf=
    requestAnimationFrame(
    animateWheelScroll
    );
  }

  nav.addEventListener(
  'wheel',
  e=>{

    if(window.innerWidth<=650){
    return;
    }

    const maxScroll=
    nav.scrollWidth-
    nav.clientWidth;

    if(maxScroll<=2){
    return;
    }

    /*
    * 触控板本身存在明显 deltaX 时，
    * 使用水平输入；
    * 普通鼠标则使用 deltaY。
    */
    let delta=
    Math.abs(e.deltaX)>
    Math.abs(e.deltaY)
      ? e.deltaX
      : e.deltaY;

    if(!delta){
    return;
    }

    /*
    * 统一不同浏览器/设备的 wheel 单位。
    */
    if(e.deltaMode===1){
    delta*=16;
    }else if(e.deltaMode===2){
    delta*=
      nav.clientWidth*.8;
    }

    /*
    * 防止某些鼠标一次产生非常大的 delta。
    */
    delta=
    Math.sign(delta)*
    Math.min(
      Math.abs(delta),
      WHEEL_MAX_STEP
    );

    /*
    * 如果当前没有滚轮动画，
    * 目标位置必须以真实 scrollLeft 为起点。
    *
    * 这样可以兼容：
    * 自动提示动画、
    * 鼠标拖动、
    * 浏览器恢复滚动位置。
    */
    if(!wheelRaf){
    wheelTarget=
      nav.scrollLeft;
    }

    /*
    * 判断用户是不是已经到达边界。
    *
    * 到边界后继续往外滚时，
    * 不拦截 wheel，
    * 让页面恢复正常上下滚动。
    */
    const atLeft=
    nav.scrollLeft<=.5 &&
    wheelTarget<=.5;

    const atRight=
    nav.scrollLeft>=maxScroll-.5 &&
    wheelTarget>=maxScroll-.5;

    if(
    (delta<0&&atLeft)||
    (delta>0&&atRight)
    ){
    return;
    }

    e.preventDefault();

    /*
    * 连续滚轮时不是从当前画面位置重新计算，
    * 而是在已有目标位置基础上继续累加。
    *
    * 所以快速连续滚动也会保持连贯。
    */
    wheelTarget=
    Math.max(
      0,
      Math.min(
      maxScroll,
      wheelTarget+delta
      )
    );

    /*
    * 只有不存在动画时才启动新的 RAF。
    * 已运行时只更新 wheelTarget。
    */
    if(!wheelRaf){
    wheelRaf=
      requestAnimationFrame(
      animateWheelScroll
      );
    }

  },{
    passive:false
  }
  );
  
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
    * 从这里开始锁定本次自动提示。
    * 避免其他 kick() 重复启动第二套动画。
    */
    state.done=true;
    state.running=false;


    /*
    * 真正开始向右滚动。
    */
    function startOutwardScroll(){

    if(!nav.isConnected){
      cleanup();
      return;
    }

    const latestMax=
      nav.scrollWidth-
      nav.clientWidth;

    if(latestMax<=4){
      cleanup();
      return;
    }

    state.wait=null;

    state.animation=
      smoothScrollToX(
      nav,
      Math.min(
        startLeft+distance,
        latestMax
      ),
      1100,
      ()=>{

        state.animation=null;

        /*
        * 到右侧以后停留 1000ms。
        *
        * 如果鼠标进入，
        * 这 1000ms 也会暂停计时。
        */
        state.wait=
        createPausableDelay(
          800,
          ()=>{

          state.wait=null;

          if(!nav.isConnected){
            cleanup();
            return;
          }

          /*
            * 平滑返回原位置。
            */
          state.animation=
            smoothScrollToX(
            nav,
            startLeft,
            1100,
            ()=>{

              state.animation=null;

              /*
              * 自动提示彻底结束。
              */
              if(
              state.onMouseEnter
              ){
              nav.removeEventListener(
                'mouseenter',
                state.onMouseEnter
              );
              }

              if(
              state.onMouseLeave
              ){
              nav.removeEventListener(
                'mouseleave',
                state.onMouseLeave
              );
              }

              cleanup();
            }
            );

          /*
            * 如果鼠标恰好仍在导航栏，
            * 返回动画也先暂停。
            */
          if(state.pointerInside){
            state.animation.pause();
          }
          }
        );

        /*
        * 如果到达右侧的一刻，
        * 鼠标正在导航区域，
        * 停留计时先不要继续。
        */
        if(state.pointerInside){
        state.wait.pause();
        }
      }
      );

    /*
      * 如果鼠标当前已经在导航区域，
      * 刚创建的动画立即暂停。
    */
    if(state.pointerInside){
      state.animation.pause();
    }
    }


    /*
    * 原来这里直接 setTimeout(...,550)。
    *
    * 现在改为可暂停的 550ms 等待。
    *
    * 页面刚进入时，如果鼠标已经在导航区域，
    * 这 550ms 根本不会继续计算，
    * 直到鼠标离开。
    */
    state.wait=
    createPausableDelay(
      550,
      startOutwardScroll
    );

    if(state.pointerInside){
    state.wait.pause();
    }
    
   
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
