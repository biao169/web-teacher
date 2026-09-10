# tests / backend / operation-log-completeness.test.mjs

## 文件定位

- **源码路径**：`tests/backend/operation-log-completeness.test.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：67 行，3426 字节
- **内容校验**：SHA-256 `8b6d2a16c5815f6c5fc8292b404dc51954ca78547b0ddc346a74a8599b89560e`

## 直接依赖

- `../../shared/complete-admin/core.mjs`
- `node:assert/strict`
- `node:fs`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `source` | 函数变量，第 8 行 | 封装 source 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 9 次。 |

### 调用签名

- `source`：`source = path => readFileSync(resolve(root, path), 'utf8')`

## 测试场景

- 第 10 行：`test` — 操作日志页面挂载专用工作台且保持只读
- 第 21 行：`test` — 日志服务提供有界组合筛选、动态分面和安全详情
- 第 31 行：`test` — 日志导出检查独立权限、CSRF、行数、文件大小和公式注入
- 第 45 行：`test` — 日志专用读取路由存在且通用资源写入仍被关闭
- 第 57 行：`test` — 通用敏感字段清洗覆盖嵌套认证信息

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
