# app/composables/usePublicCopy.ts

## 文件定位

- **源码路径**：`app/composables/usePublicCopy.ts`
- **功能定位**：共用直接复制控制器：有界公开请求、当前引用格式和业务字段序列化、在点击同步调用含Promise数据的ClipboardItem写入、进度/短反馈、失败手动文本和重新校验；新复制意图与上下文取消旧请求，SSR不共享用户状态。
- **规模**：66 行，4803 字节
- **内容校验**：SHA-256 `bfec3652add637ada450597e37d710f79f3423374ff1c58748850571ca057132`

## 使用与维护

共用直接复制控制器：有界公开请求、当前引用格式和业务字段序列化、在点击同步调用含Promise数据的ClipboardItem写入、进度/短反馈、失败手动文本和重新校验；新复制意图与上下文取消旧请求，SSR不共享用户状态。

命名函数：`usePublicCopy`、`reset`、`copy`、`retry`。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-selection`
- `~~/shared/utils/public-selection`
- `~~/shared/utils/public-copy`
- `~/utils/public-clipboard`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
