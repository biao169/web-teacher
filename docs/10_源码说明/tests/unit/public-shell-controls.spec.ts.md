# tests/unit/public-shell-controls.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-shell-controls.spec.ts`
- **功能定位**：复用现有页壳组件回归，增加顶部按钮与下方姓名的实际DOM位置、权限、退出防重复及错误重试验证。
- **规模**：216 行，17818 字节
- **内容校验**：SHA-256 `afeb6a34316b5a1df4e88b9abf00620bf2b827f6aa561eb165230701d5ab9985`

## 使用与维护

复用现有页壳组件回归，增加顶部按钮与下方姓名的实际DOM位置、权限、退出防重复及错误重试验证。

## 直接依赖

- `vitest`
- `vue`
- `../../app/components/public/SiteHeader.vue`
- `../../app/components/public/SiteFooter.vue`
- `../../app/components/public/content/PageHero.vue`
- `../../shared/contracts/auth`
- `../../shared/contracts/public-content`
- `../../app/components/public/home/Hero.vue`
- `../../app/composables/usePublicReadingMode`
- `../../shared/utils/public-list-link`
- `../../shared/contracts/public-site`

本轮实现与验证详见 `docs/45_顶部账号按钮与六位密码.md`。
