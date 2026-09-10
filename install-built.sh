#!/usr/bin/env bash
set -euo pipefail

VERSION=2026.09.10.2
NAME=academic-cms
BASE=${ACMS_BASE:-/opt/academic-cms-deploy}
CONF=${ACMS_CONF:-/etc/academic-cms-deploy}
SERVICE=${ACMS_SERVICE:-academic-cms}
REPO=${ACMS_REPO:-https://github.com/biao169/$(printf 'web%s' '-teacher').git}
BRANCH=${ACMS_BRANCH:-web-vue-nuxt-built}
NODE_VERSION=${NODE_VERSION:-24.19.0}
PNPM_VERSION=${PNPM_VERSION:-11.19.0}
PORT=${PORT:-8005}

APP=$BASE/app
RUNTIME=$BASE/runtime
CHECKOUT=$BASE/checkout
TMP=$BASE/tmp
BACKUPS=$BASE/backups
ENV_FILE=$APP/.env
STATE_FILE=$CONF/install.env
UNIT=/etc/systemd/system/$SERVICE.service

log(){ printf '[%s] %s\n' "$NAME" "$*"; }
die(){ printf '[%s] 失败: %s\n' "$NAME" "$*" >&2; exit 1; }
need_root(){ [[ ${EUID:-$(id -u)} -eq 0 ]] || exec sudo bash "$0" "$@"; }
ask(){ local p=$1 d=$2 v; read -r -p "$p [$d]: " v; printf '%s' "${v:-$d}"; }
secret(){ node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))'; }
confirm(){ local p=$1 v; read -r -p "$p 输入 YES 确认: " v; [[ $v == YES ]] || die '已取消'; }

