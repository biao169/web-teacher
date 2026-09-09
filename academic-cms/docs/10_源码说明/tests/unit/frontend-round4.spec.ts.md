# tests/unit/frontend-round4.spec.ts

## 文件定位

- **源码路径**：`tests/unit/frontend-round4.spec.ts`
- **功能定位**：实际Vue组件交互测试：按需展开并保留草稿、重复提交保护、429等待与不重放、会话故障重试、登录提示及导航常态和当前态。
- **规模**：95 行，7223 字节
- **内容校验**：SHA-256 `4fd33ae3949f9deeec2e5d09b6aa06f7166dc0eda038a34117d4dcb2881c704d`

## 使用与维护

实际Vue组件交互测试：按需展开并保留草稿、重复提交保护、429等待与不重放、会话故障重试、登录提示及导航常态和当前态。

## 直接依赖

- `vitest`
- `vue`
- `../../app/components/public/contact/ContactForm.vue`
- `../../app/components/public/contact/NewsMessages.vue`
- `../../app/components/public/NavigationLink.vue`
- `../../app/utils/request-backoff`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
