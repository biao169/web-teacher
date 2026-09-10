# scripts / release / build-transaction.mjs

## 文件定位

- **源码路径**：`scripts/release/build-transaction.mjs`
- **文件类型**：程序/脚本
- **功能定位**：串行化两种构建目标；失败时恢复完整旧产物，清理目录遇到临时占用时进行有限重试。
- **规模**：78 行，3126 字节
- **内容校验**：SHA-256 `de0b609bd20b8f2ced9195dd5f649ee31945e61b18a5651514019672e1c78443`

## 直接依赖

- `node:fs/promises`
- `node:path`
- `node:crypto`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `lockOwnerExists` | 函数，第 7 行 | 封装 Owner Exists 相关逻辑，供本文件或上层模块按其参数调用 |
| `acquireBuildLock` | 函数，第 21 行 | 封装 Build Lock 相关逻辑，供本文件或上层模块按其参数调用 |
| `withBuildTransaction` | 函数，第 44 行 | Serialize targets; restore the previous complete output after any failed build. |

### 调用签名

- `lockOwnerExists`：`function lockOwnerExists(owner)`
- `acquireBuildLock`：`async function acquireBuildLock(lockPath)`
- `withBuildTransaction`：`export async function withBuildTransaction(root, build)`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
