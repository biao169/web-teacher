# 数据库初始化

唯一正式SQL：`schema.sql`。只在空库执行，创建主站与整合快传的完整结构。管理员与示例数据使用现有Python命令创建。开发按新站处理：独立测试库可用 `python -m backend.cli reset-data` 重建，无需历史迁移或备份。具体配置在项目README和deploy配置示例中。

`native/*.json` 是当前/历史结构验证快照和编辑器元数据，不是多份安装SQL，不要逐个导入。历史迁移名称和SHA仅保留来源记录；相应SQL文件已移除。旧兼容入口位于backend/app/native/schema_migrations.py，开发新站不需要运行。
