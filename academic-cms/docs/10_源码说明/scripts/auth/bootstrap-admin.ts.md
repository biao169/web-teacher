# scripts / auth / bootstrap-admin.ts

## 文件定位

- **源码路径**：`scripts/auth/bootstrap-admin.ts`
- **文件类型**：脚本
- **功能定位**：认证运维脚本；初始化管理员或生成安全密钥。
- **规模**：41 行，1864 字节
- **内容校验**：SHA-256 `28a6c7ba2d6ae087176d2ddfa7b3c38a93a0354a894a207daffcfbbdf87cbc27`

## 直接依赖

- `../../db/runtime/node`
- `../../server/security/config`
- `../../server/security/password`
- `../../server/security/tokens`
- `../../server/services/auth/auth-store`
- `../../server/services/auth/bootstrap-service`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `required` | 函数，第 8 行 | 检查 required 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 5 次。 |

### 调用签名

- `required`：`function required(name: string): string`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
