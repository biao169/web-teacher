# Ubuntu 部署说明

推荐部署方式：

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m tools.init_db --seed
uvicorn app.adapters.ubuntu.main:app --host 127.0.0.1 --port 8000
```

生产环境建议：

- 使用 Nginx 反向代理到 `127.0.0.1:8000`。
- 小型站点可使用 SQLite；多人维护或高并发可扩展 Postgres repository。
- 媒体文件放入 `media/`，并定期备份。
- 定期执行 `python -m tools.export_bundle` 生成整站迁移包。

