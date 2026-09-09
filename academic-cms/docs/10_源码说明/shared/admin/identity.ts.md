# shared / admin / identity.ts

## 文件定位

- **源码路径**：`shared/admin/identity.ts`
- **文件类型**：程序/脚本
- **功能定位**：后台稳定 UID、资源白名单、硬唯一/提示型查重规则及对象编辑地址的共享定义。
- **规模**：110 行，6395 字节
- **内容校验**：SHA-256 `1cfe2728001f4642ca95de1baef2fd9c650c36f253bf36e89472731e867582c2`

## 直接依赖

- `../enums/auth`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `isAdminIdentityResource` | 函数，第 81 行 | 判断资源名称是否属于允许生成 UID 和查重的集合。 |
| `normalizeAdminUid` | 函数，第 85 行 | 把 UID 输入规范化并校验最长 128 字符的 ASCII 稳定标识格式。 |
| `suggestedAdminUid` | 函数，第 91 行 | 按资源前缀和 UUID 生成跨平台稳定标识建议；首次保存前可替换。 |
| `adminDuplicateRule` | 函数，第 97 行 | 返回指定资源字段的硬唯一或提示型查重规则，未支持字段返回空。 |
| `adminIdentityEditPath` | 函数，第 102 行 | 根据资源和已校验 UID 构造现有后台编辑入口。 |

### 调用签名

- `isAdminIdentityResource`：`export function isAdminIdentityResource(value: unknown): value is AdminIdentityResource`
- `normalizeAdminUid`：`export function normalizeAdminUid(value: unknown): string`
- `suggestedAdminUid`：`export function suggestedAdminUid(resource: AdminIdentityResource, randomUid?: string): string`
- `adminDuplicateRule`：`export function adminDuplicateRule(resource: AdminIdentityResource, field: string): AdminDuplicateRule | null`
- `adminIdentityEditPath`：`export function adminIdentityEditPath(resource: AdminIdentityResource, uidValue: unknown): string`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
