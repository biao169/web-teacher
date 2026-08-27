

from __future__ import annotations



import json

from typing import Any

from urllib.parse import parse_qs



from app.core.models import int_value

from app.core.rendering import (

    api_auth_response,

    current_auth,

    current_user,

    has_permission,

    html_response,

    json_response,

    layout,

    redirect,

    security_headers,

)

from app.core.security import esc, text_only



from . import services

from .db import ensure_schema

from .views import admin_page, lang, transfer_page





ResponseTuple = tuple[int, list[tuple[str, str]], bytes]





def standalone_local(env: dict[str, str]) -> bool:

    remote = str(env.get("_REMOTE_ADDR") or "").strip()

    host = str(env.get("_HOST") or "").split(":", 1)[0].strip().lower()

    local = {"127.0.0.1", "localhost", "::1", ""}

    return str(env.get("_TRANSFER_STANDALONE") or "") == "1" and (remote in local or host in local)





def route_transfer_request(repo: Any, method: str, path: str, query: dict[str, str], body: bytes, env: dict[str, str]) -> ResponseTuple:

    requested_lang = str(query.get("lang") or query.get("_lang") or "").strip().lower()

    if requested_lang.startswith("zh") or requested_lang in {"cn", "chinese"}:

        env = {**env, "_LANG": "zh"}

    elif requested_lang.startswith("en"):

        env = {**env, "_LANG": "en"}

    try:

        ensure_schema(repo)

        services.cleanup_expired(repo, env)

    except Exception as error:

        return unavailable_response(str(error), path)



    if path.startswith("/transfer/assets/"):

        return asset_response(path)



    if path == "/admin/transfer":

        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_edit")

        if denied:

            return denied if path.startswith("/api/") else redirect("/admin/login?next=/admin/transfer")

        return html_response(admin_page(repo, env))



    if path == "/admin/transfer/control" and method == "POST":

        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_edit")

        if denied:

            return denied

        services.save_control(repo, form_data(body))

        return redirect(f"/admin/transfer?lang={lang(env)}&saved=1")



    if path == "/api/admin/transfer/control" and method == "POST":
        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_edit")
        if denied:
            return denied
        saved = services.save_control(repo, form_data(body))
        requested_with = str(env.get("_HTTP_X_REQUESTED_WITH") or env.get("HTTP_X_REQUESTED_WITH") or "").lower()
        accept = str(env.get("_HTTP_ACCEPT") or env.get("HTTP_ACCEPT") or "").lower()
        if "transfer-admin" in requested_with or "application/json" in accept:
            return json_response({"ok": True, "control": saved})
        return redirect(f"/admin/transfer?lang={lang(env)}&saved=1")

    if path == "/api/admin/transfer/sessions":

        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_view")

        if denied:

            return denied

        return json_response({"ok": True, "sessions": services.admin_sessions(repo), "resources": services.resource_state(repo, env)})



    if path.startswith("/api/admin/transfer/sessions/") and path.endswith("/stop") and method == "POST":

        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_delete")

        if denied:

            return denied

        room = path.removeprefix("/api/admin/transfer/sessions/").removesuffix("/stop").strip("/")

        user = current_user(repo, env)

        try:

            session = services.stop_session(repo, room, str(user.get("uid") or ""), env)

            return json_response({"ok": True, "session": session})

        except ValueError as error:

            return json_response({"ok": False, "message": str(error)}, 400)



    if path.startswith("/api/admin/transfer/sessions/") and path.endswith("/delete") and method == "POST":
        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_delete")
        if denied:
            return denied
        room = path.removeprefix("/api/admin/transfer/sessions/").removesuffix("/delete").strip("/")
        user = current_user(repo, env)
        try:
            session = services.delete_session(repo, room, str(user.get("uid") or ""), env)
            return json_response({"ok": True, "session": session})
        except ValueError as error:
            return json_response({"ok": False, "message": str(error)}, 400)

    if path.startswith("/api/admin/transfer/sessions/") and path.endswith("/destroy") and method == "POST":
        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_delete")
        if denied:
            return denied
        room = path.removeprefix("/api/admin/transfer/sessions/").removesuffix("/destroy").strip("/")
        user = current_user(repo, env)
        try:
            session = services.destroy_session(repo, room, str(user.get("uid") or ""), env)
            return json_response({"ok": True, "session": session})
        except ValueError as error:
            return json_response({"ok": False, "message": str(error)}, 400)

    if path == "/api/admin/transfer/feature/disable" and method == "POST":

        denied = None if standalone_local(env) else api_auth_response(repo, env, "transfer_site", "can_edit")

        if denied:

            return denied

        services.save_control(repo, {"enabled": 0, "shutdown_policy": "immediate"})

        user = current_user(repo, env)

        services.audit(repo, str(user.get("uid") or ""), "admin_disabled_feature", "", "", env, "The transfer feature was disabled remotely by an administrator.", {})

        return json_response({"ok": True, "control": services.control(repo)})



    if path == "/api/transfer/status":

        return json_response({"ok": True, "control": public_control(services.control(repo)), "resources": public_resources(services.resource_state(repo, env))})



    if path == "/api/transfer/sessions" and method == "POST":

        denied = front_permission_response(repo, env, "can_create")

        if denied:

            return denied

        data = json_body(body)

        user = current_user(repo, env)

        try:

            session = services.create_session(repo, env, str(user.get("uid") or ""), text_only(data.get("mode") or "auto", 30))

            return json_response({"ok": True, "session": session})

        except ValueError as error:

            return json_response({"ok": False, "message": str(error)}, 400)



    if path.startswith("/api/transfer/sessions/"):

        return session_api(repo, method, path, query, body, env)



    if path.startswith("/api/transfer/signal/"):

        return signal_api(repo, method, path, query, body, env)



    if path == "/transfer" or path.startswith("/transfer/r/") or path.startswith("/transfer/receive/"):

        denied = front_page_denied(repo, env, path)

        if denied:

            return denied

        return html_response(layout(repo, "文件传输" if lang(env) == "zh" else "File Transfer", transfer_page(repo, env, path), env))



    return json_response({"ok": False, "message": "Unknown transfer endpoint."}, 404)





