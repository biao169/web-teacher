# 文件互传模块

通过主站 `/transfer/` 使用，通过 `/admin/transfer` 管理。共用主站账号、数据库与HTTP入口；不再单独启动transfer/backend/vps.py。

设计、传输模式、配额、接收码、文件夹与函数入口见 [文件互传设计](../docs/reference/file-transfer.md)。现有旧独立快传数据库需要迁移时，先停止相关服务，再查看 `python -m transfer.backend.migrate --help`，核对源/目标与配置后执行，不能直接删除旧库绕过保护。
