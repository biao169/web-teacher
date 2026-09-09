# db / seeds / sample-data.ts

## 文件定位

- **源码路径**：`db/seeds/sample-data.ts`
- **文件类型**：程序/脚本
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：391 行，33490 字节
- **内容校验**：SHA-256 `a90925155efa5a30da61384223549b43c7a3d3017870ec7ab79b9c6975802b3e`

## 直接依赖

- `../contracts`
- `../query`
- `../../server/security/password`
- `../../server/view-model/serializer`
- `../../server/i18n/source-ref`
- `../../server/i18n/fingerprint`
- `../../shared/enums/auth`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `iso` | 函数，第 66 行 | 检查 iso 是否满足业务、安全或类型约束 |
| `date` | 函数，第 69 行 | 封装 date 相关逻辑，供本文件或上层模块按其参数调用 |
| `assertPasswordHash` | 函数，第 70 行 | 检查 Password Hash 是否满足业务、安全或类型约束 |
| `jsonRowsCommand` | 函数，第 76 行 | 封装 Rows Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `sampleAssetFiles` | 函数，第 119 行 | 封装 Asset Files 相关逻辑，供本文件或上层模块按其参数调用 |
| `mediaRows` | 函数，第 123 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `roleRows` | 函数，第 133 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `userRows` | 函数，第 149 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `permissionRows` | 函数，第 162 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `demoOrcid` | 函数，第 173 行 | 封装 Orcid 相关逻辑，供本文件或上层模块按其参数调用 |
| `profileRows` | 函数，第 182 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `siteSettingRows` | 函数，第 199 行 | 封装 Setting Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `globalSettingRows` | 函数，第 210 行 | 封装 Setting Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `navigationRows` | 函数，第 221 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `researchRows` | 函数，第 230 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `publicationRows` | 函数，第 238 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `projectRows` | 函数，第 251 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `patentRows` | 函数，第 256 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `studentRows` | 函数，第 260 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `studentCategoryRows` | 函数，第 266 行 | 封装 Category Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `newsRows` | 函数，第 271 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `courseRows` | 函数，第 276 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `messageRows` | 函数，第 281 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `translationRows` | 函数，第 287 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `requiredText` | 函数变量，第 288 行 | 检查 Text 是否满足业务、安全或类型约束 |
| `operationLogRows` | 函数，第 311 行 | 封装 Log Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `securityTechnicalRows` | 函数，第 316 行 | 封装 Technical Rows 相关逻辑，供本文件或上层模块按其参数调用 |
| `hex` | 函数变量，第 317 行 | 封装 hex 相关逻辑，供本文件或上层模块按其参数调用 |
| `buildTables` | 函数，第 329 行 | 根据输入组装 Tables 所需的结果对象或结构 |
| `markerCommand` | 函数，第 361 行 | 封装 Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `buildSampleSeedCommands` | 函数，第 366 行 | 根据输入组装 Sample Seed Commands 所需的结果对象或结构 |
| `applySampleSeed` | 函数，第 379 行 | 执行 Sample Seed 所代表的完整处理流程 |

### 调用签名

- `iso`：`function iso(day: number, hour = 9): string`
- `date`：`function date(day: number): string`
- `assertPasswordHash`：`function assertPasswordHash(value: string): string`
- `jsonRowsCommand`：`function jsonRowsCommand(spec: SeedTable): SqlCommand`
- `sampleAssetFiles`：`export function sampleAssetFiles(): readonly Readonly<SampleAssetFile>[]`
- `mediaRows`：`function mediaRows(): SeedRow[]`
- `roleRows`：`function roleRows(): SeedRow[]`
- `userRows`：`function userRows(passwordHash: string): SeedRow[]`
- `permissionRows`：`function permissionRows(): SeedRow[]`
- `demoOrcid`：`function demoOrcid(index: number): string`
- `profileRows`：`function profileRows(): SeedRow[]`
- `siteSettingRows`：`function siteSettingRows(): SeedRow[]`
- `globalSettingRows`：`function globalSettingRows(): SeedRow[]`
- `navigationRows`：`function navigationRows(): SeedRow[]`
- `researchRows`：`function researchRows(): SeedRow[]`
- `publicationRows`：`function publicationRows(): SeedRow[]`
- `projectRows`：`function projectRows(): SeedRow[]`
- `patentRows`：`function patentRows(): SeedRow[]`
- `studentRows`：`function studentRows(): SeedRow[]`
- `studentCategoryRows`：`function studentCategoryRows(): SeedRow[]`
- `newsRows`：`function newsRows(): SeedRow[]`
- `courseRows`：`function courseRows(): SeedRow[]`
- `messageRows`：`function messageRows(): SeedRow[]`
- `translationRows`：`async function translationRows(research: readonly SeedRow[], news: readonly SeedRow[]): Promise<SeedRow[]>`
- `requiredText`：`requiredText = (row: SeedRow, field: string): string => …`
- `operationLogRows`：`function operationLogRows(): SeedRow[]`
- `securityTechnicalRows`：`async function securityTechnicalRows(crypto: Crypto): Promise<Record<string, SeedRow[]>>`
- `hex`：`hex = async (prefix:string,index:number)=> …`
- `buildTables`：`async function buildTables(passwordHash:string, crypto:Crypto):Promise<SeedTable[]>`
- `markerCommand`：`function markerCommand(seededAt:string,digest:string):SqlCommand`
- `buildSampleSeedCommands`：`export async function buildSampleSeedCommands(options:SampleSeedOptions):Promise<{commands:SqlCommand[];digest:string}>`
- `applySampleSeed`：`export async function applySampleSeed(adapter:DatabaseAdapter,options:SampleSeedOptions):Promise<SampleSeedResult>`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
