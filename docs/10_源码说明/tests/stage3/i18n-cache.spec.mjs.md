# tests / stage3 / i18n-cache.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/i18n-cache.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：100 行，5457 字节
- **内容校验**：SHA-256 `d8fdc1316adfaf0e42828b25811aec5703b3d2479dcb91a6c2addba9e0a7fa3d`

## 直接依赖

- `../helpers/offline-stage3.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `now` | 对象函数，第 69 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 71 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `defer` | 对象函数，第 71 行 | 封装 defer 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `loader` | 函数变量，第 74 行 | 加载并刷新 loader，同步界面或运行时状态 | 仅在本文件内部使用，标识符共出现 5 次。 |

### 调用签名

- `now`：`now: () => milliseconds`
- `now`：`now: () => new Date(milliseconds)`
- `defer`：`defer: task => deferred.push(task)`
- `loader`：`loader = async () => (`

## 测试场景

- 第 64 行：`test` — public cache supports fresh/stale/miss, single-flight and generation-safe writes

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
