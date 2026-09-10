# shared / utils / http-etag.ts

## 文件定位

- **源码路径**：`shared/utils/http-etag.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享模块；提供跨运行时复用的类型、工具或后台定义。
- **规模**：53 行，2196 字节
- **内容校验**：SHA-256 `0d6dd56186334eea02e93b5b729095d08c74f6bcb799e4d42e72cee1f4ce2dd4`

## 直接调用方

- `server/utils/public-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `opaqueTag` | 函数，第 4 行 | 封装 Tag 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `entityTagList` | 函数，第 15 行 | 封装 Tag List 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `ifNoneMatchMatches` | 函数，第 43 行 | Implements weak If-None-Match comparison for safe GET/HEAD revalidation. | 由 `server/utils/public-http.ts` 等模块导入使用。 |

### 调用签名

- `opaqueTag`：`function opaqueTag(value: string): string | null`
- `entityTagList`：`function entityTagList(value: string): string[] | null`
- `ifNoneMatchMatches`：`export function ifNoneMatchMatches(header: string | null | undefined, currentEtag: string): boolean`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
