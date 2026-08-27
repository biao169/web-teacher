from __future__ import annotations

from typing import Any

from app.core.rendering import current_auth, current_user, has_permission
from app.core.security import esc

from . import services


TEXT = {
    "en": {
        "tool": "Secure Transfer",
        "title": "File Transfer",
        "subtitle": "Create a transfer, share the link or code, and let the receiver join from another device or network. Errors and interruptions are shown as they happen.",
        "today_usage": "Used today",
        "task_usage": "This task",
        "send_tab": "Send",
        "receive_tab": "Receive",
        "send_title": "Send files",
        "receive_title": "Receive files",
        "drop_title": "Drop files or folders here",
        "drop_hint": "Folder structure is preserved when the browser supports it.",
        "pick_files": "Choose files",
        "pick_folder": "Choose folder",
        "share_link": "Share link",
        "copy": "Copy",
        "access_code": "Access code",
        "share_hint": "Send the link or access code to the receiver. They may be on another network or device.",
        "create": "Create transfer",
        "upload": "Start upload",
        "stop": "Stop",
        "receiver_name": "Receiver",
        "receive_note": "A shared link opens this screen automatically. You can also paste the room ID and access code manually.",
        "room_id": "Room ID",
        "room_placeholder": "Enter room ID",
        "code_placeholder": "000-000",
        "connect": "Connect",
        "choose_dir": "Choose save folder",
        "download_all": "Download all",
        "waiting": "Waiting",
        "mode_label": "Transfer mode",
        "mode_help_title": "Mode guide",
        "mode_auto": "Auto",
        "mode_auto_desc": "Smart route; tries the fastest available path first.",
        "mode_lan": "LAN direct",
        "mode_lan_desc": "Fastest on the same local network; usually no server traffic.",
        "mode_relay": "Server relay",
        "mode_relay_desc": "Works across networks; speed depends on server bandwidth.",
        "mode_cloud_relay": "Cloud relay",
        "mode_cloud_relay_desc": "Best for distant users when a cloud relay is configured.",
        "mode_temp_local": "Local temporary storage",
        "mode_temp_local_desc": "Receiver can download later; uses server storage until expiry.",
        "mode_temp_cloud": "Cloud temporary storage",
        "mode_temp_cloud_desc": "Best for large remote transfers when cloud storage is configured.",
    },
    "zh": {
        "tool": "安全传输工具",
        "title": "文件传输",
        "subtitle": "发送方创建任务并分享链接或随机码；接收方可在不同电脑、不同网络打开连接。不可用、限流或中断原因会实时显示。",
        "today_usage": "今日已用流量",
        "task_usage": "本任务",
        "send_tab": "我要发送",
        "receive_tab": "我要接收",
        "send_title": "发送文件",
        "receive_title": "接收文件",
        "drop_title": "拖拽文件或文件夹到这里",
        "drop_hint": "浏览器支持时会保留文件夹结构。",
        "pick_files": "选择文件",
        "pick_folder": "选择文件夹",
        "share_link": "分享链接",
        "copy": "复制",
        "access_code": "随机码",
        "share_hint": "把链接或随机码发给接收方；对方可以在不同网络、不同设备打开。",
        "create": "创建传输",
        "upload": "开始上传",
        "stop": "中断",
        "receiver_name": "接收方",
        "receive_note": "打开发送方分享的链接会自动进入接收模式；也可以手动输入房间号和随机码。",
        "room_id": "房间号",
        "room_placeholder": "输入房间号",
        "code_placeholder": "000-000",
        "connect": "连接",
        "choose_dir": "选择保存目录",
        "download_all": "下载全部",
        "waiting": "等待任务",
        "mode_label": "发送模式",
        "mode_help_title": "模式说明",
        "mode_auto": "自动",
        "mode_auto_desc": "智能选择；优先尝试最快可用路径。",
        "mode_lan": "局域网直连",
        "mode_lan_desc": "同一局域网最快；通常不占服务器流量。",
        "mode_relay": "服务器实时中转",
        "mode_relay_desc": "适合跨网络；速度取决于服务器带宽。",
        "mode_cloud_relay": "云服务器中转",
        "mode_cloud_relay_desc": "配置云中转后，适合远距离用户。",
        "mode_temp_local": "本机临时暂存",
        "mode_temp_local_desc": "接收方可稍后下载；到期前占用服务器暂存。",
        "mode_temp_cloud": "云端临时暂存",
        "mode_temp_cloud_desc": "配置云存储后，适合大文件远程传输。",
    },
}

