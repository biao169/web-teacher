# app/components/public/contact/ContactForm.vue

## 文件定位

- **源码路径**：`app/components/public/contact/ContactForm.vue`
- **功能定位**：共用双语留言表单，挂载时读取会话与留言设置；提供内联重试、禁止重复提交、服务器冷却倒计时和提交回执，支持新闻来源参数。
- **规模**：121 行，8488 字节
- **内容校验**：SHA-256 `15efe044b16f9f7404d61fbf87d5b8f107e2094cb998c24ec55f360d48923879`

## 使用与维护

共用双语留言表单，挂载时读取会话与留言设置；提供内联重试、禁止重复提交、服务器冷却倒计时和提交回执，支持新闻来源参数。

## 直接依赖

- `vue`
- `@lucide/vue`
- `~~/shared/contracts/interactions`
- `~/utils/interaction-errors`
- `~/utils/request-backoff`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
