#!/usr/bin/env bash
# Production manager; intentionally separate from either application.
set -Eeuo pipefail
umask 077
BASE=/opt/academic-suite
APP=$BASE/app
CONF=/etc/academic-suite
USER_NAME=academic-suite
export PATH=/opt/academic-suite/runtime/bin:/usr/local/bin:/usr/bin:/bin
SELF=$(readlink -f "${BASH_SOURCE[0]}")
die() { echo "[失败] $*" >&2; exit 1; }
ask() { local reply; read -r -p "$1 [$2]: " reply; printf -v "$3" '%s' "${reply:-$2}"; }
confirm() { local reply; read -r -p "$1 输入 YES 确认: " reply; [[ $reply == YES ]] || die '已取消，未继续操作。'; }
trap 'echo "[失败] 第 $LINENO 行。服务可能已停机；请用 Tweb status/logs 排查，或 restore 恢复备份。" >&2' ERR
require_root() { [[ $EUID == 0 ]] || die '请使用 sudo bash Tweb.sh'; }
platform() {
  [[ -f /etc/os-release ]] || die '缺少 os-release';
  . /etc/os-release
  [[ $ID == ubuntu || $ID == debian ]] || die '仅支持 Ubuntu / Debian';
  [[ -d /run/systemd/system ]] || die '生产部署需要 systemd（不支持普通容器/未启用 systemd 的 WSL）';
}
inspect() {
  echo '=== 系统、网络与 VPN 只读检测 ==='
  uname -srm; df -h /opt; free -h
  command -v node >/dev/null && node --version || true
  command -v pnpm >/dev/null && pnpm --version || true
  if command -v ip >/dev/null; then ip -brief address; ip route show default; ip rule show; fi
  command -v ss >/dev/null && ss -lnt || true
  systemctl list-units --type=service --state=running --no-pager | grep -Ei 'wireguard|wg-quick|openvpn|tailscale|zerotier|xray|sing-box|clash' || true
  for var in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
    [[ -z ${!var:-} ]] || echo "$var 已设置（隐藏地址和凭据）"
  done
  echo '不读取 VPN 私钥、不修改路由/防火墙。网卡计数≠供应商账单；日/月额度及物理出口须在快传后台人工核验。'
}
prerequisites() {
  for cmd in git rsync curl xz openssl gcc make g++ python3 useradd; do
    command -v "$cmd" >/dev/null || die "缺少 $cmd；可先从菜单选择安装依赖。"
  done
  command -v node >/dev/null || die '请先安装依赖';
  node -e 'let [a,b]=process.versions.node.split(".").map(Number);if(a!==24||b<19)process.exit(1)' || die '需要 Node >=24.19.0 <25'
  [[ $(pnpm --version) == 11.19.0 ]] || die '需要 pnpm 11.19.0'
}
toolchain() {
  confirm '将 apt 安装系统依赖，并在专用目录安装 Node 24.19.0 / pnpm 11.19.0，不替换系统 Node。'
  apt-get update
  apt-get install -y ca-certificates curl git rsync xz-utils build-essential python3 openssl iproute2 util-linux passwd
  local arch temp archive
  case $(uname -m) in x86_64) arch=x64;; aarch64) arch=arm64;; *) die '仅提供 x64 / arm64 自动安装';; esac
  temp=$(mktemp -d "$BASE/node-download.XXXXXX")
  archive=node-v24.19.0-linux-$arch.tar.xz
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 "https://nodejs.org/dist/v24.19.0/$archive" -o "$temp/$archive"
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 https://nodejs.org/dist/v24.19.0/SHASUMS256.txt -o "$temp/SHASUMS256.txt"
  (cd "$temp"; grep "  $archive$" SHASUMS256.txt | sha256sum --check --strict)
  [[ ! -e $BASE/runtime ]] || mv "$BASE/runtime" "$BASE/runtime-before-$(date +%s)"
  mkdir -p "$BASE/runtime"
  tar -xJf "$temp/$archive" -C "$BASE/runtime" --strip-components=1
  "$BASE/runtime/bin/npm" install --global --prefix "$BASE/runtime" pnpm@11.19.0
  chmod -R a+rX "$BASE/runtime"
  prerequisites
}
load_config() {
  [[ -f $CONF/settings.sh ]] || die '尚未安装，请先 install'
  [[ $(stat -c %u "$CONF/settings.sh") == 0 ]] || die '配置必须属于 root'
  . "$CONF/settings.sh"
  [[ $TRANSFER == true || $TRANSFER == false ]] || die '快传开关非法'
  [[ $PORT =~ ^[0-9]+$ && $PORT -ge 1024 && $PORT -le 65535 && $PORT != 8787 ]] || die '端口非法'
}
save_config() {
  local temp=$CONF/settings.sh.new
  printf 'REPO=%q\nBRANCH=%q\nTRANSFER=%q\nPORT=%q\nORIGIN=%q\n' "$REPO" "$BRANCH" "$TRANSFER" "$PORT" "$ORIGIN" > "$temp"
  chmod 600 "$temp"; mv "$temp" "$CONF/settings.sh"
}
as_app() { runuser -u "$USER_NAME" -- env PATH="$PATH" "$@"; }
cms() { (cd "$APP/academic-cms"; as_app node --env-file="$CONF/site.env" "$@"); }
ft() { (cd "$APP/file-transfer"; as_app node "$@"); }
stop_services() {
  local unit
  for unit in academic-teacher.service academic-transfer.service; do
    if [[ $(systemctl show "$unit" -p LoadState --value) != not-found ]]; then systemctl stop "$unit"; fi
  done
}
backup_stopped() {
  local dest=$BASE/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$
  local needed available
  needed=$(du -sk "$APP" | cut -f1); available=$(df -Pk "$BASE" | awk 'NR==2 {print $4}')
  (( available > needed + 1048576 )) || die '完整备份可用空间不足（需现有目录大小外加1GiB）'
  mkdir -p "$dest"; chmod 700 "$dest"
  # Cold, complete snapshot includes matching code, dependencies, uploads and both databases.
  cp -a --reflink=auto "$APP" "$dest/app"
  cp -a "$CONF" "$dest/config"
  printf '%s\n' "$dest" > "$BASE/last-backup"
  echo "[备份] $dest（含密钥，勿公开）"
}
backup() { load_config; confirm '将暂停两个服务制作完整备份（需要足够磁盘空间）'; stop_services; backup_stopped; start_services; }
check_checkout() {
  local root=$1
  [[ -f $root/academic-cms/nuxt.config.ts && -f $root/file-transfer/package.json ]] || die '仓库根目录必须包含 academic-cms/ 与 file-transfer/'
  # Never import committed runtime/private state, links or Git hooks into production.
  [[ -z $(find "$root/academic-cms" "$root/file-transfer" -type l -print -quit) ]] || die '源码中存在符号链接，拒绝部署'
  local bad
  bad=$(find "$root/academic-cms" "$root/file-transfer" -type f \( \( -name '.env*' ! -name '.env.example' \) -o -name 'config.local.json' -o -name '*.sqlite*' -o -name '*.db' -o -name '*.pkcs8' -o -name '*.pem' \) -print -quit)
  [[ -z $bad ]] || die '仓库包含私有配置、密钥或数据库，请移除后提交'
}
checkout_source() {
  git check-ref-format --branch "$BRANCH" >/dev/null || die 'Git 分支名非法'
  [[ $REPO == https://* || $REPO == git@* || $REPO == ssh://* ]] || die '仓库仅接受 HTTPS 或 SSH 地址'
  [[ $REPO != https://*@* ]] || die '不要在 URL 内嵌密码/token，请预先配置 Git 凭据或 SSH'
  STAGE=$(mktemp -d "$BASE/checkout.XXXXXX")
  git clone --depth 1 --single-branch --branch "$BRANCH" -- "$REPO" "$STAGE/repo"
  check_checkout "$STAGE/repo"
  echo "[Git] $(git -C "$STAGE/repo" rev-parse HEAD)"
}
copy_source() {
  mkdir -p "$APP/academic-cms" "$APP/file-transfer"
  local component
  for component in academic-cms file-transfer; do
    # --delete only applies to these exact code roots; protected state is excluded on both sides.
    rsync -a --delete --exclude=node_modules --exclude=.nuxt --exclude=.output --exclude=.git \
      --exclude=/data/ --exclude=/media/ --exclude=/storage/ --exclude='/.env*' --exclude=/config.local.json \
      --exclude=reports --exclude=.cache --exclude=.tmp \
      "$STAGE/repo/$component/" "$APP/$component/"
  done
  git -C "$STAGE/repo" rev-parse HEAD > "$APP/REVISION"
  chown -R "$USER_NAME:$USER_NAME" "$APP"
}
install_dependencies() {
  (cd "$APP/academic-cms"; as_app pnpm install --frozen-lockfile)
  (cd "$APP/file-transfer"; as_app pnpm install --frozen-lockfile)
}
refresh_manager() {
  if [[ -n ${STAGE:-} && -f $STAGE/repo/Tweb.sh ]]; then
    bash -n "$STAGE/repo/Tweb.sh"
    install -m 755 "$STAGE/repo/Tweb.sh" "$BASE/Tweb.sh"
    install_shortcut
  fi
}
install_shortcut() {
  if [[ -L /usr/local/bin/Tweb && $(readlink /usr/local/bin/Tweb) == "$BASE/Tweb.sh" ]]; then return; fi
  [[ ! -e /usr/local/bin/Tweb && ! -L /usr/local/bin/Tweb ]] || die 'Tweb 已被其他程序占用，拒绝覆盖'
  ln -s "$BASE/Tweb.sh" /usr/local/bin/Tweb
}
configure_env() {
  [[ ! -e $CONF/site.env ]] || return 0
  local auth media bootstrap
  auth=$(openssl rand -hex 32); media=$(openssl rand -hex 32); bootstrap=$(openssl rand -hex 32)
  printf '%s\n' "NODE_ENV=production" "CMS_DATABASE_PATH=$APP/academic-cms/data/site.sqlite3" \
    "NUXT_AUTH_SECRET=$auth" "NUXT_MEDIA_GRANT_SECRET=$media" "NUXT_AUTH_BOOTSTRAP_TOKEN=$bootstrap" \
    "NUXT_AUTH_TRUSTED_ORIGINS=$ORIGIN" 'NUXT_AUTH_SECURE_COOKIES=true' 'NUXT_AUTH_TRUSTED_PROXY_HOPS=1' \
    "NUXT_PUBLIC_SITE_URL=$ORIGIN" "NUXT_CACHE_ORIGIN=$ORIGIN" \
    "NUXT_MEDIA_ROOT=$APP/academic-cms/media" 'NITRO_HOST=127.0.0.1' "NITRO_PORT=$PORT" \
    "FT_TEACHER_MODULE_ENABLED=$TRANSFER" > "$CONF/site.env"
  chown root:"$USER_NAME" "$CONF/site.env"; chmod 640 "$CONF/site.env"
}
set_transfer_env() {
  sed -i "s/^FT_TEACHER_MODULE_ENABLED=.*/FT_TEACHER_MODULE_ENABLED=$TRANSFER/" "$CONF/site.env"
  chown root:"$USER_NAME" "$CONF/site.env"; chmod 640 "$CONF/site.env"
}
migrate() {
  cms scripts/db/migrate.mjs
  if [[ $TRANSFER == true ]]; then
    ft scripts/maintenance.mjs unlock-stale
    ft scripts/initialize-bridge.mjs
  fi
}
build() {
  if [[ $TRANSFER == true ]]; then ft scripts/integrate-teacher.mjs apply "$APP/academic-cms"; fi
  cms scripts/build-target.mjs ubuntu
}
units() {
  cat > /etc/systemd/system/academic-teacher.service <<EOF
[Unit]
Description=Academic teacher website (academic-suite managed)
After=network.target
StartLimitIntervalSec=120
StartLimitBurst=5
[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$APP/academic-cms
EnvironmentFile=$CONF/site.env
Environment=PATH=$PATH
ExecStart=$BASE/teacher-start.sh
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
KillMode=control-group
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
[Install]
WantedBy=multi-user.target
EOF
  cat > "$BASE/teacher-start.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ \${FT_TEACHER_MODULE_ENABLED:-false} == true ]]; then
  exec $(command -v node) $APP/file-transfer/scripts/teacher.mjs start $APP/academic-cms
else
  exec $(command -v node) $APP/academic-cms/scripts/run-built-target.mjs start-ubuntu
fi
EOF
  chmod 755 "$BASE/teacher-start.sh"
  cat > /etc/systemd/system/academic-transfer.service <<EOF
[Unit]
Description=Academic file transfer (academic-suite managed)
After=network.target
StartLimitIntervalSec=120
StartLimitBurst=5
[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$APP/file-transfer
Environment=PATH=$PATH
ExecStartPre=$(command -v node) $APP/file-transfer/scripts/maintenance.mjs unlock-stale
ExecStart=$(command -v node) $APP/file-transfer/scripts/start.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
KillMode=control-group
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=full
[Install]
WantedBy=multi-user.target
EOF
  systemd-analyze verify /etc/systemd/system/academic-teacher.service /etc/systemd/system/academic-transfer.service
  systemctl daemon-reload
  systemctl enable academic-teacher.service
  if [[ $TRANSFER == true ]]; then systemctl enable academic-transfer.service; else systemctl disable academic-transfer.service; fi
}
start_services() {
  if [[ $TRANSFER == true ]]; then systemctl start academic-transfer.service; else systemctl stop academic-transfer.service; fi
  systemctl start academic-teacher.service
  local ready=false
  for ((i=0;i<60;i++)); do
    if curl --fail --silent --max-time 3 "http://127.0.0.1:$PORT/zh" >/dev/null; then ready=true; break; fi
    sleep 1
  done
  [[ $ready == true ]] || die '教师网站健康检查失败；请查看日志或恢复备份'
  if [[ $TRANSFER == true ]]; then
    ft scripts/health.mjs
    curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:$PORT/transfer-api/v1/capabilities" | \
      node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let b=JSON.parse(s);if(b.protocolVersion!==1||b.identityBridgeAvailable!==true)process.exit(1)})'
  fi
  echo "[就绪] 本机 127.0.0.1:$PORT；公网访问须配置 HTTPS 反向代理：$ORIGIN"
}
bootstrap() {
  local username password again result uid
  ask '首位高级管理员登录名（3–64位，字母开头，支持字母/数字/._-）' admin username
  username=${username,,}
  [[ $username =~ ^[a-z][a-z0-9._-]{2,63}$ ]] || die '登录名格式不符合网站规则，可重新运行 Tweb bootstrap'
  read -r -s -p '管理员密码（至少6位，不写入配置文件）: ' password; echo
  [[ ${#password} -ge 6 ]] || die '密码至少6位'
  read -r -s -p '再次输入密码: ' again; echo
  [[ $password == "$again" ]] || die '两次密码不一致；可重新运行 Tweb bootstrap'
  result=$(export CMS_BOOTSTRAP_USERNAME=$username CMS_BOOTSTRAP_PASSWORD=$password
    cms --import tsx scripts/auth/bootstrap-admin.ts)
  uid=$(printf '%s' "$result" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const b=JSON.parse(s);if(b.status!=="created"||!b.user.uid)process.exit(1);process.stdout.write(b.user.uid)})')
  unset password again
  sed -i '/^NUXT_AUTH_BOOTSTRAP_TOKEN=/d' "$CONF/site.env"
  chmod 640 "$CONF/site.env"
  echo "高级管理员创建成功：$username；账号 UID：$uid"
  if [[ $TRANSFER == true ]]; then
    local grant_now
    ask '同时授予此账号快传管理权限？true/false' true grant_now
    if [[ $grant_now == true ]]; then ft scripts/manage-admin.mjs grant "$uid"; fi
  fi
  echo "教师登录：$ORIGIN/zh/login；后台：$ORIGIN/admin；快传后台：$ORIGIN/transfer-admin/"
}
install_site() {
  [[ ! -e $APP && ! -e $CONF/settings.sh ]] || die '已有安装/未完成安装，请使用更新或重装；不会覆盖成新站'
  if ! (prerequisites) >/dev/null 2>&1; then toolchain; fi
  inspect
  [[ ! -e /usr/local/bin/Tweb && ! -L /usr/local/bin/Tweb ]] || die 'Tweb 已存在，拒绝覆盖'
  for name in academic-teacher academic-transfer; do
    [[ $(systemctl show "$name.service" -p LoadState --value) == not-found ]] || die "$name.service 已存在，拒绝覆盖其他部署"
  done
  ask 'Git 仓库地址（请先将本包根目录上传到你的仓库）' 'https://github.com/biao169/web-teacher.git' REPO
  ask 'Git 分支' web-vue BRANCH
  ask '启用文件快传？true/false' false TRANSFER
  [[ $TRANSFER == true || $TRANSFER == false ]] || die '请输入 true 或 false'
  ask '教师服务回环端口' 8005 PORT
  [[ $PORT =~ ^[0-9]+$ && $PORT -ge 1024 && $PORT -le 65535 && $PORT != 8787 ]] || die '端口应为1024–65535且不能为8787'
  ask '网站 HTTPS 源地址，例如 https://lab.example.com（不带末尾 /）' '' ORIGIN
  [[ $ORIGIN =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || die '请输入合法 HTTPS 源地址'
  node - "$PORT" "$TRANSFER" <<'JS'
const net=require('node:net');
for(const port of [Number(process.argv[2]),...(process.argv[3]==='true'?[8787]:[])]){
 const s=net.createServer();s.on('error',()=>{console.error('端口已占用: '+port);process.exitCode=1});s.listen(port,'127.0.0.1',()=>s.close());
}
JS
  checkout_source
  confirm '将安装专用账号、systemd 服务和快捷命令；不会自动修改 Nginx/VPN/防火墙。'
  if id "$USER_NAME" >/dev/null 2>&1; then die '专用账号已存在，拒绝接管'; fi
  useradd --system --home-dir "$BASE/service-home" --create-home --shell /usr/sbin/nologin "$USER_NAME"
  chmod 755 "$BASE"; mkdir -p "$CONF"; chown root:"$USER_NAME" "$CONF"; chmod 750 "$CONF"
  save_config; copy_source; configure_env
  install -m 755 "$SELF" "$BASE/Tweb.sh"
  install_shortcut
  install_dependencies; migrate; build; units
  echo '数据库已建立，不注入任何演示数据。'
  bootstrap; start_services
}
update_site() {
  local mode=$1; load_config; prerequisites
  if [[ $mode == source && $TRANSFER == true ]]; then die '快传启动含自动数据库迁移；启用快传时请选择完整更新'; fi
  if [[ $mode != database && $mode != rebuild ]]; then
    ask 'Git 分支（保留当前选择或输入新分支）' "$BRANCH" BRANCH
    checkout_source
  fi
  confirm "$mode 将停机备份；保留全部配置/上传/数据。失败后保持停机，不自动运行不兼容的数据。"
  stop_services; backup_stopped
  if [[ $mode != database && $mode != rebuild ]]; then copy_source; save_config; fi
  if [[ $mode != database ]]; then install_dependencies; fi
  if [[ $mode == source ]]; then
    local plan
    plan=$(cms scripts/db/migrate.mjs --plan)
    printf '%s' "$plan" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(JSON.parse(s).pending.length){console.error("存在待执行迁移，请选择完整更新或恢复备份");process.exit(1)}})'
    # Transfer schema may migrate on startup. Do not silently migrate it in source-only mode.
  else migrate; fi
  if [[ $mode != database ]]; then build; fi
  units; start_services; refresh_manager
}
restore() {
  load_config
  find "$BASE/backups" -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
  local name snapshot retired
  ask '输入上方备份目录名' '' name
  [[ $name =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || die '备份名非法'
  snapshot=$BASE/backups/$name
  [[ -d $snapshot/app && -f $snapshot/config/settings.sh ]] || die '备份不完整'
  confirm '将整体恢复匹配的源码、数据库、密钥及配置。备份后的新增数据会从在线站点撤回，但保留在 retired 中。恢复后必须复核 VPN 额度。'
  stop_services
  retired=$BASE/retired-$(date +%s)-$$; mkdir "$retired"
  mv "$APP" "$retired/app"; mv "$CONF" "$retired/config"
  cp -a "$snapshot/app" "$APP"; cp -a "$snapshot/config" "$CONF"
  load_config; prerequisites; units
  echo "恢复完成，原状态保留在 $retired。尚未启动；请核对快传额度后执行 Tweb start。"
}
toggle() {
  load_config; confirm '切换快传将停机备份、重建教师站，不删除快传数据。'
  stop_services; backup_stopped
  if [[ $TRANSFER == true ]]; then TRANSFER=false; else TRANSFER=true; fi
  save_config; set_transfer_env; migrate; build; units; start_services
}
nginx_example() {
  load_config
  cat <<EOF
# 合并到您已有 HTTPS server 段，不要重复监听 443；证书使用原站配置。
location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_request_buffering off;
    proxy_buffering off;
    client_max_body_size 128m;
}
# /transfer-api/ 仍经过教师身份桥；绝不能直接代理到 8787。
# 使用 nginx -t 验证后 reload；本工具不自动修改您现有配置。
EOF
}
main() {
  if [[ ${1:-} == --help ]]; then
    echo '用法: Tweb [menu|install|deps|inspect|source|database|full|rebuild|backup|restore|toggle|bootstrap|grant|start|stop|status|logs|nginx]'; return
  fi
  if [[ $EUID != 0 ]]; then exec sudo bash "$SELF" "$@"; fi
  require_root; platform
  local inherited
  for inherited in "${!CMS_@}" "${!NUXT_@}" "${!FT_@}" "${!NITRO_@}"; do
    [[ -z $inherited ]] || unset "$inherited"
  done
  unset NODE_ENV NODE_OPTIONS
  mkdir -p "$BASE" "$BASE/backups"
  exec 9>"$BASE/manager.lock"; flock -n 9 || die '另一个管理操作正在执行'
  local action=${1:-menu}
  if [[ $action == menu ]]; then
    printf '%s\n' '1 首次安装  2 仅源码更新  3 仅数据库迁移  4 完整更新' \
      '5 保留数据重装/重建  6 备份  7 恢复  8 启停快传组件' \
      '9 状态  10 日志  11 网络/VPN检测  12 安装依赖' \
      '13 启动  14 停止  15 创建首位管理员  16 快传管理员授权' \
      '17 Nginx配置示例  0 退出（操作完成后重新 Tweb 进入）'
    read -r -p '请选择: ' action
    case $action in 1) action=install;;2) action=source;;3) action=database;;4) action=full;;5) action=rebuild;;6) action=backup;;7) action=restore;;8) action=toggle;;9) action=status;;10) action=logs;;11) action=inspect;;12) action=deps;;13) action=start;;14) action=stop;;15) action=bootstrap;;16) action=grant;;17) action=nginx;;0) return;;*) die '无效选项';;esac
  fi
  case $action in
    install) install_site;; deps) toolchain;; inspect) inspect;;
    source|database|full|rebuild) update_site "$action";;
    backup) backup;; restore) restore;; toggle) toggle;;
    start) load_config; start_services;; stop) load_config; stop_services;;
    status) systemctl --no-pager status academic-teacher.service academic-transfer.service;;
    logs) journalctl -u academic-teacher.service -u academic-transfer.service -n 100 --no-pager;;
    bootstrap) load_config; bootstrap;;
    grant) load_config; local uid; ask '教师账号 UID' '' uid; ft scripts/manage-admin.mjs grant "$uid";;
    nginx) nginx_example;; *) die '未知命令，使用 --help';;
  esac
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
