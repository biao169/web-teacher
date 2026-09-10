# server / adapters / media-cloudflare.ts

## 文件定位

- **源码路径**：`server/adapters/media-cloudflare.ts`
- **文件类型**：程序模块
- **功能定位**：平台适配器；屏蔽 Node、Cloudflare 或数据库驱动差异，向上层提供统一接口。
- **规模**：16 行，893 字节
- **内容校验**：SHA-256 `dc273f1147b9ff66fa006ad2b52a2df102eb1d831a562164e573af8807eae8af`

## 直接依赖

- `../media/config`
- `../media/fetch-store`
- `../media/r2-store`
- `../services/media/media-service`
- `h3`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `getPlatformMediaStores` | 函数，第 7 行 | 读取或定位 Platform Media Stores，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `getPlatformMediaStores`：`export function getPlatformMediaStores(event: H3Event, config: MediaRuntimeConfig): MediaStoreSet`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