MODE_KEYS = [
    ("auto", "mode_auto", "mode_auto_desc", "smart"),
    ("lan", "mode_lan", "mode_lan_desc", "fastest"),
    ("relay", "mode_relay", "mode_relay_desc", "steady"),
    ("cloud_relay", "mode_cloud_relay", "mode_cloud_relay_desc", "remote"),
    ("temp_local", "mode_temp_local", "mode_temp_local_desc", "async"),
    ("temp_cloud", "mode_temp_cloud", "mode_temp_cloud_desc", "large"),
]

ADMIN_HELP = {
    "enabled": "Turns the transfer feature on or off.",
    "shutdown_policy": "Controls what happens to active tasks when the feature is disabled. graceful: let active tasks finish while blocking new tasks; pause_active: request active tasks to pause when supported; immediate: stop active tasks immediately.",
    "require_login": "Controls whether anonymous visitors can open and send from the transfer tool.",
    "allow_anonymous_by_code": "Allows people with a valid code to receive and download without transfer permission. They cannot send files.",
    "allow_authenticated_without_permission": "Allows signed-in ordinary users without a transfer role permission to send and receive files.",
    "lan_acceleration_enabled": "Tries direct local-network transfer first.",
    "relay_enabled": "Allows live relay through this server without storing the full file.",
    "cloud_relay_enabled": "Allows a configured cloud relay node to carry live traffic.",
    "lan_only": "Blocks relay and storage modes; only direct LAN transfer is allowed.",
    "auto_fallback_enabled": "Lets clients fall back to another allowed route.",
    "temp_storage_enabled": "Allows temporary storage for later download.",
    "temp_storage_mode": "Chooses where temporary files may be stored.",
    "temp_expire_follow_code": "Makes temporary files expire with the access code.",
    "temp_expire_minutes": "Temporary file lifetime when it does not follow the access code.",
    "code_expire_minutes": "How long a room access code remains valid.",
    "max_bandwidth_kbps": "Global bandwidth cap. Use 0 for unlimited.",
    "max_bandwidth_per_session_kbps": "Per-transfer bandwidth cap. Use 0 for unlimited.",
    "daily_traffic_quota_gb": "Daily total traffic quota. Use 0 for unlimited.",
    "weekly_traffic_quota_gb": "Weekly total traffic quota. Use 0 for unlimited.",
    "monthly_traffic_quota_gb": "Monthly total traffic quota. Use 0 for unlimited.",
    "yearly_traffic_quota_gb": "Yearly total traffic quota. Use 0 for unlimited.",
    "disk_monitor_enabled": "Checks free disk before allowing storage-backed transfers.",
    "min_free_disk_gb": "Blocks storage-backed work when free disk drops below this value.",
    "min_free_disk_percent": "Blocks storage-backed work when free disk percent drops below this value.",
    "local_temp_total_quota_gb": "Total local temporary storage quota.",
    "local_temp_per_session_quota_gb": "Maximum local temporary storage for one task.",
    "warning_threshold_percent": "Warns when quota usage reaches this percentage.",
    "critical_threshold_percent": "Blocks new work when quota usage reaches this percentage.",
}


ADMIN_UI = {
    "en": {
        "page_title": "Transfer Control",
        "kicker": "Transfer Administration",
        "subtitle": "Control availability, routing, temporary storage, traffic quotas, disk protection, and active tasks.",
        "admin": "Admin",
        "navigation": "Navigation",
        "open_transfer": "Open transfer",
        "today": "Today",
        "week": "This week",
        "month": "This month",
        "free_disk": "Free disk",
        "temp_storage": "Temp storage",
        "save": "Save control settings",
        "disable": "Disable remotely",
        "live_tasks": "Live Tasks",
        "live_tasks_hint": "Admins can monitor active tasks and stop them when quota, security, or availability requires it.",
        "room": "Room",
        "status": "Status",
        "mode": "Mode",
        "progress": "Progress",
        "owner": "Owner",
        "created": "Created",
        "action": "Action",
        "stop": "Stop",
        "no_tasks": "No transfer tasks.",
        "stop_confirm": "Stop this transfer task?",
        "delete_confirm": "Delete this task record? Temporary files will remain until cleanup or destroy.",
        "destroy_confirm": "Destroy this task and remove temporary files now?",
        "disable_confirm": "Disable the transfer feature remotely?",
        "save_success": "Control settings saved.",
        "save_failed": "Save failed.",
    },
    "zh": {
        "page_title": "传输控制",
        "kicker": "传输后台",
        "subtitle": "控制功能启停、传输路径、临时暂存、流量配额、磁盘保护和实时任务。",
        "admin": "后台",
        "navigation": "导航",
        "open_transfer": "打开传输",
        "today": "今日",
        "week": "本周",
        "month": "本月",
        "free_disk": "磁盘剩余",
        "temp_storage": "暂存占用",
        "save": "保存控制设置",
        "disable": "远程关闭功能",
        "live_tasks": "实时任务",
        "live_tasks_hint": "管理员可监督正在使用的任务，并在配额、安全或可用性需要时中断任务。",
        "room": "房间",
        "status": "状态",
        "mode": "模式",
        "progress": "进度",
        "owner": "用户",
        "created": "创建时间",
        "action": "操作",
        "stop": "中断",
        "no_tasks": "暂无传输任务。",
        "stop_confirm": "确定要中断这个传输任务吗？",
        "disable_confirm": "确定要远程关闭文件传输功能吗？",
        "save_success": "控制设置已保存。",
        "save_failed": "保存失败。",
    },
}

