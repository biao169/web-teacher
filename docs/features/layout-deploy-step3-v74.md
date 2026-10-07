# 布局与部署整理：第三步（0.15.74）

本版基于0.15.73。按本轮补充要求，开发测试每次作为新站使用，以直接初始化/重建最新结构为主，不要求先迁移或备份旧开发数据库。没有连接、重置或备份用户实际数据库。

## 唯一SQL

源码及交付包只保留 `database/schema.sql` 一份SQL文件，直接创建最新完整结构（41张业务/内部表，包含整合快传）。不包含示例数据、默认管理员密码或运行中的用户数据。

已移除原teacher.sql、transfer.sql、5份增量迁移SQL和10份历史安装SQL。历史JSON快照与来源摘要是结构校验资料，不是要依次运行的安装步骤。正式Windows/Linux启动仍只使用整合主库，快传不创建第二套活动数据库。

`Database.initialize()`、命令行初始化及Worker资源准备通过统一schema_sources读取。历史快传快照仅供原有兼容工具/测试使用。原有升级和旧快传导入入口的SQL文件依赖同步改为Python语句调用，以免删除SQL导致现有入口报缺失文件；这些兼容入口不属于新站开发流程，本轮不扩展其功能。

## 新站开发使用

现有解释器与路径配置继续有效，第四步再统一Windows脚本位置、注释和运行方式。当前可用项目配置指定独立开发数据库后执行：

```text
python -m backend.cli init
python -m backend.cli init-admin
python -m backend.cli seed-demo
```

init仅对空数据库创建结构；init-admin交互设置管理员；seed-demo为可选示例数据。上述python可替换为指定解释器完整路径。需要把现有开发库当成全新网站时，先停服，使用已有明确的重建命令：

```text
python -m backend.cli reset-data
python -m backend.cli init-admin
python -m backend.cli seed-demo
```

reset-data清空所配置数据库并立即按schema.sql重建，不执行自动备份；现有实现不会删除媒体和快传磁盘文件。它只用于已经选定的开发测试库。新站开发无需先运行migrate；具体Windows一键重建、测试数据路径及运行目录在第四步落实。

## 兼容与打包

主站Worker准备包仅生成一份initialize.sql，内容来自schema.sql；旧独立快传Worker仅保留原有兼容结构生成，不是本地整合网站的正式部署入口。现有历史兼容工具不再依赖已删除的SQL文件。生成的远程迁移计划只供旧工具使用，不是新站开发步骤；未连接或部署Cloudflare。

本版不改变字段、索引、约束或实际结构版本，仍以原精确JSON结构校验。既有站点已经是当前结构时无需迁移。示例数据仍复用现有Python导入函数，避免将开发数据混入正式初始化SQL。

## 验证

测试在临时目录和合成数据库执行，包括唯一SQL计数、空库最新结构、重复初始化不覆盖已有内容、旧兼容入口不因删文件而失效、旧快传导入、事务失败回滚及Worker资源生成。历史兼容测试是避免整理文件引入回归，不要求开发者执行历史升级。完整结果见layout-deploy-step3-v74-verification.json及test-results.txt。

真实Windows启动、目标Ubuntu/Debian服务及远程D1未在当前环境执行，不据此声称已完成平台实机验收。

## 下一步：第四步

整理平台脚本与目录：共用运行逻辑迁至deploy/shared，Windows启动/示例/测试/重建入口统一放deploy/windows；注释说明解释器、虚拟环境、独立开发数据库、媒体、缓存和快传路径。开发按新站方式提供一键重建并导入示例的入口；Linux保留相应启动入口。精简根目录；一键远程部署与tweb在第五步实施。

完整回归498项Python、188项前端通过。全量收集后新增1项新站开发重建测试，最终结构专项11项通过，累计覆盖499项Python用例；不是第二次完整回归。
