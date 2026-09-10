# app/components/public/SiteHeader.vue

## 文件定位

- **源码路径**：`app/components/public/SiteHeader.vue`
- **功能定位**：在现有页头直接复用登录会话与权限注册表；登录/退出及后台入口放在顶部导航区域，下方字号和语言行显示账号姓名，保留登录返回路径及退出防重复与错误提示。
- **规模**：146 行，7641 字节
- **内容校验**：SHA-256 `e0481a7c81d593775707a47256632f37b8114b4b4abed47950fc7ae032bb1ec5`

## 使用与维护

在现有页头直接复用登录会话与权限注册表；登录/退出及后台入口放在顶部导航区域，下方字号和语言行显示账号姓名，保留登录返回路径及退出防重复与错误提示。

## 直接依赖

- `@lucide/vue`
- `~~/shared/admin/registry`
- `~~/shared/contracts/public-site`
- `~~/shared/utils/locale-path`
- `~/composables/usePublicReadingMode`
- `./ReadingControls.vue`
- `./NavigationLink.vue`
- `~~/shared/utils/public-locale`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