ADMIN_HELP_ZH = {
    "enabled": "开启或关闭文件传输功能。",
    "shutdown_policy": "控制关闭功能时，正在进行的任务如何处理。",
    "require_login": "控制匿名访客是否可以打开并发送文件；开启后访客需要登录。",
    "allow_anonymous_by_code": "允许持有有效随机码的人免授权接收和下载；不能发送文件。",
    "allow_authenticated_without_permission": "允许已登录的普通用户在没有 transfer_site 角色授权时使用发送和接收。",
    "lan_acceleration_enabled": "优先尝试同局域网直连加速。",
    "relay_enabled": "允许通过本服务器实时中转，不完整落盘。",
    "cloud_relay_enabled": "允许已配置的云中转节点承载实时流量。",
    "lan_only": "只允许局域网直连，阻止中转和暂存模式。",
    "auto_fallback_enabled": "允许客户端在可用路径之间自动降级。",
    "temp_storage_enabled": "允许临时暂存，便于接收方稍后下载。",
    "temp_storage_mode": "选择临时文件允许存放的位置。",
    "temp_expire_follow_code": "让临时文件有效期与随机码有效期一致。",
    "temp_expire_minutes": "不跟随随机码时的临时文件有效期。",
    "code_expire_minutes": "房间随机码的有效时长。",
    "max_bandwidth_kbps": "全局带宽上限，0 表示不限制。",
    "max_bandwidth_per_session_kbps": "单个传输任务带宽上限，0 表示不限制。",
    "daily_traffic_quota_gb": "每日总流量上限，0 表示不限制。",
    "weekly_traffic_quota_gb": "每周总流量上限，0 表示不限制。",
    "monthly_traffic_quota_gb": "每月总流量上限，0 表示不限制。",
    "yearly_traffic_quota_gb": "每年总流量上限，0 表示不限制。",
    "disk_monitor_enabled": "允许暂存前检查可用磁盘空间。",
    "min_free_disk_gb": "剩余磁盘低于该数值时阻止暂存任务。",
    "min_free_disk_percent": "剩余磁盘百分比低于该数值时阻止暂存任务。",
    "local_temp_total_quota_gb": "本机临时暂存总容量上限。",
    "local_temp_per_session_quota_gb": "单个任务本机临时暂存容量上限。",
    "warning_threshold_percent": "配额使用达到该比例时发出预警。",
    "critical_threshold_percent": "配额使用达到该比例时阻止新任务。",
}

CONTROL_GROUP_ZH = {
    "Availability": "可用性",
    "Routing": "传输路径",
    "Temporary Storage": "临时暂存",
    "Bandwidth And Traffic": "带宽与流量",
    "Disk Protection": "磁盘保护",
}

CONTROL_LABEL_ZH = {
    "Feature enabled": "启用功能",
    "Shutdown policy": "关闭策略",
    "Require login": "要求登录",
    "Anonymous receiver by code": "免授权凭码接收",
    "Signed-in users without role permission": "普通登录用户可用",
    "LAN acceleration": "局域网加速",
    "Server relay": "服务器中转",
    "Cloud relay": "云服务器中转",
    "LAN only": "仅限局域网",
    "Auto fallback": "自动降级",
    "Temporary storage": "允许临时暂存",
    "Storage mode": "暂存模式",
    "Expire with code": "跟随随机码过期",
    "Temp expiry minutes": "暂存有效分钟",
    "Code expiry minutes": "随机码有效分钟",
    "Global KB/s": "全局 KB/s",
    "Per task KB/s": "单任务 KB/s",
    "Daily GB": "每日 GB",
    "Weekly GB": "每周 GB",
    "Monthly GB": "每月 GB",
    "Yearly GB": "每年 GB",
    "Disk monitor": "磁盘监控",
    "Min free GB": "最小剩余 GB",
    "Min free %": "最小剩余 %",
    "Local temp quota GB": "本机暂存总 GB",
    "Per task temp GB": "单任务暂存 GB",
    "Warning %": "预警 %",
    "Critical %": "阻断 %",
}


