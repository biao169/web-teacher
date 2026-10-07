/* 后台布局增强：只管理视口、导航与焦点，不处理业务保存或权限。 */
(() => {
  'use strict';
  const root = document.querySelector('[data-workspace]');
  if (!root) return;
  const sidebar = root.querySelector('.workspace-sidebar');
  const pane = root.querySelector('.workspace-pane');
  const backdrop = root.querySelector('.workspace-backdrop');
  const opener = root.querySelector('[data-drawer-open]');
  const toggle = root.querySelector('[data-sidebar-toggle]');
  const mobile = matchMedia('(max-width: 767px)');
  let open = false, collapsed = false;
  try { collapsed = localStorage.getItem('teacher.admin.sidebar') === 'collapsed'; } catch (_) { /* 存储不可用时采用展开状态。 */ }

  // 应用桌面偏好；移动抽屉始终保留完整文字，不沿用图标折叠状态。
  function render() {
    root.classList.toggle('sidebar-collapsed', collapsed && !mobile.matches);
    root.classList.toggle('drawer-visible', open && mobile.matches);
    sidebar.inert = mobile.matches && !open;
    pane.inert = mobile.matches && open;
    backdrop.hidden = !(mobile.matches && open);
    opener.setAttribute('aria-expanded', String(open && mobile.matches));
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '展开侧栏' : '收起侧栏');
    toggle.textContent = collapsed ? '»' : '«';
    if (mobile.matches && open) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); }
    else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
  }
  // 抽屉开启时聚焦关闭按钮；关闭时焦点回到打开按钮。
  function setOpen(value) {
    open = value; render();
    (value ? sidebar.querySelector('[data-drawer-close]') : opener).focus();
  }
  // 根据保存栏真实高度预留内容空间，覆盖窄屏换行、缩放和安全区域。
  function reserveActions() {
    const bar = root.querySelector('.save-bar');
    if (bar) root.style.setProperty('--save-reserve', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  }
  const bar = root.querySelector('.save-bar');
  if (bar) new ResizeObserver(reserveActions).observe(bar);
  // 适配软键盘和移动地址栏，固定操作区跟随当前可见视口。
  function viewport() {
    const view = window.visualViewport;
    root.style.setProperty('--workspace-height', `${view ? view.height : innerHeight}px`);
    root.style.setProperty('--workspace-top', `${view ? view.offsetTop : 0}px`);
  }
  toggle.addEventListener('click', () => {
    collapsed = !collapsed; render();
    try { localStorage.setItem('teacher.admin.sidebar', collapsed ? 'collapsed' : 'expanded'); } catch (_) { /* 偏好保存失败不影响当前操作。 */ }
  });
  opener.addEventListener('click', () => setOpen(true));
  root.querySelectorAll('[data-drawer-close]').forEach(button => button.addEventListener('click', () => setOpen(false)));
  root.addEventListener('keydown', event => {
    if (!open || !mobile.matches) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('a[href],button:not([disabled])')].filter(el => el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  mobile.addEventListener('change', () => { const hadFocus = sidebar.contains(document.activeElement); open = false; render(); if (mobile.matches && hadFocus) opener.focus(); viewport(); });
  root.querySelectorAll('[data-scroll-top]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); const main = root.querySelector('#main'); main.scrollTo({top: 0, behavior: 'auto'}); main.focus({preventScroll: true});
  }));
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport);
  document.documentElement.dataset.workspaceJs = 'true'; render(); viewport(); reserveActions();
})();
