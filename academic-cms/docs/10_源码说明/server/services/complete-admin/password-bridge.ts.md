# server / services / complete-admin / password-bridge.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/password-bridge.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：17 行，742 字节
- **内容校验**：SHA-256 `3fe91b6b63ca40f2043cefd91c08e9b52640b8e1080d3d33efff6b11abb8fb89`

## 直接依赖

- `../../security/errors`
- `../../security/password`
- `../../security/password-policy`

## 直接调用方

- `server/services/complete-admin/auth-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `hashAdminPassword` | 函数，第 5 行 | 检查 Admin Password 是否满足业务、安全或类型约束 | 由 `server/services/complete-admin/auth-service.ts` 等模块导入使用。 |

### 调用签名

- `hashAdminPassword`：`export async function hashAdminPassword(password: string, context:`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
