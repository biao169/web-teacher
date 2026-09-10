# server / adapters / database-node.ts

## 文件定位

- **源码路径**：`server/adapters/database-node.ts`
- **文件类型**：程序模块
- **功能定位**：平台适配器；屏蔽 Node、Cloudflare 或数据库驱动差异，向上层提供统一接口。
- **规模**：13 行，658 字节
- **内容校验**：SHA-256 `c9b5ff6f0501bfdf0db19907b1867444fb27620ddfcc99baeaed8787dc007856`

## 直接依赖

- `../../db/context`
- `../../db/runtime/node`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `getPlatformDatabase` | 函数，第 6 行 | 读取或定位 Platform Database，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `closePlatformDatabase` | 函数，第 12 行 | 关闭 Platform Database 对应的界面或恢复前一状态 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `getPlatformDatabase`：`export function getPlatformDatabase(_event: DatabaseRequest)`
- `closePlatformDatabase`：`export function closePlatformDatabase()`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
