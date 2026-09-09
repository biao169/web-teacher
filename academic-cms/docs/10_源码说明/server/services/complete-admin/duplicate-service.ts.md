# server / services / complete-admin / duplicate-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/duplicate-service.ts`
- **文件类型**：程序/脚本
- **功能定位**：按照资源和字段白名单执行数据库查重；排除当前 UID，返回最多 10 条匹配及后台跳转路径。
- **规模**：94 行，4996 字节
- **内容校验**：SHA-256 `48096a6e864b532028bf07ee111b061a5a4e316109aa245f509395cb66f92bb4`

## 直接依赖

- `h3`
- `~~/shared/admin/identity`
- `../../utils/complete-admin/db`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `identifier` | 函数，第 38 行 | 仅允许白名单格式的 SQL 标识符，再用双引号引用。 |
| `hasControlCharacter` | 函数，第 43 行 | 检测 ASCII 控制字符，供查重输入拒绝非法文本。 |
| `normalizedDuplicateValue` | 函数，第 50 行 | 校验字符串长度和控制字符，执行 NFC/空白处理及 DOI 前缀归一化。 |
| `constructor` | 构造方法，第 59 行 | 接收并保存本服务所需的上下文或依赖，由其公开方法使用。 |
| `check` | 方法，第 61 行 | 校验资源/字段白名单，规范化比较值，排除当前 UID 后查询最多 11 行，返回前 10 条及截断标记。 |

### 调用签名

- `identifier`：`function identifier(value: string): string`
- `hasControlCharacter`：`function hasControlCharacter(value: string): boolean`
- `normalizedDuplicateValue`：`function normalizedDuplicateValue(value: unknown, field: string): string`
- `constructor`：`constructor(private readonly event: H3Event)`
- `check`：`async check(resourceValue: unknown, fieldValue: unknown, value: unknown, excludeUidValue?: unknown): Promise<AdminDuplicateCheckResult>`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
