# Ubuntu 部署说明

## 一键部署脚本

公开仓库部署到全新的 Ubuntu/Debian 服务器时，可以直接运行：

```bash
tmp=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/biao169/web-teacher/main/deploy/ubuntu/install.sh -o "$tmp" && chmod +x "$tmp" && "$tmp"
```

脚本会提示输入域名、内部监听端口、安装目录和仓库地址；域名未填写时默认使用服务器 IP。域名解析检查只给出提示，不会阻止继续部署。

部署后可使用 `web-teacher` 关键字管理网站：

```bash
web-teacher status
web-teacher logs
web-teacher restart
web-teacher paths
web-teacher pull-code
web-teacher update
web-teacher backup
web-teacher reset-data
web-teacher uninstall
```

脚本会自动配置：系统依赖、代码下载、Python 虚拟环境、数据库初始化、systemd 自启、Nginx 反向代理和 `/usr/local/bin/web-teacher` 管理命令。高级管理员账号仍需要首次访问 `/admin/setup` 初始化。


本文按“首次部署空站点”编写。默认只初始化数据库结构，不自动写入示例数据。

## 1. 准备系统

推荐 Ubuntu 22.04/24.04，Python 3.12 或更新版本。

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx git openssl
```

拉取项目后进入项目目录，例如：

```bash
cd /srv
sudo git clone https://github.com/biao169/web-teacher.git web-teacher
sudo chown -R "$USER":"$USER" /srv/web-teacher
cd /srv/web-teacher
```

## 2. 安装依赖

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## 3. 生成生产密钥

生产环境必须配置 `TEACHER_SITE_AUTH_SECRET`。它用于登录会话签名，长度至少 32 个字符，建议使用 48 字节以上随机值。

任选一种方式生成：

```bash
openssl rand -base64 48
```

或：

```bash
python - <<'PY'
import secrets
print(secrets.token_urlsafe(64))
PY
```

注意：

- 生成结果只保存到服务器环境变量文件，不要提交到 Git。
- 修改密钥后，旧登录会话会失效，管理员需要重新登录。
- 多实例部署时，所有实例必须使用同一个密钥。

## 4. 配置环境变量

建议把生产环境变量放到 `/etc/web-teacher/web-teacher.env`。

```bash
sudo mkdir -p /etc/web-teacher
sudo cp deploy/ubuntu/web-teacher.env.example /etc/web-teacher/web-teacher.env
sudo nano /etc/web-teacher/web-teacher.env
sudo chmod 600 /etc/web-teacher/web-teacher.env
```

至少修改以下几项：

```env
SITE_URL=https://your-domain.example
TEACHER_SITE_REQUIRE_AUTH_SECRET=1
TEACHER_SITE_AUTH_SECRET=把上一步生成的随机密钥粘贴到这里
TEACHER_SITE_DB=/srv/web-teacher/data/site.sqlite3
TEACHER_SITE_MEDIA=/srv/web-teacher/media
TEACHER_SITE_PUBLIC=/srv/web-teacher/public
PUBLIC_MEDIA_BASE_URL=
```

`PUBLIC_MEDIA_BASE_URL` 留空时，媒体由本站 `/media/...` 提供；如果后续接入对象存储或 CDN，可填写公开媒体域名。

## 5. 初始化目录和数据库

```bash
cd /srv/web-teacher
mkdir -p data media exports .cache
. .venv/bin/activate
python -m tools.init_db
```

首次部署只建表，不填充示例数据。仅本地演示时再手动运行：

```bash
python -m tools.init_db --seed
python -m tools.seed_examples
```

## 6. 本机试运行

```bash
. .venv/bin/activate
set -a
. /etc/web-teacher/web-teacher.env
set +a
uvicorn app.adapters.ubuntu.main:app --host 127.0.0.1 --port 8000
```

另开一个终端测试：

```bash
curl -I http://127.0.0.1:8000/
```

## 7. 配置 systemd

复制服务模板：

```bash
sudo cp deploy/ubuntu/web-teacher.service.example /etc/systemd/system/web-teacher.service
sudo systemctl daemon-reload
sudo systemctl enable --now web-teacher
sudo systemctl status web-teacher
```

查看日志：

```bash
journalctl -u web-teacher -f
```

如果项目目录不是 `/srv/web-teacher`，需要同步修改 `/etc/systemd/system/web-teacher.service` 中的 `WorkingDirectory`、`ExecStart` 和 `EnvironmentFile`。


### Caddy 或其他服务占用 80/443

如果 VPS 已经用 Caddy、v2ray/xray 面板或其他服务占用公网 `80/443`，不要让多个服务同时监听这两个端口。推荐让 Caddy 继续负责 HTTPS，教师网站只监听内部端口，例如 `127.0.0.1:8000`。一键脚本会在安装 Nginx 前先检测端口；检测到 Caddy 时，会询问是否自动创建 `/etc/caddy/sites/web-teacher.caddy` 并 reload Caddy。部署后也可以运行：

```bash
web-teacher caddy-example
web-teacher nginx-test
```

## 8. 配置 Nginx

新建 `/etc/nginx/sites-available/web-teacher`：

```nginx
server {
    listen 80;
    server_name your-domain.example;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/web-teacher /etc/nginx/sites-enabled/web-teacher
sudo nginx -t
sudo systemctl reload nginx
```

配置 HTTPS 可使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
```

启用 HTTPS 后，把 `/etc/web-teacher/web-teacher.env` 中的 `SITE_URL` 改为 `https://your-domain.example`，然后重启服务：

```bash
sudo systemctl restart web-teacher
```

## 9. 数据和媒体备份

需要定期备份：

- `data/site.sqlite3`：网站数据库。
- `media/`：后台上传媒体。
- `i18n_dictionary.json`：手动中英词典。
- `exports/`：后台或工具生成的导出包。

可手动生成迁移包：

```bash
. .venv/bin/activate
python -m tools.export_bundle
```

## 10. 常见问题

如果页面提示“生产密钥未配置”，检查：

```bash
sudo systemctl show web-teacher --property=EnvironmentFiles
sudo grep TEACHER_SITE_AUTH_SECRET /etc/web-teacher/web-teacher.env
sudo systemctl restart web-teacher
```

如果登录后反复要求重新登录，通常是：

- `TEACHER_SITE_AUTH_SECRET` 被改过。
- 多实例密钥不一致。
- 反向代理未正确传递 `X-Forwarded-Proto`。
- 浏览器保留了旧 cookie，可清除站点 cookie 后重试。

如果媒体上传失败，检查：

```bash
ls -ld /srv/web-teacher/media
sudo chown -R www-data:www-data /srv/web-teacher/media
```

如果使用模板中的 systemd 服务，运行用户是 `www-data`，请确保 `data/`、`media/`、`exports/`、`.cache/` 对 `www-data` 可写：

```bash
sudo chown -R www-data:www-data /srv/web-teacher/data /srv/web-teacher/media /srv/web-teacher/exports /srv/web-teacher/.cache
```
历史残留处理：重复运行一键部署脚本时，如果发现旧的安装目录、环境文件、systemd 服务或 Nginx 配置，脚本会提示选择 `keep`、`reset` 或 `replace`。默认 `keep` 会保留数据库、媒体文件和密钥，仅更新代码与服务配置；`reset` 会清空运行数据；`replace` 会移除旧安装后重新部署。涉及删除的模式都需要输入确认短语。

删除数据快捷命令：

```bash
web-teacher reset-data
```

该命令会删除数据库、上传媒体、导出文件、缓存和词典文件，然后重新初始化空数据库。整站卸载使用：

```bash
web-teacher uninstall
```

这两个命令都会要求输入确认文本，防止误删。
