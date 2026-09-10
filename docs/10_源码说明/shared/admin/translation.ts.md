# shared / admin / translation.ts

- **源码路径**：`shared/admin/translation.ts`

## 定位

前后端共享翻译配置、错误文案、合并标记与分段纯函数。默认值集中维护，不依赖数据库或网络，不包含密钥常量。

| 方法/常量 | 用途与用法 |
| --- | --- |
| TRANSLATION_PROVIDERS / TranslationProvider | 现有 5 个服务标识与类型 |
| TRANSLATION_DEFAULTS | 默认服务 mymemory，批量 10、并发 1、超时 15 秒 |
| MYMEMORY_MAX_BYTES | q 的 UTF-8 字节上限 500，分隔标记也计入 |
| clean / providerName | 规范化设置值并限定已知服务 |
| boundedInteger | 为缺失、无效整数提供默认值并限制最大值 |
| endpointReady | 检查 HTTPS 或本地开发 HTTP 地址，拒绝 URL 内嵌用户名/密码 |
| resolveTranslationConfig(settings) | 计算服务白名单、首选/可用服务、警告及任务参数；返回摘要不含密钥 |
| translationFailureMessage(code) | 为错误码提供统一中文说明 |
| buildTranslationEnvelope(texts, token) | 为各字段插入唯一、顺序化标记 |
| parseTranslationEnvelope(text, markers) | 验证标记顺序、缺失、重复和空结果，再恢复字段顺序 |
| splitTranslationText(text, maxBytes) | 按 UTF-8 字节上限分段；优先句子或词边界，保证原始片段拼接不丢字符 |
| planTranslationBatches(rows, maxItems, maxCharacters) | 按来源表分组，再限制批次数量及字符预算 |

调用方包含翻译服务、供应商请求客户端和后台翻译界面。修改配置语义应同步全局设置帮助文案和翻译回归用例。

## 当前源码校验

- **规模**：132 行，9008 字节
- **内容校验**：SHA-256 `aee34d8b86f7bbefaee2ebf2883c690fc14126f41cb7acd1ba3d4ac33c733a50`
