# 第四步：平台脚本和根目录整理（0.15.75）

基于0.15.74。开发每次按新站使用，不要求迁移或备份；本轮没有操作实际站点或用户数据库。

## 入口与目录

原deploy/windows/launcher.py迁至deploy/shared/launcher.py；共用环境准备、测试依赖及专用开发配置也放在shared。Windows薄入口只选择行为、调用共用Python并返回退出码。Linux入口移到deploy/linux/start.sh，支持指定解释器与配置路径，不再依赖windows目录。

根目录11份cmd、start.py、demo.py移除；3份requirements锁文件移到deploy/shared/requirements，storage.example.toml移到deploy/shared/config。README改成当前简明入口说明，历史记录移到docs/history。源码顶层业务目录不改。

Windows的start.cmd默认“重建开发库→管理员→基础示例→启动”；start-existing.cmd保留当前开发数据；rebuild.cmd只重建和导入，不启动。add-demo-data.cmd、add-frontend-examples.cmd复用现有示例函数。test.cmd支持可选--dom；普通用户运行网站不需要Node。start-normal.cmd按普通站点配置启动且不重建。

旧transfer/deploy入口改为同站整合启动，不再启动8004；旧快传打包入口委托整站打包器。未更改快传协议或业务接口。

## 配置与重建范围

本机local.cmd统一配置Python、venv、端口、测试管理员及TEACHER_DEV_*数据路径。按明确解释器、自定义venv、项目venv、py、python顺序查找，删除硬编码个人Conda路径。私有配置不进入Git或发布清单；测试管理员密码不打印，不传入Web子进程。

专用开发根目录默认在LOCALAPPDATA/TeacherSiteLauncher/development-v75。全部开发路径必须在根目录内且在源码外，不允许符号链接。第一次仅接管空目录并写标记；无标记非空目录拒绝使用。开发命令覆盖继承的普通数据库/媒体/快传路径和TEACHER_CONFIG，服务子进程读取同一套开发路径，固定使用本机HTTP来源。

重建仍复用唯一schema.sql，只删除开发SQLite及侧文件；不做迁移和备份，不递归删除媒体/缓存/快传文件。数据库中的账号、内容、文件引用及传输任务会被清空。端口被占用时拒绝启动/重建，不杀其他进程。

## 验证

专项覆盖重复新站重建、普通数据库不受影响、自定义含空格路径、重建后管理员和示例、现有数据继续使用、路径逃逸/未标记目录/符号链接拒绝、根目录精简、私有配置发布排除和Linux指定解释器参数传递。全量回归包含实际回环HTTP主站/快传启动及重启。

Windows批处理使用CRLF，保留错误码并支持CI禁用pause；没有实际Windows cmd.exe，不能声称已完成双击或实机浏览器验收。Linux脚本做语法及参数转发测试，不等于Ubuntu/Debian/systemd生产部署验证。

## 下一步

第五步：根目录install.sh引导与deploy/linux内tweb管理实现，支持指定GitHub仓库/分支下载安装、更新、启动管理、环境诊断及Nginx/Caddy配置示例等。开发按新站方式初始化/重建；生产操作的具体范围和命令分别明确。第六步再做目标环境整体验收。

## 本次执行结果

Python回归505项通过（177.45秒）；前端模拟DOM188项通过。新增平台脚本专项6项已包含在505项中。Windows实机与浏览器验收待执行。
