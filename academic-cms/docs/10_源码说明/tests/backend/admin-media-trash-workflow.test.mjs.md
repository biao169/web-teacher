# tests / backend / admin-media-trash-workflow.test.mjs

## 文件定位

- **源码路径**：`tests/backend/admin-media-trash-workflow.test.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：52 行，2557 字节
- **内容校验**：SHA-256 `50cdb5d492d9f41d7d2801c031c80f3b544fa582c366d019573173e55ca02d65`

## 直接依赖

- `node:assert/strict`
- `node:fs/promises`
- `node:path`
- `node:test`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `read` | 函数变量，第 7 行 | 读取或定位 read，向调用方返回匹配结果 |

### 调用签名

- `read`：`read = path => …`

## 验证内容

- 媒体库与回收站由服务端强制分流
- 回收站复用媒体工作区并只提供回收站动作
- 使用位置只消费服务端生成的可信后台路径
- 编辑信息同时支持保存与保存后返回

运行：`node --test tests/backend/admin-media-trash-workflow.test.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