def lang(env: dict[str, str]) -> str:
    return "zh" if str(env.get("_LANG") or "").lower().startswith("zh") else "en"


def tx(env: dict[str, str], key: str) -> str:
    current = lang(env)
    return TEXT.get(current, TEXT["en"]).get(key, TEXT["en"].get(key, key))


def admin_tx(env: dict[str, str], key: str) -> str:
    current = lang(env)
    return ADMIN_UI.get(current, ADMIN_UI["en"]).get(key, ADMIN_UI["en"].get(key, key))


def admin_control_label(env: dict[str, str], fallback: str) -> str:
    if lang(env) == "zh":
        return CONTROL_LABEL_ZH.get(fallback, fallback)
    return fallback


def admin_control_group(env: dict[str, str], fallback: str) -> str:
    if lang(env) == "zh":
        return CONTROL_GROUP_ZH.get(fallback, fallback)
    return fallback


def admin_control_help(env: dict[str, str], key: str) -> str:
    if lang(env) == "zh":
        return ADMIN_HELP_ZH.get(key, ADMIN_HELP.get(key, ""))
    return ADMIN_HELP.get(key, "")



def admin_select_label(env: dict[str, str], name: str, choice: str) -> str:
    labels = {
        "en": {
            "shutdown_policy": {
                "graceful": "graceful - let active tasks finish, block new tasks",
                "pause_active": "pause_active - pause active tasks when supported",
                "immediate": "immediate - stop active tasks immediately",
            },
            "temp_storage_mode": {
                "none": "none - no temporary storage",
                "local": "local - store on this server temporarily",
                "cloud": "cloud - store on configured cloud node",
                "local_and_cloud": "local_and_cloud - prefer cloud, fall back to local",
            },
        },
        "zh": {
            "shutdown_policy": {
                "graceful": "graceful - 当前任务完成，阻止新任务",
                "pause_active": "pause_active - 支持时暂停正在进行的任务",
                "immediate": "immediate - 立即中断正在进行的任务",
            },
            "temp_storage_mode": {
                "none": "none - 不使用临时暂存",
                "local": "local - 暂存在本服务器",
                "cloud": "cloud - 暂存在云端节点",
                "local_and_cloud": "local_and_cloud - 优先云端，失败回退本机",
            },
        },
    }
    return labels.get(lang(env), labels["en"]).get(name, {}).get(choice, choice)

