# transfer_site

这是 文件传输小工具的独立代码目录。工具自己的 Python、页面、CSS、JS、数据库初始化、配额、磁盘保护、暂存和管理接口都放在本目录内。

## 本地独立运行

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m transfer_site.server --db data\site.sqlite3 --host 127.0.0.1 --port 8010
```

访问：

```text
http://127.0.0.1:8010/transfer
```

后台控制：

```text
http://127.0.0.1:8010/admin/transfer
```

## 与主站集成

本目录不混入 主站现有功能文件夹。生产集成有两种方式：

1. 反向代理把 `/transfer`、`/api/transfer`、`/api/admin/transfer`、`/admin/transfer` 转发到本服务。
2. 在 主站路由添加一个很小的挂载钩子，调用 `transfer_site.routes.route_transfer_request()`。

无论选择哪种方式，传输工具的业务代码仍保留在本目录。


## Independent UI language

The transfer frontend uses its own in-package copy, not the teacher-site translation cache. English is the default. Add `?lang=zh` to use the Chinese frontend.

## Admin embedding

`transfer_site.views.admin_page()` supports an embeddable mode through the `TRANSFER_ADMIN_EMBED=1` environment key passed to the route environment. The admin navigation area is isolated in `[data-transfer-admin-nav-slot]` and can be replaced by passing `TRANSFER_ADMIN_NAV_HTML` in the route environment.