def can_open_receive_link(path: str, cfg: dict[str, Any]) -> bool:

    return services.truthy(cfg.get("allow_anonymous_by_code"), True) and (path.startswith("/transfer/receive/") or path.startswith("/transfer/r/"))





def allow_signed_in_without_transfer_permission(cfg: dict[str, Any], action: str) -> bool:

    return action in {"can_view", "can_create"} and services.truthy(cfg.get("allow_authenticated_without_permission"), False)





def can_send_to_session(repo: Any, env: dict[str, str], session: dict[str, Any], user_uid: str, cfg: dict[str, Any]) -> bool:

    if standalone_local(env):

        return True

    if services.session_owner(session, user_uid):

        return True

    if current_auth(repo, env):

        return has_permission(repo, env, "transfer_site", "can_create") or allow_signed_in_without_transfer_permission(cfg, "can_create")

    return not services.truthy(cfg.get("require_login"), True)







def transfer_access_denied(repo: Any, env: dict[str, str], session: dict[str, Any], code: str, user_uid: str, cfg: dict[str, Any]) -> ResponseTuple | None:

    if not session:

        return json_response({"ok": False, "message": "You do not have access to this transfer task."}, 403)

    if services.session_owner(session, user_uid):

        return None

    if user_uid and not services.truthy(cfg.get("require_login"), True):

        services.clear_access_failures(repo, session)

        return None

    if services.access_wait_seconds(session) > 0:

        return json_response({"ok": False, "message": services.access_lock_message(session)}, 429)

    if not services.verify_session_access(repo, session, code, user_uid, cfg):

        services.record_access_failure(repo, session, env)

        return json_response({"ok": False, "message": "You do not have access to this transfer task."}, 403)

    services.clear_access_failures(repo, session)

    return None



