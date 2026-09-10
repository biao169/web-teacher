# shared / enums / media.ts

## 文件定位

- **源码路径**：`shared/enums/media.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享枚举；集中约束领域状态和可选值。
- **规模**：44 行，1371 字节
- **内容校验**：SHA-256 `7e28d631070837a65827533b34de5a9bccbb9caf69004c598f6b175f5608a24d`

## 直接依赖

- `./auth`

## 直接调用方

- `server/media/grants.ts`
- `server/services/media/media-service.ts`
- `shared/admin/content-modules.ts`
- `shared/contracts/media.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `isMediaStorageKind` | 函数，第 33 行 | 检查 Media Storage Kind 是否满足业务、安全或类型约束 | 由 `server/media/grants.ts`、`server/services/media/media-service.ts`、`shared/admin/content-modules.ts` 等模块导入使用。 |
| `isMediaPurpose` | 函数，第 37 行 | 检查 Media Purpose 是否满足业务、安全或类型约束 | 由 `server/media/grants.ts`、`server/services/media/media-service.ts`、`shared/admin/content-modules.ts` 等模块导入使用。 |
| `isMediaDisposition` | 函数，第 41 行 | 检查 Media Disposition 是否满足业务、安全或类型约束 | 由 `server/media/grants.ts`、`server/services/media/media-service.ts`、`shared/admin/content-modules.ts` 等模块导入使用。 |

### 调用签名

- `isMediaStorageKind`：`export function isMediaStorageKind(value: unknown): value is MediaStorageKind`
- `isMediaPurpose`：`export function isMediaPurpose(value: unknown): value is MediaPurpose`
- `isMediaDisposition`：`export function isMediaDisposition(value: unknown): value is MediaDisposition`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MEDIA_STORAGE_KINDS` | 导出常量，第 3 行 | 提供 MEDIA STORAGE KINDS 的共享配置或不可变数据 |
| `MediaStorageKind` | 类型，第 4 行 | 约束 Media Storage Kind 的数据结构或可选值 |
| `MEDIA_STATUSES` | 导出常量，第 6 行 | 提供 MEDIA STATUSES 的共享配置或不可变数据 |
| `MediaStatus` | 类型，第 7 行 | 约束 Media Status 的数据结构或可选值 |
| `MEDIA_PURPOSES` | 导出常量，第 9 行 | 提供 MEDIA PURPOSES 的共享配置或不可变数据 |
| `MediaPurpose` | 类型，第 22 行 | 约束 Media Purpose 的数据结构或可选值 |
| `MEDIA_DISPOSITIONS` | 导出常量，第 24 行 | 提供 MEDIA DISPOSITIONS 的共享配置或不可变数据 |
| `MediaDisposition` | 类型，第 25 行 | 约束 Media Disposition 的数据结构或可选值 |
| `MediaVisibility` | 类型，第 27 行 | 约束 Media Visibility 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
