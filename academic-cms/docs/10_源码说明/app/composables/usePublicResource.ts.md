# app/composables/usePublicResource.ts

## 文件定位

- **源码路径**：`app/composables/usePublicResource.ts`
- **功能定位**：列表与详情资源以取消过时请求方式去重，关闭隐式重试；真正触发429时保留状态码，交由本地化错误页面呈现。
- **规模**：57 行，2634 字节
- **内容校验**：SHA-256 `0386850450bc8f5b09f77d0d0f7986d07d15ec58c6b1c09133f786d7b69af304`

## 使用与维护

列表与详情资源以取消过时请求方式去重，关闭隐式重试；真正触发429时保留状态码，交由本地化错误页面呈现。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-site`

本轮实现与验证详见 `docs/43_前台留言与请求稳定性修复.md`。
