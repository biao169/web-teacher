# scripts / verify-complete-admin.mjs

## 文件定位

- **源码路径**：`scripts/verify-complete-admin.mjs`
- **文件类型**：程序/脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：22 行，2449 字节
- **内容校验**：SHA-256 `efd5d398d08d6cba83a1e801d1c71c43b5cfecad43fd3607e9fd29a018f0b355`

## 直接依赖

- `node:fs/promises`
- `node:path`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `pass` | 函数，第 7 行 | 封装 pass 相关逻辑，供本文件或上层模块按其参数调用 |
| `fail` | 函数，第 8 行 | 封装 fail 相关逻辑，供本文件或上层模块按其参数调用 |
| `exists` | 函数，第 9 行 | 封装 exists 相关逻辑，供本文件或上层模块按其参数调用 |
| `walk` | 函数，第 10 行 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `pass`：`function pass(value)`
- `fail`：`function fail(value)`
- `exists`：`async function exists(path)`
- `walk`：`async function walk(dir)`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
