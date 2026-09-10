# 教师网站＋文件快传

| 根目录项目 | 用法 |
| --- | --- |
| `Tweb.sh` | Ubuntu/Debian 生产部署与终端管理 |
| `Ubuntu-Debian部署说明.md` | 无需预先克隆的一句安装命令、分支选择、管理员初始化、更新恢复 |
| `Cloudflare部署教程.md` | 教师网站 Workers＋D1＋R2 部署与初始化；说明快传边界 |
| `academic-cms/` | 教师网站源码 |
| `file-transfer/` | 快传源码，部署时可选启用 |
| `test-examples/` | 演示、专用启动器、测试和测试记录；停止示例服务后可整目录删除 |

## 服务器一句命令安装

本包根目录内容上传到当前 GitHub 仓库后，可用下面命令安装。服务器无需手动 git clone：

```bash
bash -c 'set -e; f=$(mktemp); trap '\''rm -f "$f"'\'' EXIT; curl -fL --proto "=https" --tlsv1.2 "https://raw.githubusercontent.com/biao169/web-teacher/web-vue-nuxt/Tweb.sh" -o "$f"; bash -n "$f"; sudo bash "$f" install'
```

脚本自动检查依赖并交互安装；Ubuntu/Debian 目标只安装生产/构建必需依赖，不安装 Cloudflare CLI 与测试工具；服务默认复用系统已有 `nobody:nogroup`，不额外创建 Linux 账号；随后询问源码仓库、分支（默认 web-vue-nuxt，可手动输入其他分支）、快传开关、端口、域名以及数据库（网站）高级管理员用户名和两次密码；该账号与 VPN/系统账号无关。私有仓库和其他 Git 平台见部署说明；使用其他分支时替换 Raw 链接中的分支，并在安装提示中填写对应分支。

安装后输入四字符命令即可进入菜单（注意大小写）：

```bash
Tweb
```

普通用户需要 sudo 权限，会按系统策略提示密码。数据库（网站）管理员初始化已包含在首次安装中；中断后可 `Tweb bootstrap` 继续，不能用它覆盖已有管理员。启用快传时可同时授权快传管理权限。

## 本地示例

Windows 双击 `test-examples/02_demo_both.cmd`；Linux 执行 `bash test-examples/run.sh demo`。仅教师示例用 `03_demo_teacher.cmd` 或 `bash test-examples/run.sh teacher`。所有新建示例数据/依赖位于 `test-examples/runtime/`。

删除 `test-examples/` 不影响根目录 `Tweb.sh`、两个应用的源码和生产数据。两个应用内部原有的开发回归测试、迁移文件及辅助初始化实现保留，避免破坏现有构建脚本；它们不自动生成或加载示例数据。生产部署不依赖 `test-examples/`，不自动导入演示账号。

Cloudflare 教师站可部署到 Workers；该路径需要完整依赖，包括 Wrangler、Workers 类型和 Cloudflare 构建工具。当前快传依赖常驻 Node、SQLite 和本地磁盘，不支持直接迁入 Workers。若需要教师＋快传共用导航/登录，使用本包 Ubuntu/Debian 同机部署；可以另外将 Cloudflare 用作该站的 DNS/反向代理入口。
