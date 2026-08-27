from __future__ import annotations

from workers import Response, WorkerEntrypoint

from app.adapters.cloudflare_repository import CloudflareD1Loader
from app.core.media import media_storage_kind, r2_preferred_key
from app.core.models import TABLE_MAP
from app.core.rendering import (
    AUTH_COOKIE_NAME,
    I18N_DICTIONARY_R2_KEY,
    _form,
    admin_batch_update,
    audit_admin_action,
    auth_secret,
    auth_users_exist,
    current_auth,
    ensure_auth_defaults,
    has_permission,
    i18n_dictionary_update_payload,
    normalize_admin_data,
    prepare_media_crop,
    prepare_media_upload,
    public_html_cache_response,
    redirect,
    route_request,
    store_public_html_cache,
    invalidate_public_html_cache,
    same_origin_post_allowed,
    security_headers,
    translation_auto_translate,
    translation_auto_translate_step,
    translation_delete_cache,
    translation_inline_payload,
    translation_inline_update,
    translation_job_start,
    translation_job_status_payload,
    translation_job_stop,
    translation_scan_database,
)
from app.core.repository import MemoryRepository
from app.core.security import hash_password, parse_cookie_header, read_signed_session, stable_uid


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = request.url
        parsed = self._parse_url(url)
        path = parsed["path"]

        if path.startswith("/media/"):
            media = await self._media_response(request, path)
            if media is not None:
                return media

        if path.startswith("/assets/"):
            return await self._asset_response(request)

        pre_env = {
            "SITE_URL": getattr(self.env, "SITE_URL", ""),
            "PLATFORM": "cloudflare",
            "_COOKIE": request.headers.get("cookie") or "",
        }
        cached_html = public_html_cache_response(request.method, path, parsed["query"], pre_env)
        if cached_html:
            status, headers, payload = cached_html
            return Response(payload.decode("utf-8"), status=status, headers=dict(headers))

        repo = await self._repo()
        dictionary_env = await self._i18n_dictionary_env()
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
            **dictionary_env,
        }
        if path in {"/admin/table/media_assets", "/admin/table/media_assets/trash"} and getattr(self.env, "DB", None) is not None:
            await self._clear_expired_media_trash(repo)
            repo = await self._repo()
        if path.startswith(("/admin", "/api/admin")):
            ensure_auth_defaults(repo)
        if path == "/api/admin/system-check":
            return await self._system_check_response(repo, env, request)
        if request.method == "POST" and path in {"/api/admin/media/upload", "/api/admin/media/crop"}:
            action = "can_create" if path.endswith("/upload") else "can_edit"
            if not same_origin_post_allowed("POST", env) or not current_auth(repo, env) or not has_permission(repo, env, "media_assets", action):
                return self._json_response({"ok": False, "message": "当前账号没有媒体写入权限。"}, status=403)
            body = await self._request_bytes(request)
            payload = await self._handle_media_write(repo, path, body, env)
            if payload.get("ok"):
                invalidate_public_html_cache()
            return self._json_response(payload, status=200 if payload.get("ok") else 400)
        body = b""
        if request.method == "POST":
            body = await self._request_bytes(request)
            saved = await self._handle_admin_save(repo, path, body, env)
            if saved:
                invalidate_public_html_cache()
                status, headers, payload = saved
                return Response(payload.decode("utf-8"), status=status, headers=dict(headers))

        status, headers, payload = route_request(repo, request.method, path, parsed["query"], body, env)
        if request.method == "GET":
            status, headers, payload = store_public_html_cache(request.method, path, parsed["query"], env, (status, headers, payload))
        if request.method == "POST" and path in {"/admin/setup", "/admin/login", "/login", "/register"} and getattr(self.env, "DB", None) is not None:
            loader = CloudflareD1Loader(self.env.DB)
            for table in ("auth_roles", "auth_permissions", "auth_users"):
                for row in repo.list(table):
                    await loader.save(table, row)
        return Response(payload.decode("utf-8"), status=status, headers=dict(headers))


    async def _system_check_response(self, repo, env: dict[str, str], request):
        import json
        import time

        db = getattr(self.env, "DB", None)
        bucket = getattr(self.env, "MEDIA", None)
        cookies = parse_cookie_header(request.headers.get("cookie") or "")
        token = cookies.get(AUTH_COOKIE_NAME, "")
        session_payload = read_signed_session(token, auth_secret(repo, env)) if token else {}
        auth = current_auth(repo, env)
        role_uid = str(((auth.get("user") or {}).get("role_uid")) or session_payload.get("role_uid") or "")
        payload = {
            "ok": True,
            "platform": "cloudflare",
            "checked_at": int(time.time()),
            "bindings": {
                "d1_db_bound": db is not None,
                "r2_media_bound": bucket is not None,
            },
            "environment": {
                "site_url_configured": bool(getattr(self.env, "SITE_URL", "")),
                "public_media_base_url_configured": bool(getattr(self.env, "PUBLIC_MEDIA_BASE_URL", "")),
                "auth_secret_configured": bool(getattr(self.env, "TEACHER_SITE_AUTH_SECRET", "")),
                "auth_secret_length_ok": len(str(getattr(self.env, "TEACHER_SITE_AUTH_SECRET", "") or "")) >= 32,
            },
            "repository_view": {
                "auth_users_exist": auth_users_exist(repo),
                "auth_users_count": len(repo.list("auth_users")),
                "auth_roles_count": len(repo.list("auth_roles")),
                "auth_permissions_count": len(repo.list("auth_permissions")),
                "super_admin_role_seen": bool(repo.get("auth_roles", "role-super-admin")),
            },
            "cookie": {
                "present": bool(token),
                "valid_signature": bool(session_payload),
                "uid_present": bool(session_payload.get("uid")),
                "current_auth_ok": bool(auth),
                "current_role_uid": role_uid,
            },
            "d1_direct": await self._d1_system_check(db),
            "r2_direct": await self._r2_system_check(bucket),
        }
        headers = {key: value for key, value in security_headers()}
        headers["content-type"] = "application/json; charset=utf-8"
        headers["cache-control"] = "no-store"
        return Response(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), status=200, headers=headers)

    async def _d1_system_check(self, db) -> dict:
        if db is None:
            return {"ok": False, "error": "DB binding is missing"}
        result: dict = {"ok": True, "tables": {}, "checks": {}}
        for table in ("auth_users", "auth_roles", "auth_permissions", "global_settings", "site_settings", "media_assets", "translation_cache"):
            try:
                row = await db.prepare(f"SELECT COUNT(*) AS count FROM {table}").first()
                result["tables"][table] = {"ok": True, "count": self._binding_value(row, "count", 0)}
            except Exception as error:
                result["ok"] = False
                result["tables"][table] = {"ok": False, "error": str(error)}
        try:
            row = await db.prepare("SELECT COUNT(*) AS count FROM auth_users WHERE status = 'active'").first()
            result["checks"]["active_auth_users"] = self._binding_value(row, "count", 0)
        except Exception as error:
            result["checks"]["active_auth_users_error"] = str(error)
        try:
            row = await db.prepare("SELECT uid, level, is_active FROM auth_roles WHERE uid = 'role-super-admin' LIMIT 1").first()
            result["checks"]["super_admin_role"] = self._safe_row(row, ("uid", "level", "is_active"))
        except Exception as error:
            result["checks"]["super_admin_role_error"] = str(error)
        try:
            row = await db.prepare("SELECT uid, role_uid, status FROM auth_users ORDER BY id DESC LIMIT 1").first()
            result["checks"]["latest_auth_user"] = self._safe_row(row, ("uid", "role_uid", "status"))
        except Exception as error:
            result["checks"]["latest_auth_user_error"] = str(error)
        try:
            rows = await db.prepare("SELECT * FROM auth_users ORDER BY id DESC LIMIT 1").all()
            result["checks"]["auth_users_select_all"] = {"ok": True, "rows": len(getattr(rows, "results", []) or [])}
        except Exception as error:
            result["checks"]["auth_users_select_all"] = {"ok": False, "error": str(error)}
        return result

    async def _r2_system_check(self, bucket) -> dict:
        if bucket is None:
            return {"ok": False, "error": "MEDIA R2 binding is missing"}
        try:
            obj = await bucket.get(I18N_DICTIONARY_R2_KEY)
            if obj is None:
                return {"ok": True, "i18n_dictionary_exists": False, "key": I18N_DICTIONARY_R2_KEY}
            size = self._binding_value(obj, "size", None)
            return {"ok": True, "i18n_dictionary_exists": True, "key": I18N_DICTIONARY_R2_KEY, "size": size}
        except Exception as error:
            message = str(error)
            missing = "does not exist" in message.lower() or "10007" in message
            return {"ok": not missing, "i18n_dictionary_exists": False, "key": I18N_DICTIONARY_R2_KEY, "error": message}

    def _safe_row(self, row, fields: tuple[str, ...]) -> dict | None:
        if row is None:
            return None
        return {field: self._binding_value(row, field, "") for field in fields}

    def _binding_value(self, item, key: str, default=None):
        if item is None:
            return default
        if isinstance(item, dict):
            return item.get(key, default)
        return getattr(item, key, default)

    def _host(self, url: str) -> str:
        parsed = self._parse_url(url)
        return parsed.get("host", "")

    async def _media_response(self, request, path: str):
        from urllib.parse import unquote

        key = unquote(path.removeprefix("/media/").strip("/"))
        if not key:
            return await self._asset_response(request)
        if r2_preferred_key(key):
            r2_response = await self._r2_response(key)
            if r2_response is not None:
                return r2_response
            return await self._asset_response(request)
        asset = await self._asset_response(request)
        if int(getattr(asset, "status", 200) or 200) < 400:
            return asset
        r2_response = await self._r2_response(key)
        return r2_response or asset

    async def _r2_response(self, key: str):
        bucket = getattr(self.env, "MEDIA", None)
        if bucket is None or not key:
            return None
        obj = await bucket.get(key)
        if obj is None:
            return None
        headers = {key: value for key, value in security_headers()}
        headers["cache-control"] = "public, max-age=3600"
        content_type = getattr(getattr(obj, "httpMetadata", None), "contentType", None)
        if content_type:
            headers["content-type"] = content_type
        return Response(obj.body, headers=headers)

    async def _i18n_dictionary_env(self) -> dict:
        bucket = getattr(self.env, "MEDIA", None)
        if bucket is None:
            return {"_I18N_DICTIONARY_SOURCE": "bundled"}
        try:
            obj = await bucket.get(I18N_DICTIONARY_R2_KEY)
        except Exception:
            return {"_I18N_DICTIONARY_SOURCE": "bundled"}
        if obj is None:
            return {"_I18N_DICTIONARY_SOURCE": "bundled"}
        try:
            text = await obj.text()
        except Exception:
            try:
                buffer = await obj.arrayBuffer()
                from js import Uint8Array

                text = bytes(Uint8Array.new(buffer).to_py()).decode("utf-8", "ignore")
            except Exception:
                text = ""
        return {"_I18N_DICTIONARY_JSON": text, "_I18N_DICTIONARY_SOURCE": "r2"} if text else {"_I18N_DICTIONARY_SOURCE": "bundled"}

    async def _asset_response(self, request):
        response = await self.env.ASSETS.fetch(request)
        headers = dict(getattr(response, "headers", {}) or {})
        for key, value in security_headers():
            headers.setdefault(key, value)
        return Response(response.body, status=getattr(response, "status", 200), headers=headers)

    async def _repo(self):
        db = getattr(self.env, "DB", None)
        if db is None:
            return MemoryRepository({})
        loader = CloudflareD1Loader(db)
        return await loader.load_repository()

    async def _request_bytes(self, request) -> bytes:
        try:
            buffer = await request.arrayBuffer()
            try:
                from js import Uint8Array

                return bytes(Uint8Array.new(buffer).to_py())
            except Exception:
                return bytes(buffer)
        except Exception:
            text = await request.text()
            return text.encode("utf-8")

    def _json_response(self, payload: dict, status: int = 200):
        import json

        return Response(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), status=status, headers={"content-type": "application/json; charset=utf-8"})

    async def _handle_media_write(self, repo, path: str, body: bytes, env: dict[str, str]) -> dict:
        bucket = getattr(self.env, "MEDIA", None)
        if bucket is None:
            return {"ok": False, "message": "Cloudflare 未绑定 R2 MEDIA 存储桶，无法保存上传媒体。"}
        prepared = prepare_media_upload(repo, body, env, "r2", "uploads") if path.endswith("/upload") else prepare_media_crop(repo, body, env, "r2", "uploads")
        if not prepared.get("ok"):
            return prepared
        key = str(prepared.get("key") or "")
        content = prepared.get("content") or b""
        mime = str(prepared.get("mime") or "application/octet-stream")
        if not key or not isinstance(content, (bytes, bytearray)):
            return {"ok": False, "message": "媒体写入数据无效。"}
        try:
            await self._r2_put(key, bytes(content), mime)
        except Exception as error:
            return {"ok": False, "message": f"写入 R2 失败：{error}"}
        row = repo.save("media_assets", prepared["row"])
        if getattr(self.env, "DB", None) is not None:
            await CloudflareD1Loader(self.env.DB).save("media_assets", row)
        await self._audit(repo, env, "upload" if path.endswith("/upload") else "crop", "media_assets", str(row.get("uid") or key), "写入 Cloudflare R2 媒体", {"key": key, "storage_kind": "r2"})
        return {"ok": True, "key": key, "url": prepared.get("url"), "item": row, "replaced": bool(prepared.get("replaced"))}

    async def _r2_put(self, key: str, content: bytes, mime: str) -> None:
        bucket = getattr(self.env, "MEDIA", None)
        if bucket is None:
            raise RuntimeError("MEDIA bucket is not bound")
        body = self._bytes_to_r2_body(content)
        try:
            await bucket.put(key, body, httpMetadata={"contentType": mime})
        except TypeError:
            await bucket.put(key, body, {"httpMetadata": {"contentType": mime}})

    def _bytes_to_r2_body(self, content: bytes):
        try:
            from js import Uint8Array

            view = Uint8Array.new(len(content))
            view.assign(content)
            return view
        except Exception as error:
            raise TypeError(f"Could not convert Python bytes to a JavaScript Uint8Array for R2 upload: {error}") from error

    async def _delete_r2_for_row(self, row: dict | None) -> bool:
        if not row:
            return False
        key = str(row.get("object_key") or "").strip().strip("/")
        if not key:
            return True
        storage = media_storage_kind(row)
        if storage == "external":
            return True
        if storage != "r2" and not r2_preferred_key(key):
            return False
        bucket = getattr(self.env, "MEDIA", None)
        if bucket is None:
            return False
        try:
            await bucket.delete(key)
            return True
        except Exception:
            return False

    async def _clear_expired_media_trash(self, repo) -> None:
        import time

        days = 30
        try:
            settings = repo.list("global_settings")
            if settings:
                days = max(1, int(settings[0].get("media_trash_retention_days") or 30))
        except Exception:
            days = 30
        cutoff = time.time() - days * 86400
        loader = CloudflareD1Loader(self.env.DB)
        for row in repo.list("media_assets"):
            if str(row.get("status") or "active") != "trash":
                continue
            changed = self._parse_timestamp(row.get("updated_at") or row.get("created_at"))
            if changed and changed < cutoff:
                if await self._delete_r2_for_row(row):
                    await loader.delete("media_assets", str(row.get("uid") or row.get("id")))

    def _parse_timestamp(self, value) -> float | None:
        import time

        text = str(value or "").strip()
        if not text:
            return None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                return time.mktime(time.strptime(text[:19], fmt))
            except ValueError:
                continue
        return None

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
        if path == "/admin/i18n-dictionary/save":
            if not same_origin_post_allowed("POST", env) or not current_auth(repo, env) or not has_permission(repo, env, "translation_cache", "can_edit"):
                return 403, [("content-type", "text/plain; charset=utf-8")], b"Forbidden"
            payload = i18n_dictionary_update_payload(body, env)
            try:
                await self._r2_put(I18N_DICTIONARY_R2_KEY, payload["content"], "application/json; charset=utf-8")
                await self._audit(repo, env, "dictionary_save", "translation_cache", "", "保存手动中英词典到 R2", {"entries": payload.get("entries", 0), "key": I18N_DICTIONARY_R2_KEY})
                return redirect(f"/admin/i18n-dictionary?saved=r2&entries={payload.get('entries', 0)}")
            except Exception as error:
                await self._audit(repo, env, "dictionary_save_failed", "translation_cache", "", "保存手动中英词典到 R2 失败", {"error": str(error)}, "warning")
                return redirect(f"/admin/i18n-dictionary?saved=failed&entries={payload.get('entries', 0)}")
        if len(parts) >= 4 and parts[0] == "admin" and parts[1] == "table" and parts[2] == "media_assets" and getattr(self.env, "DB", None) is not None:
            loader = CloudflareD1Loader(self.env.DB)
            if len(parts) >= 5 and parts[3] == "trash" and parts[4] == "clear":
                deleted = 0
                skipped = 0
                for row in repo.list("media_assets"):
                    if str(row.get("status") or "active") == "trash":
                        key = str(row.get("uid") or row.get("id"))
                        if await self._delete_r2_for_row(row):
                            await loader.delete("media_assets", key)
                            deleted += 1
                        else:
                            skipped += 1
                result = {"deleted": deleted, "skipped": skipped}
                await self._audit(repo, env, "delete", "media_assets", "trash", "清空媒体回收站", result, "warning" if skipped else "success")
                return redirect(f"/admin/table/media_assets/trash?batch_deleted={deleted}&batch_skipped={skipped}")
            if len(parts) >= 6 and parts[3] == "trash":
                media_key = parts[4]
                action = parts[5]
                if action == "delete":
                    row = repo.get("media_assets", media_key)
                    deleted = await self._delete_r2_for_row(row)
                    if deleted:
                        await loader.delete("media_assets", media_key)
                    await self._audit(repo, env, action, "media_assets", media_key, f"媒体回收站操作：{action}", {"deleted": int(deleted), "skipped": 0 if deleted else 1}, "success" if deleted else "warning")
                    return redirect(f"/admin/table/media_assets/trash?batch_selected=1&batch_deleted={1 if deleted else 0}&batch_skipped={0 if deleted else 1}")
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
                        row = repo.get("media_assets", key)
                        if await self._delete_r2_for_row(row):
                            await loader.delete("media_assets", key)
                            deleted += 1
                        else:
                            skipped += 1
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
                    row = repo.get("media_assets", media_key)
                    deleted = await self._delete_r2_for_row(row)
                    if deleted:
                        await loader.delete("media_assets", media_key)
                    await self._audit(repo, env, action, "media_assets", media_key, f"媒体操作：{action}", {"deleted": int(deleted), "skipped": 0 if deleted else 1}, "success" if deleted else "warning")
                    return redirect(f"/admin/table/media_assets?batch_selected=1&batch_deleted={1 if deleted else 0}&batch_skipped={0 if deleted else 1}")
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
                result = translation_scan_database(repo, env)
                after_keys = {str(row.get("uid") or row.get("id")) for row in repo.list("translation_cache") if row.get("uid") or row.get("id")}
                for key in sorted(before_keys - after_keys):
                    await loader.delete("translation_cache", key)
                for row in repo.list("translation_cache"):
                    await loader.save("translation_cache", row)
                await self._audit(repo, env, "scan", "translation_cache", "", "扫描数据库提取翻译缓存", result)
                return redirect(f"/admin/table/translation_cache?scanned={result.get('created', 0)}&updated={result.get('updated', 0)}&dedicated={result.get('dedicated', 0)}&deleted={result.get('deleted', 0)}")
            if parts[3] == "auto-translate":
                result = translation_auto_translate(repo, body, {**env, "PLATFORM": "cloudflare"})
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
