# 两站同步密钥设置（Ubuntu/Debian 与 Cloudflare）

推荐先部署网站，再在后台设置密钥。未配置密钥不影响普通网页访问，同步连接需配置密钥后保存。两端必须使用相同的64位十六进制密钥。

## 两平台共用的后台操作

1. 系统管理员打开「后台 → 两站数据同步」。需要 data_tools 查看及编辑权限。
2. 在一端点击「生成密钥」，再点击「复制」。生成和复制都不自动保存。
3. 在另一端粘贴，两端分别点击「保存密钥」，看到“已保存并生效”。
4. 两端分别填写另一端完整 HTTPS 根地址，保存连接与当前授权。
5. 发起一个小范围手动拉取，观察任务推进和报错。界面目前没有独立“测试连接”按钮。

页面默认不读取完整密钥。输入框为空时，显示或复制会受控读取当前密钥；浏览器不允许复制时手动复制选中的内容。数据库密钥优先于环境变量，后续请求生效，无需重启。完整数据库备份包含敏感密钥，勿公开分享。

## Cloudflare 网页部署

按 [部署教程](../deploy/cloudflare/README.md) 设置主站关联构建：Root directory 为 deploy/cloudflare，Build command 为 python build.py check，Deploy command 为 python build.py deploy。inline 自动发布2个 Worker，separate 为3个。

构建变量中的账号ID、主站名、域名、D1和R2配置仍必填；构建 Secret TEACHER_AUX_API_TOKEN 仍必填，用于发布辅助 Worker。TEACHER_SYNC_KEY 现在可不填：首次部署完成并创建管理员后，按上方后台操作设置即可。TEACHER_SETUP_TOKEN 是首次创建管理员用的临时运行时 Secret，与同步密钥不同。

辅助模块无需分别手动配置密钥。重新部署不会覆盖数据库密钥。没有填写构建密钥时，也不会将已有 Worker Secret 清空。若使用环境后备方式，必须通过同一次主站构建向各模块配置一致的密钥，勿只手工更改主站 Secret。

需要诊断时，在网页暂时将 Deploy command 改为 python build.py cloud-check，执行后恢复 deploy。诊断的密钥状态查询需要 TEACHER_AUX_API_TOKEN 具备目标账号 D1 Read 权限；没有该权限会显示 not_verified，不会把数据库密钥误判为不存在。诊断不返回密钥值，也不验证两端密钥一致。

## Ubuntu/Debian 部署

正常安装和启动网站即可，不必在终端设置 TEACHER_SYNC_KEY。完成管理员创建后，直接使用上方后台操作；保存后无需重启 systemd 服务。

如果选择环境变量作为后备：

- 单实例默认配置文件是 /etc/teacher-site/teacher-site.env，服务是 teacher-site.service。
- install-multi.sh 的实例配置位于 /etc/teacher-site-实例名/teacher-site.env，服务是 teacher-site-实例名.service。先运行对应管理命令的 paths 子命令核对路径，不要修改其他实例。
- 用 sudoedit 编辑实际环境文件，保留原配置，添加 TEACHER_SYNC_KEY=实际64位十六进制密钥，避免重复定义。保持原有所有者和受限权限，项目管理器使用 root 与对应服务组、0640。
- 仅修改环境文件时需重启对应服务，例如 sudo systemctl restart teacher-site.service；后台修改数据库密钥则不需要。
- 终端临时 export 不会改变已运行的 systemd 服务。

安装阶段若 APT 报内核依赖异常，那是独立的系统软件包问题，与同步密钥无关；本次未修改安装脚本的系统依赖流程。

## 更换密钥

先暂停同步任务与定时计划，在一端生成新密钥，复制到另一端，两端分别保存后继续任务并重新启用计划。不要在两端各生成一份不同密钥。两端保存时间不同可能产生401/403；任务保留断点并退避重试，不授予额外权限。人工暂停的任务需要手动继续。

删除构建变量不会删除数据库密钥，也不会自动撤销旧的环境后备值。当前界面不提供清空数据库密钥的按钮。不要靠修改数据库或删除后备值来测试生产任务。
