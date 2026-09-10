# tests / complete-admin / media-completion.test.mjs

## 文件定位

- **源码路径**：`tests/complete-admin/media-completion.test.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：65 行，3160 字节
- **内容校验**：SHA-256 `9350a016d56e8c95f4b3b911f67e748eec297c47f0cafdf50cbeb48393b14412`

## 直接依赖

- `node:test`
- `node:assert/strict`
- `node:fs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `read` | 函数变量，第 5 行 | 读取或定位 read，向调用方返回匹配结果 |

### 调用签名

- `read`：`read = path => …`

## 验证内容

- media admin page mounts the complete workspace
- workspace and picker use authorized preview grants and server filters
- media lifecycle APIs and binary-route exception are present

运行：`node --test tests/complete-admin/media-completion.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
