# tests / security / atomicity.spec.mjs

## 文件定位

- **源码路径**：`tests/security/atomicity.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：118 行，5641 字节
- **内容校验**：SHA-256 `bb77f70a73e58d11dae38fb76608eab600f2e20ddf7f33195a414d601070bd40`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `idFactory` | 对象方法，第 67 行 | 封装 Factory 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `idFactory`：`idFactory(prefix)`

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
