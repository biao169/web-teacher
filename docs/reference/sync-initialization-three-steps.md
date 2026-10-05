# 初始化精简三步文件路径清单

路径相对于解压后的 teacher-site/ 根目录。逐版本按文件内容比较；发布清单由打包刷新。

## 第1步：v0.15.171（16 个文件）

```
backend/app/native/site_sync_dispatch.py
backend/app/native/site_sync_initialization.py
backend/app/native/site_sync_manual.py
backend/app/native/site_sync_schedule.py
deploy/cloudflare/runtime/entrypoint.py
deploy/cloudflare/runtime/sync_schedule.py
deploy/cloudflare/tests/test_split_loading.py
deploy/cloudflare/tests/test_sync_initialization.py
docs/reference/site-sync.md
docs/reference/sync-initialization-v171.md
frontend/admin/static/js/native-site-sync.js
frontend/admin/templates/native-site-sync.html
pyproject.toml
release-manifest.json
tests/site-sync-dom.test.cjs
tests/test_sync_initialization_v171.py
```

## 第2步：v0.15.172（18 个文件）

```
backend/app/native/site_sync_background.py
backend/app/native/site_sync_initialization.py
backend/app/native/site_sync_latest.py
backend/app/native/site_sync_latest_gate.py
backend/app/native/site_sync_latest_runtime.py
backend/app/native/site_sync_schedule.py
backend/app/native/site_sync_tasks.py
deploy/cloudflare/runtime/sync_schedule.py
deploy/cloudflare/tests/test_sync_initialization.py
docs/reference/site-sync.md
docs/reference/sync-latest-runtime-v172.md
frontend/admin/static/js/native-site-sync.js
frontend/admin/templates/native-site-sync.html
pyproject.toml
release-manifest.json
tests/site-sync-dom.test.cjs
tests/test_site_sync_v123.py
tests/test_sync_latest_runtime_v172.py
```

## 第3步：v0.15.173（16 个文件）

```
backend/app/native/audit_log.py
backend/app/native/content.py
backend/app/native/site_sync_background.py
deploy/cloudflare/runtime/sync_resources.py
deploy/cloudflare/runtime/sync_schedule.py
deploy/cloudflare/tests/test_sync_initialization.py
deploy/cloudflare/tests/test_sync_resources_v173.py
docs/reference/site-sync.md
docs/reference/sync-execution-runtime-v173.md
docs/reference/sync-initialization-three-steps.md
frontend/admin/static/js/native-site-sync.js
frontend/admin/templates/native-site-sync.html
pyproject.toml
release-manifest.json
tests/site-sync-dom.test.cjs
tests/test_sync_latest_runtime_v172.py
```
