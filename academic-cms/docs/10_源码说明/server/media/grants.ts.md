# server / media / grants.ts

## 文件定位

- **源码路径**：`server/media/grants.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：238 行，11867 字节
- **内容校验**：SHA-256 `d588aa8f3a88a82556c75939b18e74e37de33a8980cf06ef275041970901db8c`

## 直接依赖

- `../../shared/enums/media`
- `../cache/keys`
- `../security/bytes`
- `../view-model/serializer`
- `./errors`
- `./object-key`

## 直接调用方

- `server/services/media/media-service.ts`
- `server/utils/media-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `isScope` | 函数，第 55 行 | 检查 Scope 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `boundedRevision` | 函数，第 59 行 | 封装 Revision 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `boundedSubject` | 函数，第 66 行 | 封装 Subject 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `seconds` | 函数，第 77 行 | 封装 seconds 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `generationVector` | 函数，第 83 行 | 封装 Vector 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `parsedClaims` | 函数，第 100 行 | 解析 Claims 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `MediaGrantService.constructor` | 构造方法，第 139 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.key` | 类方法，第 150 行 | 封装 key 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.signature` | 类方法，第 155 行 | 完成 signature 的安全计算或凭据处理 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.epochSeconds` | 类方法，第 159 行 | 封装 Seconds 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.issue` | 类方法，第 167 行 | 检查 issue 是否满足业务、安全或类型约束 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.verify` | 类方法，第 197 行 | 检查 verify 是否满足业务、安全或类型约束 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.remainingSeconds` | 类方法，第 226 行 | 封装 Seconds 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |
| `MediaGrantService.authorizeSubject` | 类方法，第 232 行 | 封装 Subject 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/media/media-service.ts`、`server/utils/media-runtime.ts` 等模块导入使用。 |

### 调用签名

- `isScope`：`function isScope(value: unknown): value is MediaGrantScope`
- `boundedRevision`：`function boundedRevision(value: unknown, name: string): string`
- `boundedSubject`：`function boundedSubject(value: unknown, scope: MediaGrantScope): string | null`
- `seconds`：`function seconds(value: number | undefined, fallback: number, name: string): number`
- `generationVector`：`function generationVector(value: unknown, errorCode: Extract<MediaErrorCode, 'MEDIA_INPUT' | 'MEDIA_FORBIDDEN'>): Readonly<Record<string, number>>`
- `parsedClaims`：`function parsedClaims(value: unknown): MediaGrantClaims`
- `MediaGrantService.constructor`：`constructor(private readonly secret: string, options: MediaGrantOptions =`
- `MediaGrantService.key`：`private key(): Promise<CryptoKey>`
- `MediaGrantService.signature`：`private async signature(encodedPayload: string): Promise<Uint8Array>`
- `MediaGrantService.epochSeconds`：`private epochSeconds(): number`
- `MediaGrantService.issue`：`async issue(input: IssueMediaGrant): Promise<string>`
- `MediaGrantService.verify`：`async verify(token: string, expectedKey: string): Promise<MediaGrantClaims>`
- `MediaGrantService.remainingSeconds`：`remainingSeconds(claims: MediaGrantClaims): number`
- `MediaGrantService.authorizeSubject`：`authorizeSubject(claims: MediaGrantClaims, principalUid: string | null): void`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MediaGrantScope` | 类型，第 9 行 | 约束 Media Grant Scope 的数据结构或可选值 |
| `MediaGrantClaims` | 接口，第 11 行 | 约束 Media Grant Claims 的数据结构或可选值 |
| `IssueMediaGrant` | 接口，第 25 行 | 约束 Issue Media Grant 的数据结构或可选值 |
| `MediaGrantOptions` | 接口，第 37 行 | 约束 Media Grant Options 的数据结构或可选值 |
| `MediaGrantService` | 类，第 132 行 | 封装 Media Grant Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
