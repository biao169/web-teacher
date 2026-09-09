# scripts / release / production-browser.mjs

## 文件定位

- **源码路径**：`scripts/release/production-browser.mjs`
- **文件类型**：程序/脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：93 行，7164 字节
- **内容校验**：SHA-256 `354490023257af47e8b953e1adb45fa00cb382281d0ba3c43b7e0df1bcf4a060`

## 直接依赖

- `node:https`
- `node:net`
- `node:http`
- `node:child_process`
- `node:crypto`
- `node:fs/promises`
- `node:path`
- `../lib/run-command.mjs`
- `../lib/build-output.mjs`
- `./assert-current-source.mjs`
- `./process.mjs`
- `../db/migrations.mjs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `freePort` | 函数，第 31 行 | 封装 Port 相关逻辑，供本文件或上层模块按其参数调用 |
| `stop` | 函数，第 32 行 | 封装 stop 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `freePort`：`async function freePort()`
- `stop`：`async function stop(child)`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
