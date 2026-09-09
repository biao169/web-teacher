# server / api / v1 / admin / complete / translation / test.post.ts

- **源码路径**：`server/api/v1/admin/complete/translation/test.post.ts`

## 定位与用法

`POST /api/v1/admin/complete/translation/test` 为后台“检测翻译配置”入口。请求体 `{}`；只使用固定测试句，不接受任意文本作为翻译内容。

默认事件处理函数依次调用 `requireAdmin` 验证 translation/translation_cache 编辑权限并启用写请求防护，`readBoundedJson` 限制 1024 字节，然后调用 `CompleteAdminTranslationService.testConfiguration()`。异常交由 `mapAdminError`。

响应包含 success、configuration、provider、translated、code、message、providerRequests；不返回服务密钥，不写业务翻译缓存或全局设置。

## 当前源码校验

- **规模**：11 行，611 字节
- **内容校验**：SHA-256 `17c841b34948a9c1759692234debefe53036ef29c9d7bde119340d0f664e421d`
