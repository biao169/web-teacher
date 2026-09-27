# 原生数据库与目录职责

主站采用academic-cms原始源码执行建表后的最终结构：27张表、396个字段（含媒体原文件名与首页项目数量增量字段）。独立快传采用原工具12张表、70个字段。核对包含完整SQL、字段顺序、类型、默认值、非空、CHECK、唯一索引、外键和STRICT标记，不只是字段数量。SQLite自身内部表不计入业务表数量。

直接使用profiles、publications、auth_users、media_assets等原表；不建立旧Python的content_records、owner_uid、version或兼容视图。保存冲突使用原生updated_at；数据库时间使用UTC毫秒格式，页面显示为YYYY-MM-DD HH:MM:SS。

| 目录 | 职责 |
| --- | --- |
| backend/app/native | 原生校验、权限、业务和HTTP处理 |
| backend/app/config.py | 全平台存储位置配置 |
| backend/entrypoints | 本地及Worker入口 |
| frontend/admin | 后台统一列表、分区表单、样式及原生JavaScript |
| frontend/public | 访客展示及公开表单 |
| frontend/shared | 模板、Bootstrap、Quill和公共静态库 |
| database/native | 原始最终DDL、字段定义、编辑规则、结构快照及来源 |
| transfer | 独立快传界面、后端及部署适配 |
| deploy | 启动、打包、平台配置生成 |
| docs | 功能说明Markdown |
| planning | 当前状态、计划及历史实现 |
| artifacts/verification | 验收记录与截图 |

原始10个建表文件只用于来源核验，不作为旧Python迁移入口。空数据库直接初始化最终结构；已有数据库必须与原生结构相符。普通启动不重建、不填充示例、不重置账号，显式reset-data只删除已配置的数据库及SQLite辅助文件。媒体和缓存不递归清空。运行服务持有文件锁，防止本工具重置正在使用的数据库。

SQL标识符来自固定注册表，输入值使用参数绑定。写入检查会话、CSRF、模块权限、可见范围和更新时间；保存与操作日志处于同一事务。前后台共用业务层，不通过HTTP调用自身。
