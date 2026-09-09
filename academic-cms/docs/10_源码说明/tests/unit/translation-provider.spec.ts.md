# tests / unit / translation-provider.spec.ts

- **源码路径**：`tests/unit/translation-provider.spec.ts`

使用受控 fetch 响应验证真实供应商客户端，包含 12 项用例：空配置、白名单、新配置、地址前缀、DeepL 套餐、MyMemory 字节与邮箱参数、Unicode 分段、HTTP 200 业务错误、短字段合并、长字段部分失败、Retry-After、允许范围内换源、成功字段保留、网络错误脱敏与超时取消。

`myMemory` 构造符合服务结构的测试响应；afterEach 恢复 fetch 与真实计时器。真实联网探测记录另见 docs/16，本文件不依赖外部网络，也不使用真实密钥。

运行：`pnpm exec vitest run tests/unit/translation-provider.spec.ts`。

## 当前源码校验

- **规模**：111 行，8265 字节
- **内容校验**：SHA-256 `e85df058b082ea4529bbac3790126df94d2d6e234aa7625c66faa402d13037fb`