safe_rm(){
  local p=$1
  [[ -n $p && ( $p == "$BASE" || $p == "$BASE"/* || $p == "$CONF" || $p == "$CONF"/* || $p == "$UNIT" ) ]] || die "拒绝删除越界路径: $p"
  rm -rf -- "$p"
}

legacy_rm(){
  local p=$1 old
  old=$(printf 'web%s' '-teacher')
  [[ $p == "/opt/$old/checkout" || $p == "/opt/$old/runtime" || $p == "/etc/systemd/system/$old.service" || $p == /etc/systemd/system/academic-teacher.service || $p == /etc/systemd/system/academic-transfer.service ]] || die "拒绝删除旧路径: $p"
  rm -rf -- "$p"
}

load_state(){
  [[ -f $STATE_FILE ]] || return 0
  # shellcheck disable=SC1090
  . "$STATE_FILE"
}

save_state(){
  mkdir -p "$CONF"
  cat > "$STATE_FILE" <<EOF
REPO='$REPO'
BRANCH='$BRANCH'
PORT='$PORT'
SITE_URL='${SITE_URL:-}'
COMMIT='${COMMIT:-}'
VERSION='$VERSION'
EOF
  chmod 600 "$STATE_FILE"
}

repair_var_dirs(){
  mkdir -p /var/lib/apt/lists/partial /var/cache/apt/archives/partial /var/log /var/tmp
  chmod 1777 /var/tmp
  mkdir -p /var/lib/dpkg/{updates,info,parts,triggers,alternatives}
  touch /var/lib/dpkg/status /var/lib/dpkg/available
}

cleanup_previous_attempts(){
  log '清理上次失败安装的临时记录'
  local old
  old=$(printf 'web%s' '-teacher')
  systemctl stop "$SERVICE.service" 2>/dev/null || true
  systemctl stop "$old.service" academic-teacher.service academic-transfer.service 2>/dev/null || true
  systemctl disable "$old.service" academic-teacher.service academic-transfer.service 2>/dev/null || true
  legacy_rm "/etc/systemd/system/$old.service" 2>/dev/null || true
  legacy_rm /etc/systemd/system/academic-teacher.service 2>/dev/null || true
  legacy_rm /etc/systemd/system/academic-transfer.service 2>/dev/null || true
  safe_rm "$CHECKOUT" 2>/dev/null || true
  safe_rm "$TMP" 2>/dev/null || true
  legacy_rm "/opt/$old/checkout" 2>/dev/null || true
  legacy_rm "/opt/$old/runtime" 2>/dev/null || true
  mkdir -p "$TMP"
}

system_deps(){
  repair_var_dirs
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git rsync xz-utils build-essential python3
}

node_runtime(){
  export PATH="$RUNTIME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  if [[ -x $RUNTIME/bin/node ]] && "$RUNTIME/bin/node" -e "let [a,b]=process.versions.node.split('.').map(Number);process.exit(a===24&&b>=19?0:1)" 2>/dev/null; then
    return
  fi
  mkdir -p "$TMP"
  local work=$TMP/node-install
  safe_rm "$work" 2>/dev/null || true
  safe_rm "$RUNTIME.new" 2>/dev/null || true
  mkdir -p "$work" "$RUNTIME.new"
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) die "不支持架构: $(uname -m)" ;;
  esac
  curl -fL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$arch.tar.xz" -o "$work/node.tar.xz"
  tar -tJf "$work/node.tar.xz" >/dev/null
  tar -xJf "$work/node.tar.xz" -C "$RUNTIME.new" --strip-components=1
  safe_rm "$RUNTIME" 2>/dev/null || true
  mv "$RUNTIME.new" "$RUNTIME"
  "$RUNTIME/bin/npm" install -g --prefix "$RUNTIME" "pnpm@$PNPM_VERSION"
}

fetch_code(){
  safe_rm "$CHECKOUT" 2>/dev/null || true
  git clone --single-branch --branch "$BRANCH" "$REPO" "$CHECKOUT"
  COMMIT=$(git -C "$CHECKOUT" rev-parse HEAD)
}

copy_code(){
  mkdir -p "$APP"
  rsync -a --delete \
    --exclude=.git --exclude=node_modules --exclude=.nuxt --exclude=.env \
    --exclude=data --exclude=media \
    "$CHECKOUT/" "$APP/"
  [[ -f $APP/.output/server/index.mjs ]] || die '缺少预构建产物 .output/server/index.mjs'
}

write_env(){
  [[ -f $ENV_FILE ]] && . "$ENV_FILE"
  local auth boot media
  auth=${NUXT_AUTH_SECRET:-$(secret)}
  boot=${NUXT_AUTH_BOOTSTRAP_TOKEN:-$(secret)}
  media=${NUXT_MEDIA_GRANT_SECRET:-$(secret)}
  cat > "$ENV_FILE" <<EOF
CMS_DATABASE_PATH=data/site.sqlite3
NUXT_PUBLIC_SITE_NAME=Academic CMS
NUXT_PUBLIC_SITE_URL=$SITE_URL
NUXT_AUTH_SECRET=$auth
NUXT_AUTH_BOOTSTRAP_TOKEN=$boot
NUXT_AUTH_TRUSTED_ORIGINS=$SITE_URL
NUXT_AUTH_SECURE_COOKIES=true
NUXT_MEDIA_GRANT_SECRET=$media
NUXT_MEDIA_ROUTE_BASE=/media
NUXT_MEDIA_ROOT=media
NUXT_STATIC_MEDIA_ROOT=public
NUXT_CACHE_ORIGIN=$SITE_URL
EOF
  chmod 600 "$ENV_FILE"
}

app_env(){
  export PATH="$RUNTIME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

app_deps(){ cd "$APP"; pnpm install --prod --frozen-lockfile --child-concurrency=1 --network-concurrency=1; }
db_migrate(){ cd "$APP"; app_env; pnpm run db:migrate:sqlite; }

bootstrap_admin(){
  cd "$APP"; app_env
  [[ -n ${ADMIN_USER:-} && -n ${ADMIN_PASS:-} ]] || return 0
  CMS_BOOTSTRAP_USERNAME="$ADMIN_USER" \
  CMS_BOOTSTRAP_PASSWORD="$ADMIN_PASS" \
  CMS_BOOTSTRAP_DISPLAY_NAME="$ADMIN_USER" \
  pnpm exec tsx scripts/auth/bootstrap-admin.ts || true
  sed -i '/^NUXT_AUTH_BOOTSTRAP_TOKEN=/d' "$ENV_FILE"
}

unit(){
  cat > "$UNIT" <<EOF
[Unit]
Description=Academic CMS
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=$PORT
ExecStart=$RUNTIME/bin/node $APP/.output/server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE.service"
}

install_all(){
  cleanup_previous_attempts
  REPO=$(ask 'Git 仓库地址' "$REPO"); BRANCH=$(ask 'Git 分支' "$BRANCH")
  SITE_URL=$(ask '网站 HTTPS 地址' 'https://example.com')
  ADMIN_USER=$(ask '后台管理员账号' 'admin')
  read -r -s -p '后台管理员密码: ' ADMIN_PASS; echo
  PORT=$(ask '教师服务回环端口' "$PORT")
  system_deps; node_runtime; fetch_code; copy_code; write_env; app_deps; db_migrate; bootstrap_admin; unit; save_state
  systemctl restart "$SERVICE.service"
  log "完成: http://127.0.0.1:$PORT"
}

backup_state(){
  mkdir -p "$BACKUPS"
  local stamp=$BACKUPS/$(date +%Y%m%d-%H%M%S)
  mkdir -p "$stamp"
  [[ -d $APP/data ]] && cp -a "$APP/data" "$stamp/data"
  [[ -d $APP/media ]] && cp -a "$APP/media" "$stamp/media"
  [[ -f $ENV_FILE ]] && cp -a "$ENV_FILE" "$stamp/env"
  log "备份: $stamp"
}

update_code(){ load_state; fetch_code; copy_code; save_state; systemctl restart "$SERVICE.service"; }
update_deps(){ load_state; node_runtime; app_deps; systemctl restart "$SERVICE.service"; }
update_db(){ load_state; db_migrate; systemctl restart "$SERVICE.service"; }
update_service(){ load_state; unit; systemctl restart "$SERVICE.service"; }
update_all(){ load_state; backup_state; node_runtime; fetch_code; copy_code; app_deps; db_migrate; unit; save_state; systemctl restart "$SERVICE.service"; }

delete_cache(){ safe_rm "$TMP"; safe_rm "$CHECKOUT"; mkdir -p "$TMP"; }
delete_deps(){ safe_rm "$APP/node_modules"; safe_rm "$RUNTIME"; }
delete_db(){ confirm "将删除数据库 $APP/data"; backup_state; safe_rm "$APP/data"; }
delete_media(){ confirm "将删除媒体 $APP/media"; backup_state; safe_rm "$APP/media"; }
purge(){ confirm "将完全删除 $BASE、$CONF 和 $SERVICE.service"; systemctl stop "$SERVICE.service" 2>/dev/null || true; systemctl disable "$SERVICE.service" 2>/dev/null || true; safe_rm "$UNIT"; safe_rm "$BASE"; safe_rm "$CONF"; systemctl daemon-reload; }

status(){ systemctl --no-pager status "$SERVICE.service" || true; }
logs(){ journalctl -u "$SERVICE.service" -n 120 --no-pager || true; }
version(){ load_state; printf 'script=%s\nservice=%s\nbase=%s\nbranch=%s\ncommit=%s\nport=%s\n' "$VERSION" "$SERVICE" "$BASE" "${BRANCH:-}" "${COMMIT:-}" "${PORT:-}"; }

menu(){
  load_state
  printf '\n1 安装/重装  2 更新全部  3 更新代码  4 更新依赖  5 更新数据库  6 更新服务\n'
  printf '7 启动  8 停止  9 重启  10 状态  11 日志  12 版本\n'
  printf '13 删缓存  14 删依赖  15 删数据库  16 删媒体  17 完全删除  0 退出\n'
  read -r -p '请选择: ' n
  case $n in
    1) install_all;; 2) update_all;; 3) update_code;; 4) update_deps;; 5) update_db;; 6) update_service;;
    7) systemctl start "$SERVICE.service";; 8) systemctl stop "$SERVICE.service";; 9) systemctl restart "$SERVICE.service";;
    10) status;; 11) logs;; 12) version;; 13) delete_cache;; 14) delete_deps;; 15) delete_db;; 16) delete_media;; 17) purge;; 0) exit 0;;
    *) die '无效选项';;
  esac
}

main(){
  need_root "$@"
  mkdir -p "$BASE" "$CONF"
  export TMPDIR=$TMP
  case ${1:-auto} in
    auto) [[ -f $STATE_FILE || -d $APP ]] && menu || install_all;;
    install) install_all;; menu) menu;;
    update|update-all|full) update_all;; update-code|code) update_code;; update-deps|deps) update_deps;; update-db|db) update_db;; update-service|service) update_service;;
    start) systemctl start "$SERVICE.service";; stop) systemctl stop "$SERVICE.service";; restart) systemctl restart "$SERVICE.service";;
    status) status;; logs) logs;; version) version;;
    clean|delete-cache) delete_cache;; delete-deps) delete_deps;; delete-db) delete_db;; delete-media) delete_media;; purge) purge;;
    *) echo '用法: install-built.sh [install|menu|update|update-code|update-deps|update-db|update-service|start|stop|restart|status|logs|version|clean|delete-deps|delete-db|delete-media|purge]'; exit 2;;
  esac
}

main "$@"
