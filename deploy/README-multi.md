# Ubuntu / Debian 多实例部署补丁 v0.15.146

本补丁基于 v0.15.145，只修改部署工具；不修改网站业务代码、数据库结构或原 install.sh。
原 tweb 管理原网站；新增网站建议使用 tweb2、labweb 等新关键字及独立子域名。
同域名 /site-a/ 子路径部署不在本补丁范围内。

## 上传到仓库

将补丁压缩包按相对路径覆盖到仓库根目录，将以下文件一起提交到 web-py 分支：

- install-multi.sh（新增入口）
- deploy/linux/tweb.py（更新共享管理器）
- deploy/vps/release.py（更新配置生成器）
- deploy/README-multi.md（本文）
- tests/test_deploy_multi_v146.py（隔离测试）

不能只上传 install-multi.sh：入口和后续更新都会检查目标分支是否支持多实例参数。
这只检查部署能力，不恢复源码完整性清单校验。
本补丁是独立部署工具版本，网站 pyproject.toml 版本号保持不变。

## 一条命令安装

替换自己的域名，并确保 DNS 指向 VPS。以下命令在上述文件已上传后可用：

```bash
f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install-multi.sh' -o "$f" && sudo bash "$f" --domain 'teacher2.example.org'
```

推荐第二个网站显式指定命令和目录：

```bash
f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install-multi.sh' -o "$f" && sudo bash "$f" --domain 'teacher2.example.org' --instance lab2 --command tweb2 --base /opt/teacher-site-2 --port 8009
```

也可以下载本补丁中的独立 install-multi.sh 后，在 VPS 执行：

```bash
sudo bash install-multi.sh --domain teacher2.example.org --command tweb2
```

即使从本地启动，目标 GitHub 分支仍须已包含修改后的两个 Python 文件。
脚本安装 git、ca-certificates、python3、python3-venv、procps；要求选定 Python >=3.12。
系统 Python 较旧时，先准备带 venv 的 Python 3.12+，然后加 --python /绝对路径/python3.12；脚本不替换系统解释器。
依赖源沿用清华 HTTPS 源，可用 --pip-source pypi 选择官方源。

## 交互与边界

- 管理关键字默认 tweb；已有同名命令不会被覆盖，提示换一个关键字。
- 实例名默认由关键字生成（下划线转连字符），最多19位小写字母、数字、连字符。长关键字可另指定短 --instance。
- 安装目录默认 /opt/teacher-site（关键字 tweb）或 /opt/teacher-site-实例名；支持在 /opt 或 /srv 下输入独立目录，不支持空格、符号链接或相互嵌套的实例。
- 目录已有文件时，允许改用建议新目录、修复续装或删除本实例后重装。选择删除会列出范围，输入 y 确认。
- 只有本工具能够核对实例归属的目录才会自动清理。对不明文件目录或原单实例安装，请选择新目录；原站卸载继续使用原 tweb。
- 有效安装记录仍在时，可修复缺失的部分标记/服务/命令。记录和归属标记全部丢失时不猜测归属，也不自动删除未知目录。
- 端口默认8003，占用时建议附近可用端口并允许输入；实际安装与启动时再次检查。非交互模式冲突直接退出，不删除数据。
- 安装目录各级父目录须允许服务账号遍历，脚本复用现有读写权限检查，不对整个服务器设置777。
- 每次只执行一项菜单操作；回车退出；保留中英文和彩色阶段日志。所有实例的部署管理操作使用同一短期锁串行执行，网站进程仍独立运行。

## 独立资源

以 --instance lab2 --command tweb2 --base /opt/teacher-site-2 为例：

| 对象 | 地址/名称 |
|---|---|
| 管理命令 | /usr/local/bin/tweb2 |
| 本地管理器 | /opt/teacher-site-2/tweb.py |
| 当前源码 | /opt/teacher-site-2/current |
| 配置及安装记录 | /etc/teacher-site-lab2/ |
| 系统服务 | teacher-site-lab2.service |
| 服务账号 | teacher-lab2（无交互登录） |
| 数据库 | /opt/teacher-site-2/data/database/site.sqlite3 |
| 媒体 | /opt/teacher-site-2/data/media/ |
| 缓存及日志 | /opt/teacher-site-2/data/cache/、data/logs/ |
| 快传文件和缓存 | /opt/teacher-site-2/transfer-data/ |

管理器文件名仍是 tweb.py，但外部命令 tweb2 始终携带实例、目录和关键字参数。
原站 install.sh/tweb 的默认目录、账号和服务名保持原样。

## 管理及恢复

```bash
tweb2                   # 彩色双语菜单
tweb2 paths             # 显示本实例域名、端口和目录
tweb2 status
tweb2 restart
tweb2 update --scope all
tweb2 update --scope source
tweb2 update --scope frontend
tweb2 update --scope dependencies
tweb2 update --scope database
tweb2 port 8010         # 修改应用端口和代理示例，外部代理须自行同步
tweb2 resume-install    # 激活前失败可续装
tweb2 repair            # 保留现有数据修复部署
tweb2 proxy             # 显示本实例 Caddy/Nginx 配置示例
tweb2 remove --scope cache
tweb2 uninstall         # 列出范围、y/N确认后，只卸载本实例
```

现有其他破坏性命令（如数据库重置、分项删除）沿用原管理器的确认规则。
源码更新会保留实例绑定；不允许降级到不支持多实例的管理器版本。
卸载不卸载公共 Python/Caddy/Nginx，也不修改其他实例或现有代理配置；共享部署锁文件保留以避免并发锁竞态。

## Caddy / 233boy

脚本只生成示例，不自动改写 Caddy、Nginx、现有代理或防火墙。
使用 tweb2 proxy 查看配置。新子域名可放入 /etc/caddy/sites/teacher2.conf，前提是主配置已 import /etc/caddy/sites/*.conf。
已有同名域名时，只合并到其现有站点，不能重复声明。
不要把包含域名大括号的完整站点片段放进 233boy 的 .conf.add（该文件已经处于站点内部）。
已有 /biaovless 等代理路径时，网站兜底处理必须排除这些路径。

配置校验通过后重载。管理接口 admin off 时不能热加载，需要按实际维护方式启用本机管理接口后重启一次。
多个实例共用域名反代的80/443端口，各自应用只监听127.0.0.1，不需要公开8009等内部端口。

## 验证范围

测试使用临时目录、模拟systemd/账号操作和本机临时端口，覆盖双实例安装、更新、删除隔离、管理入口绑定、目录归属、占用端口处理及原部署控制。
没有在真实VPS执行apt安装、创建账号、接入域名或签发证书。
原 v76 测试的两条卸载断言在未修改的v145上也失败（模拟账号始终不存在却要求userdel、错误文本断言过时）；本补丁不修改这两条旧测试，也不为其弱化卸载归属检查。
