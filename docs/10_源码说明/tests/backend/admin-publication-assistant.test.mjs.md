# tests / backend / admin-publication-assistant.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-publication-assistant.test.mjs`
- **文件类型**：测试模块
- **功能定位**：回归检查：论文查新来源、引文解析、字段应用和原值撤销链路。
- **规模**：31 行，1681 字节
- **内容校验**：SHA-256 `556a2aa0654f1f3cb7d4f517ca82f3daec0312711acdd9398ff54934edf133f6`

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

- 论文编辑器接入引文解析、联网查验、原值对照与撤销
- 论文元数据接口支持按题名或 DOI 查询、自动换源和逐源失败结果

运行：`node --test tests/backend/admin-publication-assistant.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
