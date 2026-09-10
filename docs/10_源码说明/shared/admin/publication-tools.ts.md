# shared / admin / publication-tools.ts

## 文件定位

- **源码路径**：`shared/admin/publication-tools.ts`
- **文件类型**：程序/脚本
- **功能定位**：纯函数论文工具：解析 BibTeX、IEEE、APA、GB/T 和常见 Elsevier 引文，归一化 DOI，生成引用与主页教师姓名高亮。
- **规模**：498 行，23119 字节
- **内容校验**：SHA-256 `d550ca42cce83b4b04d05f597fd436e7f1e1fe40b7918785896f849629978a63`

## 直接依赖

无显式 import；可能由 Nuxt 自动导入、框架默认入口或声明式配置接入。

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `clean` | 函数，第 42 行 | 文本 NFC 与空白归一化，供引文解析和生成。 |
| `cleanTerminal` | 函数，第 46 行 | 规范化空白并清除段首段尾引文标点。 |
| `normalizePublicationDoi` | 函数，第 50 行 | 移除 DOI 标签/链接前缀、提取 DOI 并去除尾部引文标点。 |
| `normalizePublicationTitle` | 函数，第 56 行 | 标题转小写，去标点符号和空白，供查新相似度比较。 |
| `publicationTitleSimilarity` | 函数，第 62 行 | 先比较完全相同或包含关系，再计算相邻字符对的 Dice 相似度。 |
| `pairs` | 函数变量，第 68 行 | 构造相邻字符对集合，供标题相似度运算。 |
| `bibtexValue` | 函数，第 81 行 | 读取花括号或引号包裹的 BibTeX 字段值。 |
| `bibtexType` | 函数，第 86 行 | 把 BibTeX 条目类型映射为论文类型。 |
| `parseBibtex` | 函数，第 95 行 | 按 BibTeX 常见标点、作者与年份位置提取字段；通过统一结果整理输出，歧义留给人工核对。 |
| `detectFormat` | 函数，第 116 行 | 识别输入更可能属于 BibTeX、GB/T、APA、IEEE 或通用格式。 |
| `finishParse` | 函数，第 126 行 | 清理解析字段、补充共同信息与提示，形成格式和置信度结果。 |
| `citationParts` | 函数，第 133 行 | 拆分常见引文段落，供各格式解析器使用。 |
| `parseGbt` | 函数，第 141 行 | 按 GB/T 常见标点、作者与年份位置提取字段；通过统一结果整理输出，歧义留给人工核对。 |
| `parseApa` | 函数，第 160 行 | 按 APA 常见标点、作者与年份位置提取字段；通过统一结果整理输出，歧义留给人工核对。 |
| `parseIeee` | 函数，第 177 行 | 按 IEEE 常见标点、作者与年份位置提取字段；通过统一结果整理输出，歧义留给人工核对。 |
| `parseElsevierOrGeneric` | 函数，第 196 行 | 按 Elsevier/通用 常见标点、作者与年份位置提取字段；通过统一结果整理输出，歧义留给人工核对。 |
| `parsePublicationCitation` | 函数，第 212 行 | 公共解析入口；根据格式选择解析器，返回字段、置信度与需人工核对的提示。 |
| `splitPublicationAuthors` | 函数，第 258 行 | 按支持的作者分隔形式拆分并清理姓名。 |
| `authorIdentity` | 函数，第 267 行 | 归一化作者姓名，供缩写或全名匹配。 |
| `latinAuthorTokens` | 函数，第 271 行 | 解析英文作者的姓、名及已有缩写片段。 |
| `authorMatches` | 函数，第 275 行 | 比较论文作者和主页教师全名或缩写是否匹配。 |
| `citationAuthorName` | 函数，第 298 行 | 按目标引用格式输出该作者的姓名顺序和缩写。 |
| `initials` | 函数，第 311 行 | 提取名的首字母并保留所需缩写标点。 |
| `apaAuthor` | 函数，第 317 行 | 生成 APA 的姓在前、名字缩写在后的作者写法。 |
| `ieeeAuthor` | 函数，第 323 行 | 生成 IEEE 的名字缩写在前、姓在后的作者写法。 |
| `elsevierAuthor` | 函数，第 329 行 | 按当前采用的 Elsevier numbered 风格生成作者写法。 |
| `gbtAuthors` | 函数，第 335 行 | 组合 GB/T 作者段及超出阈值时的省略标记。 |
| `apaAuthors` | 函数，第 340 行 | 组合 APA 多作者段，处理连接符与省略规则。 |
| `joinCitationAuthors` | 函数，第 347 行 | 按引用格式选择作者连接方式。 |
| `citationTypeMark` | 函数，第 356 行 | 依据论文类型确定 GB/T 文献类型标志。 |
| `bibtexEntryType` | 函数，第 365 行 | 把论文类型映射回 BibTeX 条目类型。 |
| `bibtexEscape` | 函数，第 374 行 | 转义 BibTeX 字段中的特殊字符。 |
| `bibtexKey` | 函数，第 378 行 | 根据稳定 UID 或作者年份生成 BibTeX 引用键。 |
| `matchedAuthors` | 函数，第 387 行 | 在作者列表中找出与主页教师名称匹配的姓名。 |
| `citationHighlights` | 函数，第 391 行 | 将已匹配作者转换为对应引文格式中实际出现的高亮片段。 |
| `compactSentence` | 函数，第 395 行 | 移除空片段并以适当空白组合引文。 |
| `endWithPeriod` | 函数，第 399 行 | 仅在需要时补全文本末尾句点。 |
| `generatePublicationCitations` | 函数，第 403 行 | 从当前论文输入生成四种引文、高亮和 BibTeX；返回缺失信息警告，不查询网络或保存数据库。 |

