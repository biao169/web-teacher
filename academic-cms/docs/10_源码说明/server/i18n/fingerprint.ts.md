# server / i18n / fingerprint.ts

## 文件定位

- **源码路径**：`server/i18n/fingerprint.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：19 行，974 字节
- **内容校验**：SHA-256 `50dc0c0045f9fd9a24624a93e4516a229ed68ac60d3deb46bd7427b7ec93eba9`

## 直接依赖

- `../../shared/utils/unicode`
- `../view-model/serializer`
- `./errors`

## 直接调用方

- `db/seeds/sample-data.ts`
- `server/services/complete-admin/translation-service.ts`
- `server/services/i18n/translation-reader.ts`
- `server/services/i18n/translation-store.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `canonicalSourceText` | 函数，第 8 行 | 规范化 Source Text，消除不安全或不一致的输入形式 | 由 `db/seeds/sample-data.ts`、`server/services/complete-admin/translation-service.ts`、`server/services/i18n/translation-reader.ts` 等模块导入使用。 |
| `translationSourceHash` | 函数，第 15 行 | 封装 Source Hash 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`server/services/complete-admin/translation-service.ts`、`server/services/i18n/translation-reader.ts` 等模块导入使用。 |

### 调用签名

- `canonicalSourceText`：`export function canonicalSourceText(value: string): string`
- `translationSourceHash`：`export async function translationSourceHash(sourceText: string, sourceLang: 'zh' = 'zh'): Promise<string>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