def transfer_page(repo: Any, env: dict[str, str], path: str) -> str:
    cfg = services.control(repo)
    resources = services.resource_state(repo, env, cfg)
    user = current_user(repo, env)
    current_lang = lang(env)
    room = ""
    receive = False
    if path.startswith("/transfer/r/"):
        room = path.removeprefix("/transfer/r/").strip("/")
    if path.startswith("/transfer/receive/"):
        room = path.removeprefix("/transfer/receive/").strip("/")
        receive = True
    warnings = "".join(f"<li>{esc(item)}</li>" for item in resources.get("warnings", []))
    blockers = "".join(f"<li>{esc(item)}</li>" for item in resources.get("blockers", []))
    state_class = "is-blocked" if blockers else "is-ready"
    options = "".join(
        f'<option value="{value}" data-speed="{esc(speed)}">{esc(tx(env, label_key))} - {esc(tx(env, desc_key))}</option>'
        for value, label_key, desc_key, speed in MODE_KEYS
    )
    mode_cards = "".join(
        f'<article data-mode-card="{esc(value)}"><strong>{esc(tx(env, label_key))}</strong><span>{esc(speed)}</span><p>{esc(tx(env, desc_key))}</p></article>'
        for value, label_key, desc_key, speed in MODE_KEYS
    )
    display_name = user.get("display_name") or user.get("username") or tx(env, "receiver_name")
    auth = current_auth(repo, env)
    receive_only = receive and services.truthy(cfg.get("allow_anonymous_by_code"), True) and ((not auth and services.truthy(cfg.get("require_login"), True)) or (auth and not has_permission(repo, env, "transfer_site", "can_create") and not services.truthy(cfg.get("allow_authenticated_without_permission"), False)))
    return f"""
<link rel="stylesheet" href="/transfer/assets/transfer.css?v=20260826-admin-tasks">
<section class="transfer-app" data-transfer-root data-lang="{esc(current_lang)}" data-room="{esc(room)}" data-receive="{"1" if receive else "0"}" data-receive-only="{"1" if receive_only else "0"}">
  <header class="transfer-hero">
    <div>
      <p class="transfer-kicker">{esc(tx(env, "tool"))}</p>
      <h1>{esc(tx(env, "title"))}</h1>
      <p>{esc(tx(env, "subtitle"))}</p>
    </div>
    <div class="transfer-side-status">
      <div class="transfer-language">{language_switch(current_lang)}</div>
      <div class="transfer-status {state_class}" aria-live="polite">
        <span>{esc(tx(env, "today_usage"))} {format_bytes(resources["usage"].get("daily_bytes", 0))}</span>
        <span data-task-usage>{esc(tx(env, "task_usage"))} 0 B</span>
      </div>
    </div>
  </header>
  <nav class="transfer-mode-tabs" aria-label="{esc(tx(env, "mode_label"))}">
    <button type="button" data-transfer-tab="send" class="is-active">{esc(tx(env, "send_tab"))}</button>
    <button type="button" data-transfer-tab="receive">{esc(tx(env, "receive_tab"))}</button>
  </nav>
  <div class="transfer-alerts" data-transfer-alerts>{"<ul>" + warnings + blockers + "</ul>" if warnings or blockers else ""}</div>
  <section class="transfer-grid">
    <div class="transfer-panel" data-panel="send">
      <div class="transfer-panel-head">
        <h2>{esc(tx(env, "send_title"))}</h2>
        <label class="transfer-mode-select"><span>{esc(tx(env, "mode_label"))}</span><select data-transfer-mode>{options}</select></label>
      </div>
      <div class="transfer-mode-note" data-mode-note></div>
      <div class="transfer-drop" data-transfer-drop>
        <strong>{esc(tx(env, "drop_title"))}</strong>
        <span>{esc(tx(env, "drop_hint"))}</span>
        <input type="file" multiple webkitdirectory data-transfer-folder hidden>
        <input type="file" multiple data-transfer-files hidden>
        <div class="transfer-drop-actions">
          <button type="button" data-pick-files>{esc(tx(env, "pick_files"))}</button>
          <button type="button" data-pick-folder>{esc(tx(env, "pick_folder"))}</button>
        </div>
      </div>
      <div class="transfer-room" data-transfer-room hidden>
        <div><span>{esc(tx(env, "share_link"))}</span><code data-room-link></code><button type="button" data-copy-link>{esc(tx(env, "copy"))}</button></div>
        <div><span>{esc(tx(env, "access_code"))}</span><strong data-room-code></strong></div>
        <p>{esc(tx(env, "share_hint"))}</p>
      </div>
      <div class="transfer-list" data-transfer-list></div>
      <div class="transfer-actions">
        <button type="button" data-create-session>{esc(tx(env, "create"))}</button>
        <button type="button" data-start-upload disabled>{esc(tx(env, "upload"))}</button>
        <button type="button" data-stop-session disabled>{esc(tx(env, "stop"))}</button>
      </div>
      <section class="transfer-mode-guide"><h3>{esc(tx(env, "mode_help_title"))}</h3><div>{mode_cards}</div></section>
    </div>
    <div class="transfer-panel" data-panel="receive">
      <div class="transfer-panel-head"><h2>{esc(tx(env, "receive_title"))}</h2><span>{esc(display_name)}</span></div>
      <p class="transfer-panel-note">{esc(tx(env, "receive_note"))}</p>
      <label class="transfer-field"><span>{esc(tx(env, "room_id"))}</span><input data-join-room value="{esc(room)}" placeholder="{esc(tx(env, "room_placeholder"))}"></label>
      <label class="transfer-field"><span>{esc(tx(env, "access_code"))}</span><input data-join-code placeholder="{esc(tx(env, "code_placeholder"))}"></label>
      <div class="transfer-actions">
        <button type="button" data-join-session>{esc(tx(env, "connect"))}</button>
        <button type="button" data-choose-directory>{esc(tx(env, "choose_dir"))}</button>
        <button type="button" data-download-all disabled>{esc(tx(env, "download_all"))}</button>
      </div>
      <div class="transfer-progress"><div><span data-progress-label>{esc(tx(env, "waiting"))}</span><span data-progress-percent>0%</span></div><progress max="100" value="0" data-progress-bar></progress></div>
      <div class="transfer-list" data-receive-list></div>
    </div>
  </section>
</section>
<script src="/transfer/assets/transfer.js?v=20260826-admin-tasks"></script>
"""