def session_api(repo: Any, method: str, path: str, query: dict[str, str], body: bytes, env: dict[str, str]) -> ResponseTuple:

    parts = [item for item in path.split("/") if item]

    if len(parts) < 4:

        return json_response({"ok": False, "message": "Incomplete endpoint path."}, 404)

    room = parts[3]

    cfg = services.control(repo)

    user = current_user(repo, env)

    user_uid = str(user.get("uid") or "")

    code = str(query.get("code") or "")

    if len(parts) == 5 and parts[4] == "join" and method == "POST":

        data = json_body(body)

        try:

            session = services.join_session(repo, env, room, text_only(data.get("code") or code, 40), user_uid)

            return json_response({"ok": True, "session": session})

        except ValueError as error:

            return json_response({"ok": False, "message": str(error)}, 403)

    session = services.get_session(repo, room)

    denied = transfer_access_denied(repo, env, session, code, user_uid, cfg)

    if denied:

        return denied

    if len(parts) == 5 and parts[4] == "objects" and method == "GET":

        return json_response({"ok": True, "session": session, "objects": services.list_objects(repo, session["uid"])})

    if len(parts) == 5 and parts[4] == "objects" and method == "POST":

        if not can_send_to_session(repo, env, session, user_uid, cfg):

            return json_response({"ok": False, "message": "Code receivers can download only."}, 403)

        data = json_body(body)

        try:

            obj = services.create_object(repo, env, session, data, user_uid)

            return json_response({"ok": True, "object": obj})

        except ValueError as error:

            return json_response({"ok": False, "message": str(error)}, 400)

    if len(parts) == 7 and parts[4] == "objects" and parts[6] == "chunk":

        object_uid = parts[5]

        if method == "POST":

            if not can_send_to_session(repo, env, session, user_uid, cfg):

                return json_response({"ok": False, "message": "Code receivers can download only."}, 403)

            try:

                obj = services.write_chunk(repo, env, session, object_uid, int_value(query.get("offset"), 0), body, user_uid)

                return json_response({"ok": True, "object": obj})

            except ValueError as error:

                return json_response({"ok": False, "message": str(error)}, 400)

        if method == "GET":

            obj = services.get_object(repo, session["uid"], object_uid)

            try:

                chunk = services.read_object_chunk(repo, env, obj, int_value(query.get("offset"), 0), int_value(query.get("limit"), 1024 * 1024), user_uid)

            except ValueError as error:

                return json_response({"ok": False, "message": str(error)}, 404)

            headers = security_headers() + [("content-type", "application/octet-stream"), ("cache-control", "no-store"), ("x-transfer-chunk-size", str(len(chunk)))]

            return 200, headers, chunk

    if len(parts) == 5 and parts[4] == "finish" and method == "POST":

        if not can_send_to_session(repo, env, session, user_uid, cfg):

            return json_response({"ok": False, "message": "Code receivers can download only."}, 403)

        return json_response({"ok": True, "session": services.finish_session(repo, session["uid"], user_uid, env)})

    if len(parts) == 5 and parts[4] == "stop" and method == "POST":

        if user_uid != str(session.get("created_by") or "") and not has_permission(repo, env, "transfer_site", "can_delete"):

            return json_response({"ok": False, "message": "You do not have permission to stop this task."}, 403)

        return json_response({"ok": True, "session": services.stop_session(repo, room, user_uid, env, "Stopped by user")})

    return json_response({"ok": False, "message": "Unknown transfer task endpoint."}, 404)





def signal_api(repo: Any, method: str, path: str, query: dict[str, str], body: bytes, env: dict[str, str]) -> ResponseTuple:

    room = path.removeprefix("/api/transfer/signal/").strip("/")

    if not room:

        return json_response({"ok": False, "message": "Room ID is required."}, 400)

    cfg = services.control(repo)

    user = current_user(repo, env)

    user_uid = str(user.get("uid") or "")

    data = json_body(body) if method == "POST" else {}

    code = text_only(data.get("code") or query.get("code") or "", 80)

    session = services.get_session(repo, room)

    denied = transfer_access_denied(repo, env, session, code, user_uid, cfg)

    if denied:

        return denied

    if method == "POST":

        payload = {key: value for key, value in data.items() if key != "code"}

        services.add_signal(repo, room, str(user.get("uid") or env.get("_REMOTE_ADDR") or "anonymous"), text_only(payload.get("type") or "signal", 40), payload)

        return json_response({"ok": True})

    return json_response({"ok": True, "signals": services.list_signals(repo, room, int_value(query.get("after"), 0))})





