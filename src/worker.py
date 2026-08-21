from __future__ import annotations

from workers import Response, WorkerEntrypoint

from app.adapters.cloudflare_repository import CloudflareD1Loader
from app.core.models import TABLE_MAP
from app.core.rendering import _form, admin_batch_update, audit_admin_action, current_auth, ensure_auth_defaults, has_permission, normalize_admin_data, redirect, route_request, same_origin_post_allowed, security_headers, translation_auto_translate, translation_auto_translate_step, translation_delete_cache, translation_inline_payload, translation_inline_update, translation_job_start, translation_job_status_payload, translation_job_stop, translation_scan_database
from app.core.seed_data import DEMO_ROWS
from app.core.repository import MemoryRepository
from app.core.security import hash_password, stable_uid


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = request.url
        parsed = self._parse_url(url)
        path = parsed["path"]

        if path.startswith("/media/"):
            media = await self._media_response(request, path)
            if media is not None:
                return media

        if not path.startswith(("/admin", "/api", "/media", "/sitemap.xml", "/sitemap.txt", "/sitemap-index.xml", "/robots.txt", "/security.txt", "/.well-known/security.txt", "/llms.txt")):
            return await self._asset_response(request)

        if path in {"/admin/table/media_assets", "/admin/table/media_assets/trash"} and getattr(self.env, "DB", None) is not None:
            await CloudflareD1Loader(self.env.DB).clear_expired_media_trash()

        repo = await self._repo()
        env = {
            "SITE_URL": getattr(self.env, "SITE_URL", ""),
            "PUBLIC_MEDIA_BASE_URL": getattr(self.env, "PUBLIC_MEDIA_BASE_URL", ""),
            "TEACHER_SITE_AUTH_SECRET": getattr(self.env, "TEACHER_SITE_AUTH_SECRET", ""),
            "TEACHER_SITE_REQUIRE_AUTH_SECRET": getattr(self.env, "TEACHER_SITE_REQUIRE_AUTH_SECRET", ""),
            "PLATFORM": "cloudflare",
            "_CONTENT_TYPE": request.headers.get("content-type") or "",
            "_COOKIE": request.headers.get("cookie") or "",
            "_ORIGIN": request.headers.get("origin") or "",
            "_REFERER": request.headers.get("referer") or "",
            "_HOST": self._host(request.url),
            "_SCHEME": "https",
            "_REMOTE_ADDR": request.headers.get("cf-connecting-ip") or "",
        }
        if path.startswith(("/admin", "/api/admin")):
            ensure_auth_defaults(repo)
        if request.method == "POST" and path in {"/api/admin/media/upload", "/api/admin/media/crop"}:
            import json

            action = "can_create" if path.endswith("/upload") else "can_edit"
            if not same_origin_post_allowed("POST", env) or not current_auth(repo, env) or not has_permission(repo, env, "media_assets", action):
                return Response(json.dumps({"ok": False, "message": "当前账号没有媒体写入权限。"}, ensure_ascii=False), status=403, headers={"content-type": "application/json; charset=utf-8"})
            payload = {"ok": False, "message": "Cloudflare Worker 环境暂未接入媒体写入；可从已有媒体库选择，或直接输入公开图片/Iconify 路径。"}
            return Response(json.dumps(payload, ensure_ascii=False), status=200, headers={"content-type": "application/json; charset=utf-8"})
        body = b""
        if request.method == "POST":
            text = await request.text()
            body = text.encode("utf-8")
            saved = await self._handle_admin_save(repo, path, body, env)
            if saved:
                status, headers, payload = saved
                return Response(payload.decode("utf-8"), status=status, headers=dict(headers))

        status, headers, payload = route_request(repo, request.method, path, parsed["query"], body, env)
        if request.method == "POST" and path in {"/admin/setup", "/admin/login", "/login", "/register"} and getattr(self.env, "DB", None) is not None:
            loader = CloudflareD1Loader(self.env.DB)
            for table in ("auth_roles", "auth_permissions", "auth_users"):
                for row in repo.list(table):
                    await loader.save(table, row)
        return Response(payload.decode("utf-8"), status=status, headers=dict(headers))

    def _host(self, url: str) -> str:
        parsed = self._parse_url(url)
        return parsed.get("host", "")

    async def _media_response(self, request, path: str):
        from urllib.parse import unquote

        key = unquote(path.removeprefix("/media/").strip("/"))
        bucket = getattr(self.env, "MEDIA", None)
        if bucket is not None and key:
            obj = await bucket.get(key)
            if obj is not None:
                headers = {key: value for key, value in security_headers()}
                headers["cache-control"] = "public, max-age=3600"
                content_type = getattr(getattr(obj, "httpMetadata", None), "contentType", None)
                if content_type:
                    headers["content-type"] = content_type
                return Response(obj.body, headers=headers)
        return await self._asset_response(request)

    async def _asset_response(self, request):
        response = await self.env.ASSETS.fetch(request)
        headers = dict(getattr(response, "headers", {}) or {})
        for key, value in security_headers():
            headers.setdefault(key, value)
        return Response(response.body, status=getattr(response, "status", 200), headers=headers)

    async def _repo(self):
        db = getattr(self.env, "DB", None)
        if db is None:
            return MemoryRepository(DEMO_ROWS)
        loader = CloudflareD1Loader(db)
        repo = await loader.load_repository()
        if not repo.list("site_settings"):
            repo = MemoryRepository(DEMO_ROWS)
        return repo

    async def _audit(self, repo, env: dict[str, str], action: str, module: str, target_uid: str = "", summary: str = "", detail: dict | None = None, status: str = "success") -> None:
        if getattr(self.env, "DB", None) is None:
            return
        before = {str(row.get("uid") or row.get("id")) for row in repo.list("operation_logs") if row.get("uid") or row.get("id")}
        audit_admin_action(repo, env, action, module, target_uid, summary, detail or {}, status)
        loader = CloudflareD1Loader(self.env.DB)
        for row in repo.list("operation_logs"):
            key = str(row.get("uid") or row.get("id"))
            if key and key not in before:
                await loader.save("operation_logs", row)

    async def _handle_admin_save(self, repo, path: str, body: bytes, env: dict[str, str]):
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table":
            table = parts[2]
            action = "can_edit"
            if len(parts) >= 4 and parts[3] == "save":
                form = _form(body)
                key = form.get("uid", "")
                action = "can_edit" if key and repo.get(table, key) else "can_create"
            elif table == "media_assets" and len(parts) >= 4 and parts[3] == "export-used":
                action = "can_export"
            elif "delete" in parts[3:] or "clear" in parts[3:]:
                action = "can_delete"
            if not same_origin_post_allowed("POST", env) or not current_auth(repo, env) or not has_permission(repo, env, table, action):
                return 403, [("content-type", "text/plain; charset=utf-8")], b"Forbidden"
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "media_assets" and getattr(self.env, "DB", None) is not None:
            loader = CloudflareD1Loader(self.env.DB)
            if len(parts) >= 5 and parts[3] == "trash" and parts[4] == "clear":
                await loader.clear_media_trash()
                await self._audit(repo, env, "delete", "media_assets", "trash", "清空媒体回收站")
                return redirect("/admin/table/media_assets/trash")
            if len(parts) >= 6 and parts[3] == "trash":
                media_key = parts[4]
                action = parts[5]
                if action == "delete":
                    await loader.delete("media_assets", media_key)
                elif action == "restore":
                    await loader.update("media_assets", media_key, {"status": "active"})
                await self._audit(repo, env, action, "media_assets", media_key, f"媒体回收站操作：{action}")
                return redirect("/admin/table/media_assets/trash")
            if parts[3] == "batch":
                from urllib.parse import parse_qs

                data = parse_qs(body.decode("utf-8", "ignore"), keep_blank_values=True)
                selected = [item for item in data.get("selected", []) if item][:500]
                action = (data.get("batch_action") or ["update"])[-1]
                category = (data.get("batch_category") or [""])[-1].strip()
                requested_status = (data.get("batch_status") or [""])[-1]
                updated = 0
                deleted = 0
                skipped = 0
                for key in selected:
                    if action == "delete":
                        await loader.delete("media_assets", key)
                        deleted += 1
                    else:
                        changes = {}
                        if action == "trash":
                            changes["status"] = "trash"
                        elif action == "restore":
                            changes["status"] = "active"
                        elif requested_status in {"active", "trash"}:
                            changes["status"] = requested_status
                        if action == "update" and category:
                            changes["category"] = category[:120]
                        if changes:
                            await loader.update("media_assets", key, changes)
                            updated += 1
                        else:
                            skipped += 1
                return_to = (data.get("return_to") or ["/admin/table/media_assets"])[-1]
                if return_to not in {"/admin/table/media_assets", "/admin/table/media_assets/trash"}:
                    return_to = "/admin/table/media_assets"
                result = {"selected": len(selected), "updated": updated, "deleted": deleted, "skipped": skipped, "action": action}
                await self._audit(repo, env, "batch_update", "media_assets", "", "批量修改媒体库", result, "warning" if skipped else "success")
                sep = "&" if "?" in return_to else "?"
                return redirect(f"{return_to}{sep}batch_selected={len(selected)}&batch_updated={updated}&batch_deleted={deleted}&batch_skipped={skipped}")
            if len(parts) >= 5:
                media_key = parts[3]
                action = parts[4]
                if action == "delete":
                    await loader.delete("media_assets", media_key)
                elif action in {"trash", "restore"}:
                    await loader.update("media_assets", media_key, {"status": "trash" if action == "trash" else "active"})
                await self._audit(repo, env, action, "media_assets", media_key, f"媒体操作：{action}")
                return redirect("/admin/table/media_assets")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "navigation_items" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("navigation_items", key)
            if repo_row:
                action = form.get("_nav_action", "save_sort")
                if action == "toggle_enabled":
                    current = str(repo_row.get("enabled") or "0") in {"1", "true", "True", "yes", "on"}
                    await CloudflareD1Loader(self.env.DB).update("navigation_items", key, {"enabled": 0 if current else 1})
                else:
                    await CloudflareD1Loader(self.env.DB).update("navigation_items", key, {"sort_order": form.get("sort_order") or repo_row.get("sort_order") or 0})
            await self._audit(repo, env, "quick_update", "navigation_items", key, "快速修改 导航与按钮")
            return redirect("/admin/table/navigation_items")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "global_settings" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            from app.core.rendering import global_settings_quick_update

            form = _form(body)
            key = form.get("uid") or "global-default"
            location = global_settings_quick_update(repo, body)
            row = repo.get("global_settings", key) or (repo.list("global_settings") or [None])[0]
            if row:
                await CloudflareD1Loader(self.env.DB).save("global_settings", row)
            await self._audit(repo, env, "quick_update", "global_settings", key, "快速修改 通用设置")
            return redirect(location)
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "site_settings" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            from app.core.rendering import site_settings_quick_update

            form = _form(body)
            key = form.get("uid") or "site-default"
            location = site_settings_quick_update(repo, body)
            row = repo.get("site_settings", key) or (repo.list("site_settings") or [None])[0]
            if row:
                await CloudflareD1Loader(self.env.DB).save("site_settings", row)
            await self._audit(repo, env, "quick_update", "site_settings", key, "快速修改 站点设置")
            return redirect(location)
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[3] == "batch-update" and getattr(self.env, "DB", None) is not None:
            from urllib.parse import parse_qs

            table = parts[2]
            if table in TABLE_MAP:
                data = parse_qs(body.decode("utf-8", "ignore"), keep_blank_values=True)
                selected = [item for item in data.get("selected", []) if item][:500]
                location, result = admin_batch_update(repo, table, body)
                loader = CloudflareD1Loader(self.env.DB)
                for key in selected:
                    row = repo.get(table, key)
                    if row:
                        await loader.save(table, row)
                await self._audit(repo, env, "batch_update", table, "", f"批量修改 {TABLE_MAP[table].label}", result, "warning" if result.get("skipped") else "success")
                return redirect(location)
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "profiles" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("profiles", key)
            if repo_row:
                action = form.get("_profile_action", "save_inline")
                if action == "toggle_active":
                    current = str(repo_row.get("is_active") or "0") in {"1", "true", "True", "yes", "on"}
                    await CloudflareD1Loader(self.env.DB).update("profiles", key, {"is_active": 0 if current else 1})
                elif action == "toggle_featured":
                    current = str(repo_row.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"}
                    await CloudflareD1Loader(self.env.DB).update("profiles", key, {"is_featured": 0 if current else 1})
                else:
                    await CloudflareD1Loader(self.env.DB).update("profiles", key, {
                        "sort_order": form.get("sort_order") or repo_row.get("sort_order") or 0,
                    })
            await self._audit(repo, env, "quick_update", "profiles", key, "快速修改 教师与团队")
            return redirect("/admin/table/profiles")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "research_interests" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("research_interests", key)
            if repo_row:
                name = form.get("name") or repo_row.get("name") or ""
                await CloudflareD1Loader(self.env.DB).update("research_interests", key, {
                    "name": name,
                    "name_en": form.get("name_en") or "",
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "sort_order": form.get("sort_order") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "research_interests", key, "快速修改 研究方向")
            return redirect("/admin/table/research_interests")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "publications" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("publications", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("publications", key, {
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "is_featured": 1 if str(form.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "sort_order": form.get("sort_order") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "publications", key, "快速修改 论文成果")
            return redirect("/admin/table/publications")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "projects" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("projects", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("projects", key, {
                    "status": form.get("status") or repo_row.get("status") or "",
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "is_featured": 1 if str(form.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "sort_order": form.get("sort_order") or repo_row.get("id") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "projects", key, "快速修改 科研项目")
            return redirect("/admin/table/projects")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "patents" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("patents", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("patents", key, {
                    "legal_status": form.get("legal_status") or repo_row.get("legal_status") or "",
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "is_featured": 1 if str(form.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "sort_order": form.get("sort_order") or repo_row.get("id") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "patents", key, "快速修改 专利与软著")
            return redirect("/admin/table/patents")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "students" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("students", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("students", key, {
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "is_featured": 1 if str(form.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "sort_order": form.get("sort_order") or repo_row.get("id") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "students", key, "快速修改 学生")
            return redirect("/admin/table/students")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "student_category_displays" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("student_category_displays", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("student_category_displays", key, {
                    "enabled": 1 if str(form.get("enabled") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "display_order": form.get("display_order") or repo_row.get("id") or repo_row.get("display_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "student_category_displays", key, "快速修改 学生分组")
            return redirect("/admin/table/student_category_displays")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "news" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("news", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("news", key, {
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "is_featured": 1 if str(form.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "sort_order": form.get("sort_order") or repo_row.get("id") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "news", key, "快速修改 动态")
            return redirect("/admin/table/news")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "courses" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("courses", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("courses", key, {
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "public",
                    "is_featured": 1 if str(form.get("is_featured") or "0") in {"1", "true", "True", "yes", "on"} else 0,
                    "sort_order": form.get("sort_order") or repo_row.get("id") or repo_row.get("sort_order") or 0,
                })
            await self._audit(repo, env, "quick_update", "courses", key, "快速修改 课程")
            return redirect("/admin/table/courses")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "messages" and parts[3] == "quick-update" and getattr(self.env, "DB", None) is not None:
            form = _form(body)
            key = form.get("uid", "")
            repo_row = repo.get("messages", key)
            if repo_row:
                await CloudflareD1Loader(self.env.DB).update("messages", key, {
                    "status": form.get("status") or repo_row.get("status") or "new",
                    "visibility": form.get("visibility") or repo_row.get("visibility") or "staff",
                })
            await self._audit(repo, env, "quick_update", "messages", key, "快速修改 留言")
            return redirect("/admin/table/messages")
        if path in {"/api/admin/translation/status", "/api/admin/translation/start", "/api/admin/translation/stop", "/api/admin/translation/auto-step"} and getattr(self.env, "DB", None) is not None:
            import json

            loader = CloudflareD1Loader(self.env.DB)
            translation_env = {"PLATFORM": "cloudflare"}
            if path == "/api/admin/translation/status":
                result = translation_job_status_payload(repo, translation_env)
            elif path == "/api/admin/translation/start":
                result = translation_job_start(repo, body, translation_env)
            elif path == "/api/admin/translation/stop":
                result = translation_job_stop(repo, translation_env)
            else:
                result = translation_auto_translate_step(repo, body, translation_env)
                for item in result.get("items") or []:
                    key = item.get("uid")
                    row = repo.get("translation_cache", key) if key else None
                    if row:
                        await loader.save("translation_cache", row)
                await self._audit(repo, env, "auto_translate", "translation_cache", "", "自动翻译缓存分步执行", result, "warning" if result.get("failed") else "success")
            for row in repo.list("global_settings"):
                await loader.save("global_settings", row)
            return 200, [("content-type", "application/json; charset=utf-8")], json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if path == "/api/admin/translation/inline" and getattr(self.env, "DB", None) is not None:
            import json

            loader = CloudflareD1Loader(self.env.DB)
            row = translation_inline_update(repo, body)
            source_hash = str(row.get("source_hash") or "").strip()
            if source_hash:
                for cache in repo.list("translation_cache"):
                    if str(cache.get("source_hash") or "").strip() == source_hash:
                        await loader.save("translation_cache", cache)
            else:
                await loader.save("translation_cache", row)
            result = translation_inline_payload(row)
            await self._audit(repo, env, "inline_update", "translation_cache", str(row.get("uid") or ""), "手动保存/确认翻译缓存", result)
            return 200, [("content-type", "application/json; charset=utf-8")], json.dumps(result, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "translation_cache" and parts[3] in {"scan", "auto-translate", "inline", "delete"} and getattr(self.env, "DB", None) is not None:
            loader = CloudflareD1Loader(self.env.DB)
            if parts[3] == "scan":
                before_keys = {str(row.get("uid") or row.get("id")) for row in repo.list("translation_cache") if row.get("uid") or row.get("id")}
                result = translation_scan_database(repo)
                after_keys = {str(row.get("uid") or row.get("id")) for row in repo.list("translation_cache") if row.get("uid") or row.get("id")}
                for key in sorted(before_keys - after_keys):
                    await loader.delete("translation_cache", key)
                for row in repo.list("translation_cache"):
                    await loader.save("translation_cache", row)
                await self._audit(repo, env, "scan", "translation_cache", "", "扫描数据库提取翻译缓存", result)
                return redirect(f"/admin/table/translation_cache?scanned={result.get('created', 0)}&updated={result.get('updated', 0)}&dedicated={result.get('dedicated', 0)}&deleted={result.get('deleted', 0)}")
            if parts[3] == "auto-translate":
                result = translation_auto_translate(repo, body, {"PLATFORM": "cloudflare"})
                for row in repo.list("translation_cache"):
                    await loader.save("translation_cache", row)
                await self._audit(repo, env, "auto_translate", "translation_cache", "", "自动翻译缓存", result, "warning" if result.get("failed") else "success")
                return redirect(f"/admin/table/translation_cache?translated={result.get('translated', 0)}&failed={result.get('failed', 0)}&provider={result.get('provider') or ''}&scope={result.get('scope') or ''}&selected={result.get('selected', 0)}")
            if parts[3] == "delete" and len(parts) >= 5:
                row = repo.get("translation_cache", parts[4])
                source_hash = str((row or {}).get("source_hash") or "").strip()
                delete_keys = [parts[4]]
                if source_hash:
                    delete_keys.extend(
                        str(cache.get("uid") or cache.get("id"))
                        for cache in repo.list("translation_cache")
                        if str(cache.get("source_hash") or "").strip() == source_hash and (cache.get("uid") or cache.get("id"))
                    )
                translation_delete_cache(repo, parts[4])
                for key in sorted(set(delete_keys)):
                    await loader.delete("translation_cache", key)
                await self._audit(repo, env, "delete", "translation_cache", parts[4], "删除翻译缓存", {"deleted": True})
                return redirect("/admin/table/translation_cache")
            translation_inline_update(repo, body)
            for row in repo.list("translation_cache"):
                await loader.save("translation_cache", row)
            await self._audit(repo, env, "inline_update", "translation_cache", "", "手动保存/确认翻译缓存")
            return redirect("/admin/table/translation_cache")
        if len(parts) == 4 and parts[0] == "admin" and parts[1] == "table" and parts[3] == "save":
            table = parts[2]
            if table in TABLE_MAP and getattr(self.env, "DB", None) is not None:
                form = _form(body)
                data = normalize_admin_data(TABLE_MAP[table], form)
                if table == "auth_users":
                    existing = repo.get(table, data.get("uid") or form.get("uid") or data.get("id"))
                    new_password = str(form.get("new_password") or "")
                    if new_password:
                        data["password_hash"] = hash_password(new_password)
                    elif existing:
                        data["password_hash"] = existing.get("password_hash", "")
                    else:
                        data["password_hash"] = hash_password(stable_uid("temp-password", str(data.get("uid") or "")))
                        data["must_change_password"] = 1
                    if not data.get("role_uid"):
                        data["role_uid"] = "role-visitor"
                    if not data.get("status"):
                        data["status"] = "active"
                if table == "auth_permissions":
                    role_uid = str(data.get("role_uid") or "").strip()
                    module = str(data.get("module") or "").strip()
                    if role_uid and module:
                        data["uid"] = stable_uid("perm", f"{role_uid}:{module}")
                if table == "translation_cache":
                    existing = repo.get(table, data.get("uid") or form.get("uid") or data.get("id"))
                    if existing:
                        for readonly_name in ("source_ref_key", "source_hash", "source_refs", "source_text"):
                            data[readonly_name] = existing.get(readonly_name, data.get(readonly_name, ""))
                await CloudflareD1Loader(self.env.DB).save(table, data)
                await self._audit(repo, env, "save", table, str(data.get("uid") or data.get("id") or ""), f"保存 {TABLE_MAP[table].label}", {"action": form.get("_action") or "save"})
                if form.get("_action") == "save_continue":
                    return redirect(f"/admin/table/{table}/{data.get('uid') or data.get('id')}")
                return redirect(f"/admin/table/{table}")
        return None

    def _parse_url(self, url: str):
        from urllib.parse import unquote, urlsplit

        parsed = urlsplit(url)
        return {"path": unquote(parsed.path or "/"), "query": parsed.query or "", "host": parsed.netloc or ""}
