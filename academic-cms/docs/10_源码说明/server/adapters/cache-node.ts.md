# server / adapters / cache-node.ts

## 文件定位

- **源码路径**：`server/adapters/cache-node.ts`
- **文件类型**：程序模块
- **功能定位**：平台适配器；屏蔽 Node、Cloudflare 或数据库驱动差异，向上层提供统一接口。
- **规模**：21 行，819 字节
- **内容校验**：SHA-256 `f9a869752051d3e65d29efa5397c55a7173ef5da9c68fdc185c91ea52c67fb0e`

## 直接依赖

- `../cache/config`
- `../cache/contracts`
- `../cache/memory-adapter`
- `h3`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `getPlatformCache` | 函数，第 8 行 | 读取或定位 Platform Cache，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `getPlatformCache`：`export function getPlatformCache(_event: H3Event, config: CacheRuntimeConfig): RawCacheAdapter`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
