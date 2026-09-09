# nuxt.config.ts

## 文件定位

- **源码路径**：`nuxt.config.ts`
- **功能定位**：将通用限流限定到API并划分公开读取、留言、认证、后台及PDF额度；文档和静态资源不再共用默认读取额度，保留敏感操作业务限流和现有安全策略。
- **规模**：239 行，9488 字节
- **内容校验**：SHA-256 `7f5e310bbb1b5dbcb028d49fe2f37d61606125c425739c9e1a0428e1518c9b16`

## 使用与维护

将通用限流限定到API并划分公开读取、留言、认证、后台及PDF额度；文档和静态资源不再共用默认读取额度，保留敏感操作业务限流和现有安全策略。

## 直接依赖

- `@tailwindcss/vite`
- `unplugin-element-plus/vite`
- `node:url`
- `./shared/utils/public-locale`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
