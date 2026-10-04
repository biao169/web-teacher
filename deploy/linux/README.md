# Ubuntu / Debian部署与管理

需要systemd、Python3.12+及venv。安装脚本不替换系统Python。主站与文件互传共用服务和内部端口，HTTPS由代理提供。

## 安装

先将完整代码上传至配置的Git仓库分支。默认仓库为 `https://github.com/biao169/web-teacher.git`，分支 `web-py`。在项目根目录执行：

```bash
sudo bash install.sh --domain teacher.example.org --port 8003 --python /usr/bin/python3
```

可用 `--repo`、`--branch`、`--pip-source tuna|pypi` 改变源码与依赖源。Python必须可被服务账号访问；内部端口范围1024～65535，冲突时换端口，不结束其他程序。多实例使用 [install-multi.sh说明](../README-multi.md)。

仅本地启动可用 `bash start.sh --port 8003`；`start-transfer.sh`复用主站入口。

## 管理

输入 `tweb` 进入双语菜单，一次执行一项后退出；回车退出。多实例使用自定义关键字，如tweb2。

| 命令 | 用途 |
| --- | --- |
| tweb status / start / stop / restart | 查看或管理本站服务 |
| tweb logs / doctor / paths | 日志、诊断、实际配置路径 |
| tweb update --scope all | 更新源码与对应依赖/数据库初始化检查，不默认清空业务数据 |
| tweb update --scope source | 兼容性满足时只更新源码 |
| tweb update --scope frontend | 兼容性满足时仅更新前台文件 |
| tweb port 8009 | 修改本站内部端口 |
| tweb permissions --repair | 检查并修复受管目录权限 |
| tweb cleanup-preview / cleanup-run / cleanup-status | 清理预览、执行与状态 |
| tweb proxy | 输出代理配置参考 |

完整参数执行 `python deploy/linux/tweb.py --help` 查看。删除、数据库重建与reset为破坏性操作，使用管理器提供的确认范围，不手工删除未知目录。

安装失败可查看日志和状态，使用管理器的修复/续装入口；源码、服务、目录所属不一致时先核对实例身份。不要把其他实例目录作为本实例的清理对象。

部署工具默认跳过源码发布清单校验，这是现有管理器行为；打包阶段仍严格检查。如需主动核验源码，运行：

```bash
python -B deploy/vps/release.py verify --strict --root .
```

更新时保留数据库、媒体及私有配置。预置媒体导入只接受允许的文件，同内容跳过、冲突不覆盖。日志缓存维护规则见 [设计说明](../../docs/reference/log-cache.md)。

## 一个实例使用多个域名

```bash
sudo bash install.sh --domain teacher.example.org --allowed-domains lab.example.org,team.example.org
# 已安装的实例，在更新到支持此参数的源码后：
sudo tweb domains --allowed-domains lab.example.org,team.example.org
sudo tweb proxy
# 清除别名，仅保留主域名：
sudo tweb domains --allowed-domains ''
```

`install-multi.sh` 支持相同参数；多实例用各自命令（例如 `tweb2 domains ...`）。域名命令会替换完整别名列表，主域名自动保留；原本停止的应用不会被启动，运行中的应用会重启并健康检查。失败会回滚受管配置。

环境文件中 `TEACHER_ORIGIN` 为主 HTTPS 地址，`TEACHER_ALLOWED_ORIGINS` 为完整 HTTPS 来源列表。更新端口、重新生成配置时保留已有白名单及其他环境设置。生产代理配置使用标准443端口，不带路径或通配符。

生成的 Caddy 站点块包含全部域名；nginx 示例顶部列出需使用的 server_name，应用到实际 TLS server 并配置覆盖全部域名的证书。代理必须保留 Host（nginx 示例使用 `proxy_set_header Host $host`，Caddy 默认保留），应用不依赖用户可伪造的 X-Forwarded-Host 选择域名。管理器只生成代理参考，不覆盖外部 nginx/Caddy 配置；应用实际代理配置后执行对应配置检查并重载。
