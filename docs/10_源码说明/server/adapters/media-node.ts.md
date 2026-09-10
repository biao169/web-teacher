# server / adapters / media-node.ts

## 文件定位

- **源码路径**：`server/adapters/media-node.ts`
- **文件类型**：程序模块
- **功能定位**：平台适配器；屏蔽 Node、Cloudflare 或数据库驱动差异，向上层提供统一接口。
- **规模**：42 行，1856 字节
- **内容校验**：SHA-256 `26d7173a651b99d7ba4e46386a10b6e9a1c033ec0ccebfcc54203a89cddcfc64`

## 直接依赖

- `../media/config`
- `../media/local-store`
- `../services/media/media-service`
- `h3`
- `node:path`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `contains` | 函数，第 9 行 | 封装 contains 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `resolveNodeMediaRoots` | 函数，第 13 行 | 读取或定位 Node Media Roots，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `getPlatformMediaStores` | 函数，第 30 行 | 读取或定位 Platform Media Stores，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `contains`：`function contains(root: string, candidate: string): boolean`
- `resolveNodeMediaRoots`：`export function resolveNodeMediaRoots(config: Pick<MediaRuntimeConfig, 'mediaRoot' | 'staticMediaRoot' | 'maxObjectBytes'>):`
- `getPlatformMediaStores`：`export function getPlatformMediaStores(_event: H3Event, config: MediaRuntimeConfig): MediaStoreSet`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
