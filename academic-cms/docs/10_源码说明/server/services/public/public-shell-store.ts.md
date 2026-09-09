# server / services / public / public-shell-store.ts

## 文件定位

- **源码路径**：`server/services/public/public-shell-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：51 行，3229 字节
- **内容校验**：SHA-256 `9d4bed405d36ab8048a4aed16eaa732553a2a977052b4dc88a3c80ae6ca51c79`

## 直接依赖

- `../../../db/contracts`
- `../../../db/query`
- `./errors`
- `./public-row`

## 直接调用方

- `server/services/public/public-shell-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `site` | 函数 | 封装 site 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `navigation` | 函数 | 封装 navigation 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `PublicShellStore.constructor` | 构造方法 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-shell-service.ts` 等模块导入使用。 |
| `PublicShellStore.load` | 类方法 | 加载并刷新 load，同步界面或运行时状态 | 由 `server/services/public/public-shell-service.ts` 等模块导入使用。 |

### 调用签名

- `site`：`function site(row: RawRow): ShellSiteRecord`
- `navigation`：`function navigation(row: RawRow): ShellNavigationRecord`
- `PublicShellStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `PublicShellStore.load`：`async load(): Promise<PublicShellSnapshot>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ShellSiteRecord` | 类型 | 约束 Shell Site Record 的数据结构或可选值 |
| `ShellNavigationRecord` | 类型 | 约束 Shell Navigation Record 的数据结构或可选值 |
| `PublicShellSnapshot` | 类型 | 约束 Public Shell Snapshot 的数据结构或可选值 |
| `PublicShellStore` | 类 | 封装 Public Shell Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 前台第 3/10 步更新

load() 复用 db/read-plans.ts 的 publicNavigationRead()，仍然只用站点设置和导航两条语句；navigation 的 manyRows 使用共享 200 上限。201 条匹配行明确报错。复用同一个查询避免首页与内页导航范围不一致。
