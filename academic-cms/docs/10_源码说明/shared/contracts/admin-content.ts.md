# shared / contracts / admin-content.ts

## 文件定位

- **源码路径**：`shared/contracts/admin-content.ts`
- **文件类型**：程序/脚本
- **功能定位**：前后端共享契约；定义请求、响应及领域数据的 TypeScript 类型。
- **规模**：75 行，2288 字节
- **内容校验**：SHA-256 `6c780e9146cb64eb5aaf8a3a769c70d4075834fed2d84e3f83106b10d6ea9659`

## 直接依赖

- `../admin/content-modules`
- `./media`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `isAdminContentValue` | 函数，第 73 行 | 检查 Admin Content Value 是否满足业务、安全或类型约束 |

### 调用签名

- `isAdminContentValue`：`export function isAdminContentValue(value: unknown): value is AdminContentValue`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
