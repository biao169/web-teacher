# tests / backend / admin-historical-suggestions.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-historical-suggestions.test.mjs`
- **文件类型**：测试模块
- **功能定位**：回归检查：从原表读取历史候选值，分类分号分词与输入补全不依赖新表。
- **规模**：49 行，2444 字节
- **内容校验**：SHA-256 `0c6a7404d594a5dbc90f20cc77c2966274bc220910b3c3de1039507104e045a7`

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

- 历史候选输入点击即可展示并复用共享分号规则
- 分类、标签和名单字段统一接入同模块历史候选
- 候选接口按字段白名单和查看权限读取现有表，不创建候选表
- 媒体上传和编辑分类复用同一历史候选组件

运行：`node --test tests/backend/admin-historical-suggestions.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
