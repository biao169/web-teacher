# 脚本目录调整（0.15.78）

按用户更正：全部 .cmd 位于项目 deploy/windows 内；全部 .sh 位于项目根目录。deploy/linux/start.sh 移为根目录 start.sh；transfer/deploy/start.sh 移为根目录 start-transfer.sh；transfer/deploy/start.cmd 移为 deploy/windows/start-transfer.cmd。同步修正调用路径、平台回归和完整/Windows 打包规则。

根目录 README.md 改为完整网站教程，包含 Windows 开发、后台配置、前台及快传使用、Ubuntu/Debian 直接启动与一键安装、tweb 管理、路径说明和常见问题。历史版本文档保留历史路径，当前用法以根目录教程为准。

本次平台专项 6 项通过，3 个根目录 shell 脚本语法检查通过；未修改网站业务或数据库结构，不重复全量回归。Windows 和真实服务器仍待实机验收。
