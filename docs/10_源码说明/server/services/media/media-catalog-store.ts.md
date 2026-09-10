# server / services / media / media-catalog-store.ts

## 文件定位

- **源码路径**：`server/services/media/media-catalog-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：132 行，6371 字节
- **内容校验**：SHA-256 `cf0ed9f783d2d91718c06d6b03ae4a37da13b7b7b01f25adfd2864b31ec93185`

## 直接依赖

- `../../../db/codec`
- `../../../db/contracts`
- `../../../db/errors`
- `../../../db/models`
- `../../../db/query`
- `../../cache/keys`
- `../../media/errors`

## 直接调用方

- `server/services/media/media-service.ts`
- `server/utils/media-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `uniqueTags` | 函数，第 20 行 | 封装 Tags 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `generationCommands` | 函数，第 25 行 | 封装 Commands 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `parseAssets` | 函数，第 34 行 | 解析 Assets 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `parseGenerations` | 函数，第 45 行 | 解析 Generations 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `pdfPolicy` | 函数，第 60 行 | 封装 Policy 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `MediaCatalogStore.constructor` | 构造方法，第 68 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaCatalogStore.loadAsset` | 类方法，第 70 行 | 加载并刷新 Asset，同步界面或运行时状态 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaCatalogStore.assetsByKeys` | 类方法，第 77 行 | One adapter batch, even when the database parameter limit requires chunks. | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaCatalogStore.projectionData` | 类方法，第 90 行 | Reads every page media record, its authorization generations and the PDF | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaCatalogStore.deliveryData` | 类方法，第 116 行 | One delivery request performs one catalog batch before touching storage. | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |

### 调用签名

- `uniqueTags`：`function uniqueTags(tagsInput: readonly string[]): string[]`
- `generationCommands`：`function generationCommands(tags: readonly string[]): SqlCommand[]`
- `parseAssets`：`function parseAssets(results: readonly QueryResult[], expectedKeys: readonly string[]): Map<string, Row<'media_assets'>>`
- `parseGenerations`：`function parseGenerations(results: readonly QueryResult[], expectedTags: readonly string[]): Map<string, number>`
- `pdfPolicy`：`function pdfPolicy(row: RawRow | undefined): boolean`
- `MediaCatalogStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `MediaCatalogStore.loadAsset`：`async loadAsset(objectKey: string): Promise<Row<'media_assets'> | null>`
- `MediaCatalogStore.assetsByKeys`：`async assetsByKeys(keysInput: readonly string[]): Promise<Map<string, Row<'media_assets'>>>`
- `MediaCatalogStore.projectionData`：`async projectionData( keysInput: readonly string[], tagsInput: readonly string[], options:`
- `MediaCatalogStore.deliveryData`：`async deliveryData(objectKey: string, tagsInput: readonly string[]): Promise<MediaDeliveryCatalog>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MediaProjectionCatalog` | 接口，第 9 行 | 约束 Media Projection Catalog 的数据结构或可选值 |
| `MediaDeliveryCatalog` | 接口，第 15 行 | 约束 Media Delivery Catalog 的数据结构或可选值 |
| `MediaCatalogStore` | 类，第 67 行 | 封装 Media Catalog Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
