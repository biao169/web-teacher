#!/usr/bin/env bash
set -euo pipefail

BASE=${BASE:-/opt/web-teacher}
REPO=${REPO:-https://github.com/biao169/web-teacher.git}
BRANCH=${BRANCH:-web-vue-nuxt-built}
NODE_VERSION=${NODE_VERSION:-24.19.0}
PNPM_VERSION=${PNPM_VERSION:-11.19.0}
PORT=${PORT:-8005}

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

read -r -p "网站 HTTPS 地址，例如 https://vip.moglider.com: " SITE_URL
read -r -p "后台管理员账号 [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}
read -r -s -p "后台管理员密码: " ADMIN_PASS; echo
read -r -p "教师服务回环端口 [$PORT]: " PORT_INPUT
PORT=${PORT_INPUT:-$PORT}

apt-get update
apt-get install -y ca-certificates curl git rsync xz-utils build-essential python3

mkdir -p "$BASE/runtime" "$BASE/app"
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) echo "不支持架构: $(uname -m)" >&2; exit 1 ;;
esac

if [[ ! -x "$BASE/runtime/bin/node" ]]; then
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  curl -fL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz" -o "$TMP/node.tar.xz"
  tar -xJf "$TMP/node.tar.xz" -C "$BASE/runtime" --strip-components=1
  "$BASE/runtime/bin/npm" install -g --prefix "$BASE/runtime" "pnpm@$PNPM_VERSION"
fi

export PATH="$BASE/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

rm -rf "$BASE/checkout"
git clone --single-branch --branch "$BRANCH" "$REPO" "$BASE/checkout"
rsync -a --delete \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=.nuxt \
  --exclude=.env \
  --exclude=data \
  "$BASE/checkout/" "$BASE/app/"

cd "$BASE/app"
[[ -f .output/server/index.mjs ]] || { echo "缺少 .output/server/index.mjs；请确认使用 $BRANCH 分支。" >&2; exit 1; }

AUTH_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
BOOTSTRAP_TOKEN=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')
MEDIA_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')

cat > .env <<EOF
CMS_DATABASE_PATH=data/site.sqlite3
NUXT_PUBLIC_SITE_NAME=Academic CMS
NUXT_PUBLIC_SITE_URL=$SITE_URL
NUXT_AUTH_SECRET=$AUTH_SECRET
NUXT_AUTH_BOOTSTRAP_TOKEN=$BOOTSTRAP_TOKEN
NUXT_AUTH_TRUSTED_ORIGINS=$SITE_URL
NUXT_AUTH_SECURE_COOKIES=true
NUXT_MEDIA_GRANT_SECRET=$MEDIA_SECRET
NUXT_MEDIA_ROUTE_BASE=/media
NUXT_MEDIA_ROOT=media
NUXT_STATIC_MEDIA_ROOT=public
NUXT_CACHE_ORIGIN=$SITE_URL
EOF

set -a
. ./.env
set +a

pnpm install --prod --frozen-lockfile --child-concurrency=1 --network-concurrency=1
pnpm run db:migrate:sqlite

CMS_BOOTSTRAP_USERNAME="$ADMIN_USER" \
CMS_BOOTSTRAP_PASSWORD="$ADMIN_PASS" \
CMS_BOOTSTRAP_DISPLAY_NAME="$ADMIN_USER" \
pnpm exec tsx scripts/auth/bootstrap-admin.ts || true

sed -i '/^NUXT_AUTH_BOOTSTRAP_TOKEN=/d' .env

cat > /etc/systemd/system/web-teacher.service <<EOF
[Unit]
Description=Prebuilt Nuxt Teacher Website
After=network.target

[Service]
Type=simple
WorkingDirectory=$BASE/app
EnvironmentFile=$BASE/app/.env
Environment=NODE_ENV=production
Environment=NITRO_HOST=127.0.0.1
Environment=NITRO_PORT=$PORT
ExecStart=$BASE/runtime/bin/node $BASE/app/.output/server/index.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now web-teacher.service
systemctl --no-pager status web-teacher.service || true
echo "完成：网站监听 http://127.0.0.1:$PORT"
