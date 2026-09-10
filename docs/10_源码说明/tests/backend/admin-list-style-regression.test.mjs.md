# tests / backend / admin-list-style-regression.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-list-style-regression.test.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：93 行，4339 字节
- **内容校验**：SHA-256 `ff1450c19a45c05b21c3c896417066dea4153995fc8c727f17f87150ca691363`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`
- `node:url`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `read` | 函数变量，第 8 行 | 读取或定位 read，向调用方返回匹配结果 |

### 调用签名

- `read`：`read = path => …`

## 验证内容

- 公共数据表启用紧凑密度、自适应操作列和两行长文本
- 内容列表和完整资源列表复用统一操作区
- 媒体、翻译、账号权限和日志概览采用同一表格视觉规范
- 常见标题、作者和说明字段被标记为两行候选
- 教师和学生列表复用授权媒体投影显示固定尺寸头像

运行：`node --test tests/backend/admin-list-style-regression.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
