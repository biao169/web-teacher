# server / media / http.ts

## 文件定位

- **源码路径**：`server/media/http.ts`
- **文件类型**：程序/脚本
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：175 行，7211 字节
- **内容校验**：SHA-256 `ca193d1af8e144584039c89a91bc244861f2ea9ec21553b97dc797b3f538bc97`

## 直接依赖

- `../../shared/utils/unicode`
- `./errors`
- `./store`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `safeMimeType` | 函数，第 42 行 | Unsafe active formats such as HTML, JavaScript, XML and SVG are downgraded. |
| `isInlineMediaType` | 函数，第 48 行 | 根据 Inline Media Type 返回对应的展示类型或颜色语义 |
| `mediaKind` | 函数，第 52 行 | 封装 Kind 相关逻辑，供本文件或上层模块按其参数调用 |
| `parseSingleRange` | 函数，第 60 行 | 解析 Single Range 的输入格式，并输出受约束的数据结构 |
| `stripWeak` | 函数，第 89 行 | 封装 Weak 相关逻辑，供本文件或上层模块按其参数调用 |
| `etagList` | 函数，第 90 行 | 封装 List 相关逻辑，供本文件或上层模块按其参数调用 |
| `normalizeHttpEtag` | 函数，第 92 行 | 规范化 Http Etag，消除不安全或不一致的输入形式 |
| `evaluateMediaPreconditions` | 函数，第 107 行 | 封装 Media Preconditions 相关逻辑，供本文件或上层模块按其参数调用 |
| `ifRangeMatches` | 函数，第 136 行 | 封装 Range Matches 相关逻辑，供本文件或上层模块按其参数调用 |
| `safeDownloadName` | 函数，第 145 行 | 封装 Download Name 相关逻辑，供本文件或上层模块按其参数调用 |
| `contentDisposition` | 函数，第 155 行 | 封装 Disposition 相关逻辑，供本文件或上层模块按其参数调用 |
| `strongChecksumEtag` | 函数，第 162 行 | 封装 Checksum Etag 相关逻辑，供本文件或上层模块按其参数调用 |
| `mediaCacheControl` | 函数，第 167 行 | Managed public URLs are short-lived capabilities, so cache lifetime never exceeds the grant. |

### 调用签名

- `safeMimeType`：`export function safeMimeType(input: string | null | undefined): string`
- `isInlineMediaType`：`export function isInlineMediaType(input: string): boolean`
- `mediaKind`：`export function mediaKind(input: string | null | undefined): 'image' | 'video' | 'pdf' | 'file'`
- `parseSingleRange`：`export function parseSingleRange(header: string | null | undefined, size: number): ResolvedRange | null`
- `stripWeak`：`function stripWeak(etag: string): string`
- `etagList`：`function etagList(header: string): string[]`
- `normalizeHttpEtag`：`export function normalizeHttpEtag(etag: string): string`
- `evaluateMediaPreconditions`：`export function evaluateMediaPreconditions( request: MediaPreconditions, metadata: { etag: string; lastModified: Date }, method: 'GET' | 'HEAD' = 'GET', ): 304 | 412 | null`
- `ifRangeMatches`：`export function ifRangeMatches(value: string | null | undefined, metadata: { etag: string; lastModified: Date }): boolean`
- `safeDownloadName`：`export function safeDownloadName(input: string | null | undefined, fallback = 'download'): string`
- `contentDisposition`：`export function contentDisposition(fileName: string | null | undefined, download: boolean): string`
- `strongChecksumEtag`：`export function strongChecksumEtag(checksum: string | null | undefined, fallback: string): string`
- `mediaCacheControl`：`export function mediaCacheControl(isPublic: boolean, remainingGrantSeconds = 300): string`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