def task_row(row: dict[str, Any], env: dict[str, str]) -> str:
    room = esc(row.get("room_id") or "")
    status = esc(row.get("status") or "")
    requested = str(row.get("requested_mode") or "-")
    effective = str(row.get("effective_mode") or "-")
    mode = esc(requested if requested == effective else f"{requested} -> {effective}")
    object_count = int(row.get("object_count") or 0)
    ready_count = int(row.get("ready_count") or 0)
    files = f"{ready_count}/{object_count}" if object_count else "0"
    expected = row.get("total_bytes") or row.get("object_bytes") or 0
    transferred = row.get("transferred_bytes")
    progress = f"{format_bytes(transferred)} / {format_bytes(expected)}"
    traffic = format_bytes(row.get("traffic_counted_bytes"))
    storage = esc(str(row.get("storage_backends") or "-").replace(",", ", "))
    owner = esc(row.get("created_by") or "-")
    sender = row.get("sender_ip") or "-"
    receiver = row.get("receiver_ip") or "-"
    network = esc(f"S: {sender} / R: {receiver}")
    created_at = row.get("created_at") or "-"
    updated_at = row.get("updated_at") or "-"
    expires_at = row.get("expires_at") or "-"
    times = esc(f"Created: {created_at} | Updated: {updated_at} | Expires: {expires_at}")
    return (
        f'<tr><td><code>{room}</code></td>'
        f'<td><span class="transfer-admin-badge">{status}</span></td>'
        f'<td>{mode}</td>'
        f'<td>{files}</td>'
        f'<td>{progress}</td>'
        f'<td>{traffic}</td>'
        f'<td>{storage}</td>'
        f'<td><div class="transfer-admin-compact"><strong>{owner}</strong><span>{network}</span></div></td>'
        f'<td><span class="transfer-admin-time">{times}</span></td>'
        f'<td><div class="transfer-admin-action-set">'
        f'<button type="button" data-admin-stop="{room}">{esc(admin_tx(env, "stop"))}</button>'
        f'<button type="button" data-admin-delete="{room}">{esc(admin_tx(env, "delete"))}</button>'
        f'<button type="button" data-admin-destroy="{room}">{esc(admin_tx(env, "destroy"))}</button>'
        f'</div></td></tr>'
    )

