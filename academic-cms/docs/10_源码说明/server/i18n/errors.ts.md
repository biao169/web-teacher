# server / i18n / errors.ts

## 文件定位

- **源码路径**：`server/i18n/errors.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：9 行，263 字节
- **内容校验**：SHA-256 `4387946dee4439c6af0df1d072ad457f9247021754f4f30571c7a67644ca9dfa`

## 直接调用方

- `server/i18n/fingerprint.ts`
- `server/i18n/source-ref.ts`
- `server/services/i18n/translation-reader.ts`
- `server/services/i18n/translation-store.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `I18nError.constructor` | 构造方法，第 4 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/i18n/fingerprint.ts`、`server/i18n/source-ref.ts`、`server/services/i18n/translation-reader.ts` 等模块导入使用。 |

### 调用签名

- `I18nError.constructor`：`constructor(readonly code: I18nErrorCode, message: string, options?: ErrorOptions)`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `I18nErrorCode` | 类型，第 1 行 | 约束 I18n Error Code 的数据结构或可选值 |
| `I18nError` | 类，第 3 行 | 封装 I18n Error 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
