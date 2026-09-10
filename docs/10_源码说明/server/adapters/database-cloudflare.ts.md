# server / adapters / database-cloudflare.ts

## 文件定位

- **源码路径**：`server/adapters/database-cloudflare.ts`
- **文件类型**：程序模块
- **功能定位**：平台适配器；屏蔽 Node、Cloudflare 或数据库驱动差异，向上层提供统一接口。
- **规模**：11 行，529 字节
- **内容校验**：SHA-256 `5dde04b16ed730e9f5ef391ad23b627a6f263df5b7185693233c8fd4fd8a9fe9`

## 直接依赖

- `../../db/context`
- `../../db/runtime/cloudflare`
- `@cloudflare/workers-types`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `getPlatformDatabase` | 函数，第 5 行 | 读取或定位 Platform Database，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `getPlatformDatabase`：`export function getPlatformDatabase(event: DatabaseRequest)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
