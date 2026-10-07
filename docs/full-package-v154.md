# v0.15.154 完整代码整理与合并清单

## 结论

本版替代此前遗漏独立改动的 v0.15.153 完整包。基于 v153 全部代码，合入独立的 v146 多实例部署补丁，并恢复前台学术/社交平台数值显示。无需先叠加 v146 或同步各步补丁。

## 本次补回

| 内容 | 文件/范围 | 处理 |
| --- | --- | --- |
| 多实例安装入口 | 根目录 install-multi.sh | 与此前独立文件逐字节核对一致 |
| 多实例管理器 | deploy/linux/tweb.py | 使用 v146 独立补丁的完整文件 |
| 独立服务/账号/配置目录 | deploy/vps/release.py | 使用 v146 独立补丁的完整文件 |
| 多实例说明及隔离检查 | deploy/README-multi.md、tests/test_deploy_multi_v146.py | 原文件合入 |
| 社交平台数字 | frontend/public/templates/person-links.html | 根据此前确认规则恢复显示；原基包仅有链接显示 |
| 数值样式及缓存更新 | faculty.css、public/templates/layout.html | 使用现有主题变量；刷新样式版本 |
| 打包遗漏修复 | deploy/shared/package_release.py | Windows完整包收录全部根目录 .sh，不再遗漏 install-multi.sh |

数值沿用后台既有字段：ORCID、个人主页、Google Scholar、DBLP、GitHub、CNKI。链接和数值均有时并列；仅链接时保留原显示；仅数值时显示平台名和数值。0显示，未填写隐藏。首页、教师列表和详情共用模板，中英文均适用。数值为后台手填值，不是联网实时统计；不新增数据库字段。

## 保留内容核对

- v147–v153 六步同步资源改进及任务状态面板：backend业务文件、后台模板和JS逐字节保留；未被旧多实例补丁覆盖。
- Worker部署中的 global_fetch_strictly_public 和 /api/* 路由优先级保留。
- 部署管理器的预置媒体导入、同内容跳过、冲突不覆盖逻辑保留并经过相关测试。
- 原有 install.sh、start.sh、start-transfer.sh 保留。多实例入口在项目根目录；Windows脚本仍在deploy目录。
- 数据库schema和其余前后台代码保持v153内容；本版不迁移数据库、不覆盖运行中的媒体或数据库。
- 多实例部署行为以原 deploy/README-multi.md 为准。原管理器关于源码校验的既有行为保留；打包阶段仍执行严格清单核验。

## 验证

85项Python检查通过：多实例安装/更新/删除隔离、身份冲突保护、原部署管理/恢复、预置媒体和同步诊断、教师联系方式权限、社交数值中英文三种页面、任务状态只读投影及筛选。所有根目录启动/安装shell脚本通过bash语法检查。

使用修正后的正式打包脚本生成source/windows两种归档，并逐文件比较内容与SHA256清单，确认install-multi.sh及其配套文件、社交数值模板和v153同步文件均实际存在。两种归档内容相同，可使用交付的完整zip。

没有操作真实VPS、Windows主机或Cloudflare线上两站，未进行真实浏览器视觉验收。此前同步的线上CPU/内存及1101/1102仍需部署后确认。

## 使用

解压后以 teacher-site/ 为项目根目录。完整包可用于Windows、Ubuntu/Debian、Cloudflare部署（入口分别见deploy文档）。新增多实例安装方法见 deploy/README-multi.md。

上传GitHub时，将teacher-site目录内文件放在仓库根目录，根目录应同时有install.sh、install-multi.sh、pyproject.toml、backend和deploy。VPS安装脚本仍从配置的仓库/分支拉取代码；本次交付未推送GitHub。

已有网站使用原部署工具更新源码，保留其数据库、媒体和本地配置。不要将示例数据库用于替换运行中的数据库。
