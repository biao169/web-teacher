@echo off
rem 复制为 local.cmd 后修改；本机配置和测试密码不会进入 Git 或发布包。
rem Python 3.12+ 解释器完整路径；统一加引号调用，路径可以包含空格。
rem set "TEACHER_PYTHON=D:\Python\python.exe"
rem 可选虚拟环境目录；启动器在此创建环境并安装锁定的依赖。
rem set "TEACHER_VENV=D:\Teacher Dev\venv"
rem 可选开发数据根目录；默认使用项目根目录 data，新站启动会重建数据库。
rem Default: project-root\data
rem set "TEACHER_DEV_ROOT=D:\Teacher Dev\data"
rem 以下数据库/媒体/缓存路径必须位于开发根目录内；相对路径以开发根目录为基准。
rem set "TEACHER_DEV_DATABASE_PATH=database\site.sqlite3"
rem set "TEACHER_DEV_MEDIA_DIR=media"
rem set "TEACHER_DEV_CACHE_DIR=cache"
rem set "TEACHER_DEV_TRANSFER_DIR=transfer-data\files"
rem set "TEACHER_DEV_TRANSFER_CACHE=transfer-data\cache"
rem 默认测试管理员名为 admin；不设置密码时，启动后交互输入密码。
rem 可配置仅开发使用的测试密码，避免每次重建都输入；不要使用真实网站密码。
rem set "TEACHER_DEV_ADMIN_USER=admin"
rem set "TEACHER_DEV_ADMIN_PASSWORD=YOUR-LOCAL-TEST-PASSWORD"
rem Main website and transfer share this local port (default 8003).
rem set "TEACHER_PORT=8003"
rem set "TEACHER_NO_PAUSE=1"
rem Optional normal-site TOML: used only by start-normal.cmd, ignored by fresh development.
rem set "TEACHER_CONFIG=D:\Teacher Site\storage.toml"

rem Anonymous public query cache cap in MiB (default 32); 0 disables it.
rem Actual budget adapts to available memory. Set worker count when using multiple processes.
rem set "TEACHER_PUBLIC_CACHE_MB=16"
rem set "WEB_CONCURRENCY=1"
