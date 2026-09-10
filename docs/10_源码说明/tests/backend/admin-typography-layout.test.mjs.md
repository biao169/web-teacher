# tests / backend / admin-typography-layout.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-typography-layout.test.mjs`
- **文件类型**：测试模块
- **功能定位**：回归检查：全局字号配置、紧凑布局和统一必填标签结构。
- **规模**：34 行，1889 字节
- **内容校验**：SHA-256 `1c6bda060bc8f16e90dea5f2306fc060d2ca2ef97d3677f5a2af21ef6c8314a8`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:test`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `read` | 函数变量，第 6 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |

### 调用签名

- `read`：`read = path => …`

## 验证内容

- 后台字体与字号只在专用令牌文件中集中配置
- 统一表单标签由共用组件负责星号、标题与查重按钮结构

运行：`node --test tests/backend/admin-typography-layout.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
