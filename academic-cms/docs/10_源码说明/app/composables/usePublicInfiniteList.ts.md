# app/composables/usePublicInfiniteList.ts

## 文件定位

- **源码路径**：`app/composables/usePublicInfiniteList.ts`
- **功能定位**：保留分页串行、去重、取消和版本校验；关闭底部加载的自动请求重试，失败时由现有原位控件重试。
- **规模**：68 行，4878 字节
- **内容校验**：SHA-256 `4aeada5c39946b7a6736a6eefbb784ffb8d6adec8132f72f2e8adbff1873479d`

## 使用与维护

保留分页串行、去重、取消和版本校验；关闭底部加载的自动请求重试，失败时由现有原位控件重试。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-content`
- `~~/shared/utils/public-list-link`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