def front_permission_response(repo: Any, env: dict[str, str], action: str) -> ResponseTuple | None:

    cfg = services.control(repo)

    if not services.truthy(cfg.get("enabled"), True):

        return json_response({"ok": False, "message": "File transfer is currently disabled."}, 503)

    if standalone_local(env):

        return None

    auth = current_auth(repo, env)

    if services.truthy(cfg.get("require_login"), True) and not auth:

        return json_response({"ok": False, "message": "Please sign in before using file transfer."}, 401)

    if auth and not has_permission(repo, env, "transfer_site", action) and not allow_signed_in_without_transfer_permission(cfg, action):

        return json_response({"ok": False, "message": "This account does not have permission to use file transfer."}, 403)

    return None





def front_page_denied(repo: Any, env: dict[str, str], path: str = "/transfer") -> ResponseTuple | None:

    cfg = services.control(repo)

    if not services.truthy(cfg.get("enabled"), True) and not has_permission(repo, env, "transfer_site", "can_edit"):

        body = '<section class="transfer-shell"><div class="transfer-notice"><h1>File transfer is disabled</h1><p>An administrator has temporarily disabled file transfer.</p></div></section>'

        return html_response(layout(repo, "File transfer disabled", body, env), 503)

    if standalone_local(env):

        return None

    auth = current_auth(repo, env)

    if services.truthy(cfg.get("require_login"), True) and not auth:

        if can_open_receive_link(path, cfg):

            return None

        return redirect("/login?next=/transfer")

    if auth and not has_permission(repo, env, "transfer_site", "can_view") and not allow_signed_in_without_transfer_permission(cfg, "can_view"):

        if can_open_receive_link(path, cfg):

            return None

        body = '<section class="transfer-shell"><div class="transfer-notice"><h1>Access denied</h1><p>This account does not have permission to use file transfer.</p></div></section>'

        return html_response(layout(repo, "Access denied", body, env), 403)

    return None





def unavailable_response(message: str, path: str) -> ResponseTuple:

    payload = {"ok": False, "message": message}

    if path.startswith("/api/"):

        return json_response(payload, 503)

    return html_response(f"<!doctype html><meta charset='utf-8'><title>File transfer unavailable</title><p>{esc(message)}</p>", 503)





def public_resources(resources: dict[str, Any]) -> dict[str, Any]:

    usage = resources.get("usage") or {}

    return {"ok": resources.get("ok", True), "warnings": resources.get("warnings") or [], "blockers": resources.get("blockers") or [], "usage": {"daily_bytes": usage.get("daily_bytes", 0), "weekly_bytes": usage.get("weekly_bytes", 0), "monthly_bytes": usage.get("monthly_bytes", 0), "yearly_bytes": usage.get("yearly_bytes", 0)}}





def public_control(cfg: dict[str, Any]) -> dict[str, Any]:

    keys = ["enabled", "lan_acceleration_enabled", "relay_enabled", "cloud_relay_enabled", "lan_only", "auto_fallback_enabled", "temp_storage_enabled", "temp_storage_mode", "code_expire_minutes", "max_bandwidth_kbps", "max_bandwidth_per_session_kbps", "allow_anonymous_by_code", "allow_authenticated_without_permission", "show_frontend_warnings"]

    return {key: cfg.get(key) for key in keys}





def asset_response(path: str) -> ResponseTuple:

    if path.endswith(".css"):

        from .static_assets import TRANSFER_CSS

        return 200, security_headers() + [("content-type", "text/css; charset=utf-8"), ("cache-control", "public, max-age=3600")], TRANSFER_CSS.encode("utf-8")

    if path.endswith(".js"):

        from .static_assets import TRANSFER_JS

        return 200, security_headers() + [("content-type", "application/javascript; charset=utf-8"), ("cache-control", "public, max-age=3600")], TRANSFER_JS.encode("utf-8")

    return json_response({"ok": False, "message": "Static asset not found."}, 404)





def json_body(body: bytes) -> dict[str, Any]:

    try:

        data = json.loads(body.decode("utf-8") if body else "{}")

        return data if isinstance(data, dict) else {}

    except (UnicodeDecodeError, json.JSONDecodeError):

        return {}





def form_data(body: bytes) -> dict[str, str]:

    parsed = parse_qs(body.decode("utf-8", "ignore"), keep_blank_values=True)

    return {key: values[-1] if values else "" for key, values in parsed.items()}