def admin_page(repo: Any, env: dict[str, str]) -> str:
    cfg = services.control(repo)
    resources = services.resource_state(repo, env, cfg)
    sessions = services.admin_sessions(repo)[:80]
    current_lang = lang(env)
    rows = "".join(task_row(row, env) for row in sessions)
    fragment = f"""
<main class="transfer-admin" data-transfer-admin>
  <header class="transfer-admin-head">
    <div class="transfer-admin-language-corner"><div class="transfer-language">{admin_language_switch(current_lang)}</div></div>
    <div><p class="transfer-kicker">{esc(admin_tx(env, "kicker"))}</p><h1>{esc(admin_tx(env, "page_title"))}</h1><p>{esc(admin_tx(env, "subtitle"))}</p></div>
    <div class="transfer-admin-tools"><div data-transfer-admin-nav-slot>{admin_nav(env)}</div></div>
  </header>
  <section class="transfer-metrics">
    <article><span>{esc(admin_tx(env, "today"))}</span><strong>{format_bytes(resources["usage"].get("daily_bytes", 0))}</strong></article>
    <article><span>{esc(admin_tx(env, "week"))}</span><strong>{format_bytes(resources["usage"].get("weekly_bytes", 0))}</strong></article>
    <article><span>{esc(admin_tx(env, "month"))}</span><strong>{format_bytes(resources["usage"].get("monthly_bytes", 0))}</strong></article>
    <article><span>{esc(admin_tx(env, "free_disk"))}</span><strong>{resources["disk"].get("free_percent", 0)}%</strong></article>
    <article><span>{esc(admin_tx(env, "temp_storage"))}</span><strong>{format_bytes(resources["disk"].get("local_temp_used_bytes", 0))}</strong></article>
  </section>
  <form class="transfer-control-form" data-transfer-control-form method="post" action="/api/admin/transfer/control?lang={esc(current_lang)}">{control_fields(cfg, env)}<div class="transfer-admin-actions"><span class="transfer-admin-save-state" data-admin-save-state></span><button type="submit">{esc(admin_tx(env, "save"))}</button><button type="button" data-disable-feature>{esc(admin_tx(env, "disable"))}</button></div></form>
  <section class="transfer-table-panel"><div class="transfer-table-head"><h2>{esc(admin_tx(env, "live_tasks"))}</h2><p>{esc(admin_tx(env, "live_tasks_hint"))}</p></div><table class="transfer-table transfer-task-table"><thead><tr><th>{esc(admin_tx(env, "room"))}</th><th>{esc(admin_tx(env, "status"))}</th><th>{esc(admin_tx(env, "mode"))}</th><th>{esc(admin_tx(env, "task_files"))}</th><th>{esc(admin_tx(env, "progress"))}</th><th>{esc(admin_tx(env, "traffic"))}</th><th>{esc(admin_tx(env, "storage"))}</th><th>{esc(admin_tx(env, "owner"))}</th><th>{esc(admin_tx(env, "time"))}</th><th>{esc(admin_tx(env, "action"))}</th></tr></thead><tbody>{rows or f'<tr><td colspan="10">{esc(admin_tx(env, "no_tasks"))}</td></tr>'}</tbody></table></section>
</main>
<script>
const transferAdminLang = {current_lang!r};
const transferAdminSaveOk = {admin_tx(env, "save_success")!r};
const transferAdminSaveFailed = {admin_tx(env, "save_failed")!r};
const transferAdminDeleteConfirm = {admin_tx(env, "delete_confirm")!r};
const transferAdminDestroyConfirm = {admin_tx(env, "destroy_confirm")!r};
document.querySelector('[data-transfer-control-form]')?.addEventListener('submit', async (event) => {{
  event.preventDefault();
  const form = event.currentTarget;
  const state = document.querySelector('[data-admin-save-state]');
  if (state) state.textContent = '';
  try {{
    const response = await fetch(form.action, {{method:'POST', headers:{{'x-requested-with':'transfer-admin','accept':'application/json'}}, body:new FormData(form)}});
    const data = await response.json().catch(() => ({{ok:false}}));
    if (!response.ok || data.ok === false) throw new Error(data.message || transferAdminSaveFailed);
    if (state) state.textContent = transferAdminSaveOk;
    setTimeout(() => location.href = `/admin/transfer?lang=${{transferAdminLang}}&saved=1`, 350);
  }} catch (error) {{
    if (state) state.textContent = error.message || transferAdminSaveFailed;
  }}
}});
document.addEventListener('click', async (event) => {{
  const stop = event.target.closest('[data-admin-stop]');
  if (stop && confirm({admin_tx(env, "stop_confirm")!r})) {{ await fetch('/api/admin/transfer/sessions/' + stop.dataset.adminStop + '/stop', {{method:'POST'}}); location.reload(); }}
  const del = event.target.closest('[data-admin-delete]');
  if (del && confirm(transferAdminDeleteConfirm)) {{ await fetch('/api/admin/transfer/sessions/' + del.dataset.adminDelete + '/delete', {{method:'POST'}}); location.reload(); }}
  const destroy = event.target.closest('[data-admin-destroy]');
  if (destroy && confirm(transferAdminDestroyConfirm)) {{ await fetch('/api/admin/transfer/sessions/' + destroy.dataset.adminDestroy + '/destroy', {{method:'POST'}}); location.reload(); }}
  if (event.target.closest('[data-disable-feature]') && confirm({admin_tx(env, "disable_confirm")!r})) {{ await fetch('/api/admin/transfer/feature/disable', {{method:'POST'}}); location.reload(); }}
}});
</script>"""
    if str(env.get("TRANSFER_ADMIN_EMBED") or "") == "1":
        return fragment
    return f"""<!doctype html><html lang="{esc(current_lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(admin_tx(env, "page_title"))}</title><link rel="stylesheet" href="/transfer/assets/transfer.css?v=20260826-admin-tasks"></head><body>{fragment}</body></html>"""


