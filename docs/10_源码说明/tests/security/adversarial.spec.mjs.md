# tests / security / adversarial.spec.mjs

## 文件定位

- **源码路径**：`tests/security/adversarial.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：163 行，8161 字节
- **内容校验**：SHA-256 `82a4a054cf025fc1b920aee7ed252e94e815f1d4ce21e66feb0373703b00ac8e`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `toString` | 对象方法，第 61 行 | 根据输入组装 String 所需的结果对象或结构 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `idFactory` | 对象方法，第 121 行 | 封装 Factory 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `execute` | 对象方法，第 147 行 | 执行 execute 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `batch` | 对象方法，第 154 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `toString`：`toString()`
- `idFactory`：`idFactory(prefix)`
- `execute`：`async execute(command)`
- `batch`：`batch(commands)`

## 测试场景

- 第 8 行：`test` — configured trusted origins remain authoritative when the received Host-derived URL is hostile
- 第 32 行：`test` — origin fallback is exact when no canonical deployment origin is configured
- 第 43 行：`test` — trusted proxy hops are counted from the right side of X-Forwarded-For
- 第 51 行：`test` — Unicode validation accepts supplementary characters and rejects unpaired UTF-16
- 第 59 行：`test` — audit scalar normalization never calls a custom object coercion hook

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
