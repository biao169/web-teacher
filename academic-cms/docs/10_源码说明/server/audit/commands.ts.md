# server / audit / commands.ts

## 文件定位

- **源码路径**：`server/audit/commands.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：65 行，2192 字节
- **内容校验**：SHA-256 `a7f7547286d52dce30fbb1a2beffcc37869e7191f4621f3f069dd1919a9f98c7`

## 直接依赖

- `../../db/contracts`
- `../../db/query`
- `../security/errors`
- `./sanitize`

## 直接调用方

- `server/services/admin/content-store.ts`
- `server/services/auth/auth-store.ts`
- `server/services/contact/contact-store.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `buildAuditCommand` | 函数，第 30 行 | 根据输入组装 Audit Command 所需的结果对象或结构 | 由 `server/services/admin/content-store.ts`、`server/services/auth/auth-store.ts`、`server/services/contact/contact-store.ts` 等模块导入使用。 |

### 调用签名

- `buildAuditCommand`：`export function buildAuditCommand(event: AuditEvent): SqlCommand`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AuditActor` | 接口，第 6 行 | 约束 Audit Actor 的数据结构或可选值 |
| `AuditCondition` | 接口，第 11 行 | 约束 Audit Condition 的数据结构或可选值 |
| `AuditEvent` | 接口，第 17 行 | 约束 Audit Event 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