def control_fields(cfg: dict[str, Any], env: dict[str, str]) -> str:
    groups = [
        ("Availability", [("enabled", "Feature enabled", "bool"), ("shutdown_policy", "Shutdown policy", "select:graceful,pause_active,immediate"), ("require_login", "Require login", "bool"), ("allow_authenticated_without_permission", "Signed-in users without role permission", "bool"), ("allow_anonymous_by_code", "Anonymous receiver by code", "bool")]),
        ("Routing", [("lan_acceleration_enabled", "LAN acceleration", "bool"), ("relay_enabled", "Server relay", "bool"), ("cloud_relay_enabled", "Cloud relay", "bool"), ("lan_only", "LAN only", "bool"), ("auto_fallback_enabled", "Auto fallback", "bool")]),
        ("Temporary Storage", [("temp_storage_enabled", "Temporary storage", "bool"), ("temp_storage_mode", "Storage mode", "select:none,local,cloud,local_and_cloud"), ("temp_expire_follow_code", "Expire with code", "bool"), ("temp_expire_minutes", "Temp expiry minutes", "number"), ("code_expire_minutes", "Code expiry minutes", "number")]),
        ("Bandwidth And Traffic", [("max_bandwidth_kbps", "Global KB/s", "number"), ("max_bandwidth_per_session_kbps", "Per task KB/s", "number"), ("daily_traffic_quota_gb", "Daily GB", "number"), ("weekly_traffic_quota_gb", "Weekly GB", "number"), ("monthly_traffic_quota_gb", "Monthly GB", "number"), ("yearly_traffic_quota_gb", "Yearly GB", "number")]),
        ("Disk Protection", [("disk_monitor_enabled", "Disk monitor", "bool"), ("min_free_disk_gb", "Min free GB", "number"), ("min_free_disk_percent", "Min free %", "number"), ("local_temp_total_quota_gb", "Local temp quota GB", "number"), ("local_temp_per_session_quota_gb", "Per task temp GB", "number"), ("warning_threshold_percent", "Warning %", "number"), ("critical_threshold_percent", "Critical %", "number")]),
    ]
    html = []
    for title, fields in groups:
        html.append(f"<fieldset><legend>{esc(admin_control_group(env, title))}</legend>{''.join(field_control(env, name, label, kind, cfg.get(name)) for name, label, kind in fields)}</fieldset>")
    return "".join(html)


def field_control(env: dict[str, str], name: str, label: str, kind: str, value: Any) -> str:
    help_html = f'<small>{esc(admin_control_help(env, name))}</small>'
    if kind == "bool":
        checked = " checked" if str(value) in {"1", "true", "True", "on"} else ""
        return f'<label class="transfer-admin-field transfer-admin-field-toggle"><span class="transfer-admin-toggle-line"><input type="hidden" name="{esc(name)}" value="0"><input type="checkbox" name="{esc(name)}" value="1"{checked}><span>{esc(admin_control_label(env, label))}</span></span>{help_html}</label>'
    if kind.startswith("select:"):
        choices = kind.split(":", 1)[1].split(",")
        opts = "".join(f'<option value="{esc(choice)}"{" selected" if str(value) == choice else ""}>{esc(admin_select_label(env, name, choice))}</option>' for choice in choices)
        return f'<label class="transfer-admin-field"><span>{esc(admin_control_label(env, label))}</span><select name="{esc(name)}">{opts}</select>{help_html}</label>'
    return f'<label class="transfer-admin-field"><span>{esc(admin_control_label(env, label))}</span><input type="number" name="{esc(name)}" value="{esc(value)}">{help_html}</label>'


def admin_nav(env: dict[str, str]) -> str:
    override = str(env.get("TRANSFER_ADMIN_NAV_HTML") or "").strip()
    if override:
        return override
    return f'<nav class="transfer-admin-nav"><a href="/admin">{esc(admin_tx(env, "admin"))}</a><a href="/admin/table/navigation_items">{esc(admin_tx(env, "navigation"))}</a><a href="/transfer">{esc(admin_tx(env, "open_transfer"))}</a></nav>'


def admin_language_switch(current: str) -> str:
    if current == "zh":
        return '<a href="/admin/transfer?lang=en">English</a><span>中文</span>'
    return '<span>English</span><a href="/admin/transfer?lang=zh">中文</a>'


def language_switch(current: str) -> str:
    if current == "zh":
        return '<a href="/transfer?lang=en">English</a><span>中文</span>'
    return '<span>English</span><a href="/transfer?lang=zh">中文</a>'


def format_bytes(value: Any) -> str:
    try:
        size = float(value or 0)
    except (TypeError, ValueError):
        size = 0
    units = ["B", "KB", "MB", "GB", "TB"]
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    if index == 0:
        return f"{int(size)} {units[index]}"
    return f"{size:.1f} {units[index]}"
