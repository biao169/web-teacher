# tests / backend / admin-editor-fields.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-editor-fields.test.mjs`
- **文件类型**：测试模块
- **功能定位**：回归检查：两套字段描述经统一适配后仍保持类型、约束、特殊控件与只读规则。
- **规模**：47 行，2162 字节
- **内容校验**：SHA-256 `c6cdace032fd9029e52aa0a650fcdd342d880952a3cd44e04eddc1b3bcff1d6e`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `source` | 函数变量，第 7 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |

### 调用签名

- `source`：`source = relative => …`

## 验证内容

- 两套对象编辑器共用唯一字段渲染入口
- 特殊字段清单已成为字段适配器的输入
- 读只媒体字段不能绕过统一渲染器打开选择器

运行：`node --test tests/backend/admin-editor-fields.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