### 调用签名

- `clean`：`function clean(value: unknown): string`
- `cleanTerminal`：`function cleanTerminal(value: unknown): string`
- `normalizePublicationDoi`：`export function normalizePublicationDoi(value: unknown): string`
- `normalizePublicationTitle`：`export function normalizePublicationTitle(value: unknown): string`
- `publicationTitleSimilarity`：`export function publicationTitleSimilarity(left: unknown, right: unknown): number`
- `pairs`：`pairs = (value: string): Set<string> => …`
- `bibtexValue`：`function bibtexValue(source: string, key: string): string`
- `bibtexType`：`function bibtexType(source: string): string | undefined`
- `parseBibtex`：`function parseBibtex(source: string): PublicationCitationParseResult`
- `detectFormat`：`function detectFormat(source: string): PublicationCitationFormat`
- `finishParse`：`function finishParse(format: PublicationCitationFormat, candidate: PublicationMetadataFields, notes: readonly string[] = []): PublicationCitationParseResult`
- `citationParts`：`function citationParts(source: string): string[]`
- `parseGbt`：`function parseGbt(source: string, doi: string): PublicationCitationParseResult`
- `parseApa`：`function parseApa(source: string, doi: string): PublicationCitationParseResult`
- `parseIeee`：`function parseIeee(source: string, doi: string): PublicationCitationParseResult`
- `parseElsevierOrGeneric`：`function parseElsevierOrGeneric(source: string, doi: string, format: 'elsevier' | 'generic'): PublicationCitationParseResult`
- `parsePublicationCitation`：`export function parsePublicationCitation(value: unknown): PublicationCitationParseResult`
- `splitPublicationAuthors`：`function splitPublicationAuthors(value: unknown): string[]`
- `authorIdentity`：`function authorIdentity(value: unknown): string`
- `latinAuthorTokens`：`function latinAuthorTokens(value: unknown): string[]`
- `authorMatches`：`function authorMatches(candidate: string, profileName: string): boolean`
- `citationAuthorName`：`function citationAuthorName(value: string): CitationAuthorName`
- `initials`：`function initials(parts: readonly string[], spaced = true): string`
- `apaAuthor`：`function apaAuthor(value: string): string`
- `ieeeAuthor`：`function ieeeAuthor(value: string): string`
- `elsevierAuthor`：`function elsevierAuthor(value: string): string`
- `gbtAuthors`：`function gbtAuthors(authors: readonly string[]): string`
- `apaAuthors`：`function apaAuthors(authors: readonly string[]): string`
- `joinCitationAuthors`：`function joinCitationAuthors(authors: readonly string[], style: PublicationCitationStyle): string`
- `citationTypeMark`：`function citationTypeMark(value: unknown): string`
- `bibtexEntryType`：`function bibtexEntryType(value: unknown): string`
- `bibtexEscape`：`function bibtexEscape(value: unknown): string`
- `bibtexKey`：`function bibtexKey(source: PublicationCitationSource, authors: readonly string[]): string`
- `matchedAuthors`：`function matchedAuthors(authors: readonly string[], profileNames: readonly string[]): string[]`
- `citationHighlights`：`function citationHighlights(authors: readonly string[], style: PublicationCitationStyle): string`
- `compactSentence`：`function compactSentence(parts: readonly string[]): string`
- `endWithPeriod`：`function endWithPeriod(value: string): string`
- `generatePublicationCitations`：`export function generatePublicationCitations(source: PublicationCitationSource, profileNames: readonly string[] = []): PublicationCitationGenerationResult`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
