# app/utils/request-backoff.ts

## 文件定位

- **源码路径**：`app/utils/request-backoff.ts`
- **功能定位**：解析429的Retry-After秒数/日期及nuxt-security的x-ratelimit-reset毫秒时间戳，返回有界冷却时间，不自动重放写请求。
- **规模**：15 行，927 字节
- **内容校验**：SHA-256 `28212f02d9bf6d4b24cf5617da3d32738546cc5f97ea937500afb51854ffb36c`

## 使用与维护

解析429的Retry-After秒数/日期及nuxt-security的x-ratelimit-reset毫秒时间戳，返回有界冷却时间，不自动重放写请求。

## 直接依赖

由框架、构建脚本或项目配置接入。

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
