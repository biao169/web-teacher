# Ubuntu / Debian 独立部署

只部署文件快传，不需要教师网站。支持 amd64、arm64，使用 Node.js 24.19.0、pnpm 11.19.0、SQLite、本机文件存储、systemd、Nginx；有公网域名时自动申请 HTTPS 证书。

## 一行启动

当前完整仓库中快传工具位于 `file-transfer/`，默认示例分支为 `web-vue`。分支可按实际情况替换：

```bash
curl -fsSL https://raw.githubusercontent.com/biao169/web-teacher/web-vue/file-transfer/install.sh | sudo bash -s -- --repo https://github.com/biao169/web-teacher.git --branch web-vue --subdir file-transfer
```

不必先 git clone。脚本交互从 `/dev/tty` 读取，因此管道执行也能输入域名、管理员名称和密码。Git 克隆支持自定义 HTTPS 地址；私有仓库使用服务器 root 账号已配置的 Git credential helper，不把令牌写进 URL。

非 `main` 分支需要同时更换下载脚本 URL 中的引用和 `--branch`。例如分支 `release`，两处均改为 `release`；分支名含 `/` 时，下载 URL 的 ref 使用 URL 编码或对应提交 SHA，`--branch` 仍传完整分支名。更新会记住仓库、分支和子目录。

示例已绑定到当前 GitHub 仓库；如从其他分支部署，请同时替换 Raw URL 中的分支和 `--branch`。

## 安装时会做什么

- 校验 Ubuntu/Debian 和 CPU 架构，安装 Git、Nginx 等依赖；从 Node 官方站点下载运行时并核验 SHA-256 清单。
- 拉取指定分支，安装锁定版本依赖，构建独立前台。
- 创建无登录权限的系统用户 `ftweb`，运行目录 `/opt/file-transfer/app`。
- 询问公网域名，配置 Nginx 与 WebSocket 反代，使用 Certbot 配置 HTTPS。域名须已正确解析到服务器，且 80/443 端口可达；脚本不擅自修改现有防火墙。
- 域名留空时仅监听 `127.0.0.1:8787`，供本机或已有 HTTPS 反代接入。公网浏览器的文件系统功能需要 HTTPS；不要把内部 8787 端口直接暴露到互联网。
- 在终端输入首个管理员名称和至少 6 位密码，重复确认后初始化。不会灌入测试数据，不会覆盖已有账号。
- 安装 systemd 服务、开机自启和 `Fweb` 管理命令。配置文件权限收紧，运行进程只可写本工具的 `storage/`。

浏览器前台 `/zh/transfer`，英文 `/en/transfer`，后台 `/transfer-admin/`。首次登录后台，先配置网络核验、开放开关、成员/匿名权限、文件和任务限额、VPN 额度与临时空间。管理员不自动获得文件传输权限。

## 管理命令

```bash
Fweb
```

菜单提供状态、最近日志、重启、更新源码与数据库、备份、首任管理员初始化、查看访问地址。初始化命令只在数据库没有本地账号时生效，不会重置现有管理员密码。

直接更新：

```bash
sudo bash /opt/file-transfer/install.sh --mode update
```

更换分支：

```bash
sudo bash /opt/file-transfer/install.sh --mode update --branch release
```

更新会先构建新版本，再停止服务、备份和复制数据；保留 `storage/` 和 `config.local.json`，数据库结构由服务启动时升级。新版本健康检查失败会恢复上一份代码和升级前的数据副本。更新期间有短暂停机，正在传输的任务需要重新连接。不会提供无确认清空数据库的“完全重装”。

备份目录 `/opt/file-transfer/backups/`，环境配置 `/etc/file-transfer/runtime.env`，源信息 `/etc/file-transfer/source.conf`。备份含账号数据库和临时文件，请妥善保存；不要提交到 Git。当前不会自动删除旧备份，定期检查磁盘容量。

## 已有反向代理 / Cloudflare Tunnel

可留空域名，使用已有 HTTPS 代理连接 `http://127.0.0.1:8787`。设置 `/etc/file-transfer/runtime.env` 中 `FT_PUBLIC_ORIGIN=https://实际域名`，重启服务。该值必须与浏览器访问来源完全一致，不带末尾 `/`；避免因来源核验造成 403。代理必须支持 WebSocket，且 `/transfer-api/` 不得缓存。

Cloudflare Tunnel 方式仍在 Ubuntu 服务器执行程序并保存文件，不等于 Cloudflare 原生托管。若希望不维护服务器，使用根目录的 [Cloudflare 网页部署教程](CLOUDFLARE网页部署教程.md)。

本机版可以沿用既有 VPN 网卡/账单快照接入方式；必须校准计费周期用量并核验路由。Cloudflare 应用流量额度字段只在云端生效，不能替代本机 VPN 总流量统计。

## 不使用自动脚本时

在文件快传根目录：

```bash
pnpm install --frozen-lockfile
pnpm build
FT_SETUP_TOKEN='替换为随机长令牌' pnpm start:standalone
```

打开 `http://127.0.0.1:8787/setup` 初始化。正式反代部署还需 `FT_PUBLIC_ORIGIN=https://域名`。成功后移除初始化令牌并重启。

## 前端开发模式

生产运行使用 `pnpm build` 与 `pnpm start:standalone`。需要 Vite 热更新时，先构建一次前台，然后分别运行后端和 Vite：

```bash
FT_PUBLIC_ORIGIN=http://localhost:5173 FT_SETUP_TOKEN='随机初始化令牌' pnpm start:standalone
pnpm dev:standalone
```

浏览器使用 `http://localhost:5173`，不要混用 `127.0.0.1`，否则来源校验不匹配。

## 排错

- 连接失败：运行 `Fweb` 查看日志；确认安装时构建成功、systemd 运行、Nginx 配置通过。
- 403：确认 HTTPS 域名与 `FT_PUBLIC_ORIGIN` 相同；清理旧登录状态后重新登录。不要关闭来源/CSRF 校验。
- `FT_RUNTIME_BUSY`：可能已有服务或维护任务占用。停止对应服务后，使用原有 `scripts/maintenance.mjs unlock-stale` 检查失效锁；不要直接删活动锁。
- 域名证书失败：检查 DNS、80 端口、AAAA 记录是否正确，修复后运行 Certbot；保留已有教师站点的 Nginx 配置。
- 文件快传不可用：数据库就绪不等于链路已开放。按后台说明核验网络、授权用户、开启相应传输类型。
