#!/usr/bin/env bash
# One-click Ubuntu/Debian deployment script for the teacher research website.
# It installs system dependencies, clones/updates the public GitHub repo,
# creates a Python virtual environment, initializes the SQLite database,
# configures systemd autostart, configures Caddy or Nginx reverse proxy, and installs
# a small `web-teacher` management command for daily maintenance.

set -Eeuo pipefail

APP_NAME="web-teacher"
SERVICE_NAME="web-teacher"
REPO_URL_DEFAULT="https://github.com/biao169/web-teacher.git"
INSTALL_DIR_DEFAULT="/srv/web-teacher"
ENV_DIR="/etc/web-teacher"
ENV_FILE="${ENV_DIR}/web-teacher.env"
NGINX_SITE="/etc/nginx/sites-available/web-teacher"
NGINX_ENABLED="/etc/nginx/sites-enabled/web-teacher"
MANAGER_BIN="/usr/local/bin/web-teacher"
APP_USER="www-data"
APP_GROUP="www-data"
DEFAULT_PORT="8000"

# Print consistent status messages.
log() { printf '\033[1;32m[web-teacher]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warning]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# Run commands as root. The script can be launched by root or by a sudo user.
SUDO=""
if [ "${EUID}" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || fail "Please run as root or install sudo."
  SUDO="sudo"
fi

ask() {
  # ask "Prompt" "default" -> prints chosen value.
  local prompt="$1" default_value="$2" answer
  read -r -p "${prompt} [${default_value}]: " answer || true
  printf '%s' "${answer:-$default_value}"
}

server_ip() {
  # Prefer public IP; fall back to first local address if outbound lookup fails.
  local ip=""
  if command -v curl >/dev/null 2>&1; then
    ip="$(curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true)"
  fi
  if [ -z "$ip" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  printf '%s' "${ip:-127.0.0.1}"
}

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || fail "Port must be a number."
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail "Port must be between 1 and 65535."
}

validate_domain_hint() {
  # Domain/IP validation is advisory only. It warns but never blocks deployment.
  local host="$1" ip="$2"
  [ -n "$host" ] || return 0
  if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    return 0
  fi
  if command -v getent >/dev/null 2>&1; then
    local resolved
    resolved="$(getent ahostsv4 "$host" | awk '{print $1}' | sort -u | paste -sd, - || true)"
    if [ -z "$resolved" ]; then
      warn "Domain ${host} does not resolve yet. Nginx will still be configured."
    elif ! printf '%s' "$resolved" | grep -q "${ip}"; then
      warn "Domain ${host} resolves to ${resolved}, not detected server IP ${ip}. Continuing anyway."
    else
      log "Domain ${host} resolves to this server IP (${ip})."
    fi
  else
    warn "Cannot validate domain because getent is unavailable. Continuing."
  fi
}

confirm_phrase() {
  # confirm_phrase "Prompt" "PHRASE" returns success only when PHRASE is typed exactly.
  local prompt="$1" phrase="$2" answer
  warn "$prompt"
  read -r -p "Type '${phrase}' to continue: " answer || true
  [ "$answer" = "$phrase" ]
}

path_exists_root() {
  $SUDO test -e "$1"
}

handle_existing_install() {
  # Existing services, config files, or runtime data are preserved by default.
  # Destructive modes require explicit confirmation.
  local install_dir="$1" mode="keep"
  local found=0
  if path_exists_root "$install_dir" || path_exists_root "$ENV_FILE" || path_exists_root "/etc/systemd/system/${SERVICE_NAME}.service" || path_exists_root "$NGINX_SITE"; then
    found=1
  fi
  [ "$found" -eq 1 ] || return 0

  warn "Existing web-teacher files or service configuration were detected."
  echo "  1) keep    - keep database/media/env, update code and service config (recommended)"
  echo "  2) reset   - keep code/env, delete website database/media/cache/export data"
  echo "  3) replace - remove old install dir, env, service and nginx config, then reinstall"
  read -r -p "Choose install mode [keep/reset/replace] (default: keep): " mode || true
  mode="${mode:-keep}"
  case "$mode" in
    keep)
      log "Keeping existing runtime data and configuration."
      ;;
    reset)
      if confirm_phrase "This will delete database, uploaded media, exports, cache and i18n dictionary under ${install_dir}." "RESET WEB-TEACHER DATA"; then
        $SUDO systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        $SUDO rm -rf "${install_dir}/data" "${install_dir}/media" "${install_dir}/exports" "${install_dir}/.cache" "${install_dir}/i18n_dictionary.json"
        log "Runtime data removed. It will be recreated during installation."
      else
        fail "Reset cancelled."
      fi
      ;;
    replace)
      if confirm_phrase "This will delete ${install_dir}, ${ENV_FILE}, systemd service and Nginx site config." "REPLACE WEB-TEACHER"; then
        $SUDO systemctl stop "$SERVICE_NAME" 2>/dev/null || true
        $SUDO systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        $SUDO rm -rf "$install_dir" "$ENV_FILE" "$ENV_DIR" "/etc/systemd/system/${SERVICE_NAME}.service" "$NGINX_SITE" "$NGINX_ENABLED"
        $SUDO systemctl daemon-reload
        log "Old installation removed. A fresh installation will continue."
      else
        fail "Replace cancelled."
      fi
      ;;
    *)
      fail "Unknown install mode: ${mode}"
      ;;
  esac
}

select_python() {
  # Prefer Python 3.12+. Debian 12 commonly ships Python 3.11, which is accepted with a warning.
  if command -v python3.12 >/dev/null 2>&1; then
    printf 'python3.12'
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    local version
    version="$(python3 - <<'PY'
import sys
print(f"{sys.version_info.major}.{sys.version_info.minor}")
PY
)"
    case "$version" in
      3.12|3.13|3.14|3.15) printf 'python3'; return 0 ;;
      3.11) warn "Python 3.11 detected. Continuing for Debian compatibility; Python 3.12+ is still preferred."; printf 'python3'; return 0 ;;
    esac
    fail "Python ${version} detected. Please install Python 3.11+ (Python 3.12+ preferred) and rerun."
  fi
  fail "Python 3 was not found."
}

write_env_file() {
  local site_url="$1" port="$2" install_dir="$3" secret="$4"
  $SUDO mkdir -p "$ENV_DIR"
  $SUDO tee "$ENV_FILE" >/dev/null <<EOF
# Managed by ${MANAGER_BIN} / deploy/ubuntu/install.sh
# Private values live here. Do not commit this file.

# Public canonical URL of the website. Used for redirects, sitemap links and security checks.
SITE_URL=${site_url}

# Optional external media/CDN base URL. Leave empty when /media/... is served by this same website.
PUBLIC_MEDIA_BASE_URL=

# Require a strong production auth secret. Keep enabled on public servers.
TEACHER_SITE_REQUIRE_AUTH_SECRET=1

# Session signing secret. Generated automatically by the installer.
TEACHER_SITE_AUTH_SECRET=${secret}

# SQLite database path for Ubuntu/Debian deployment.
TEACHER_SITE_DB=${install_dir}/data/site.sqlite3

# Writable runtime media directory. Admin uploads and rich-text media are saved here.
TEACHER_SITE_MEDIA=${install_dir}/media

# Read-only packaged static directory. /assets and default public/media files are served from here.
TEACHER_SITE_PUBLIC=${install_dir}/public
WEB_TEACHER_HOST=127.0.0.1
WEB_TEACHER_PORT=${port}
WEB_TEACHER_INSTALL_DIR=${install_dir}
EOF
  $SUDO chmod 600 "$ENV_FILE"
}

write_systemd_service() {
  local install_dir="$1" port="$2"
  $SUDO tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=Teacher Research Website
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_GROUP}
WorkingDirectory=${install_dir}
EnvironmentFile=${ENV_FILE}
ExecStart=${install_dir}/.venv/bin/uvicorn app.adapters.ubuntu.main:app --host 127.0.0.1 --port ${port}
Restart=always
RestartSec=3
TimeoutStopSec=20

# Basic hardening. Writable paths are explicitly listed below.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${install_dir}/data ${install_dir}/media ${install_dir}/exports ${install_dir}/.cache ${install_dir}/i18n_dictionary.json

[Install]
WantedBy=multi-user.target
EOF
}

write_nginx_site() {
  local server_name="$1" port="$2"
  $SUDO tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    server_name ${server_name};

    client_max_body_size 50m;

    # Static and media responses are served by the Python app so Ubuntu behavior
    # matches the Cloudflare Worker routing model.
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
EOF
  $SUDO ln -sfn "$NGINX_SITE" "$NGINX_ENABLED"
}

show_nginx_failure_help() {
  warn "Nginx failed to start or reload. The Python website service may still be running behind 127.0.0.1."
  echo
  echo "Useful diagnostics:"
  echo "  sudo systemctl status nginx --no-pager"
  echo "  sudo journalctl -xeu nginx.service --no-pager | tail -n 80"
  echo "  sudo ss -ltnp | grep -E ':(80|443) '"
  echo
  warn "Most common cause: public port 80 or 443 is already used by apache2, caddy, another nginx process, or a cloud panel. Keep one public reverse proxy and point it to the private website port."
  echo
  $SUDO systemctl status nginx --no-pager 2>/dev/null || true
  echo
  if command -v ss >/dev/null 2>&1; then
    echo "Public port listeners:"
    $SUDO ss -ltnp 2>/dev/null | grep -E ':(80|443) ' || true
  fi
}

start_or_reload_nginx() {
  ensure_nginx_installed
  # Nginx syntax can be valid while the service still fails to start, often due to public port conflicts.
  $SUDO nginx -t
  $SUDO systemctl enable nginx >/dev/null 2>&1 || true
  if $SUDO systemctl is-active --quiet nginx; then
    $SUDO systemctl reload nginx || { show_nginx_failure_help; return 1; }
  else
    $SUDO systemctl start nginx || { show_nginx_failure_help; return 1; }
  fi
}

public_port_listeners() {
  if command -v ss >/dev/null 2>&1; then
    $SUDO ss -ltnp 2>/dev/null | grep -E ':(80|443) ' || true
  fi
}

public_port_listener_summary() {
  public_port_listeners | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//'
}

public_proxy_mode() {
  local listeners
  listeners="$(public_port_listener_summary)"
  if [ -z "$listeners" ]; then
    printf 'nginx'
  elif printf '%s' "$listeners" | grep -qi 'caddy'; then
    printf 'caddy'
  else
    printf 'manual'
  fi
}

install_system_packages() {
  local proxy_mode="$1"
  $SUDO apt-get update
  if [ "$proxy_mode" = "nginx" ]; then
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y git nginx curl ca-certificates openssl python3 python3-venv python3-pip
  else
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y git curl ca-certificates openssl python3 python3-venv python3-pip
  fi
}

ensure_nginx_installed() {
  if ! command -v nginx >/dev/null 2>&1; then
    warn "Nginx was not installed earlier because public ports were occupied. Installing it now for the requested fallback."
    $SUDO apt-get update
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y nginx
  fi
}

caddy_site_address() {
  local server_name="$1"
  if [[ "$server_name" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf 'http://%s' "$server_name"
  else
    printf '%s' "$server_name"
  fi
}

ensure_caddy_sites_import() {
  local caddyfile="/etc/caddy/Caddyfile"
  $SUDO mkdir -p /etc/caddy/sites
  if ! $SUDO test -f "$caddyfile"; then
    echo 'import /etc/caddy/sites/*.caddy' | $SUDO tee "$caddyfile" >/dev/null
    return 0
  fi
  if ! $SUDO grep -Eq '^[[:space:]]*import[[:space:]]+/etc/caddy/sites/\*\.caddy[[:space:]]*$' "$caddyfile"; then
    echo | $SUDO tee -a "$caddyfile" >/dev/null
    echo 'import /etc/caddy/sites/*.caddy' | $SUDO tee -a "$caddyfile" >/dev/null
  fi
}

write_caddy_site() {
  local server_name="$1" port="$2" address
  address="$(caddy_site_address "$server_name")"
  ensure_caddy_sites_import
  $SUDO tee /etc/caddy/sites/web-teacher.caddy >/dev/null <<EOF
# Managed by web-teacher deploy script.
# Caddy owns public 80/443; the Python app listens privately on 127.0.0.1:${port}.
${address} {
    encode gzip
    reverse_proxy 127.0.0.1:${port}
}
EOF
}

show_proxy_examples() {
  local server_name="$1" port="$2" address
  address="$(caddy_site_address "$server_name")"
  cat <<EOF

Caddy example (/etc/caddy/sites/web-teacher.caddy):
${address} {
    encode gzip
    reverse_proxy 127.0.0.1:${port}
}

If /etc/caddy/Caddyfile does not import site snippets, add this line:
import /etc/caddy/sites/*.caddy

Nginx example if public ports are released:
server {
    listen 80;
    server_name ${server_name};
    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF
}

configure_caddy_proxy() {
  local server_name="$1" port="$2" answer
  warn "Caddy is already using public port 80 or 443. It is usually best to let Caddy remain the HTTPS reverse proxy."
  read -r -p "Create /etc/caddy/sites/web-teacher.caddy and reload Caddy now? [Y/n]: " answer || true
  answer="${answer:-Y}"
  case "$answer" in
    Y|y|yes|YES)
      write_caddy_site "$server_name" "$port"
      if $SUDO caddy validate --config /etc/caddy/Caddyfile; then
        $SUDO systemctl reload caddy || $SUDO systemctl restart caddy
        log "Caddy proxy configured at /etc/caddy/sites/web-teacher.caddy"
        return 0
      fi
      warn "Caddy validation failed. Please inspect /etc/caddy/Caddyfile and /etc/caddy/sites/web-teacher.caddy."
      return 1
      ;;
    *)
      show_proxy_examples "$server_name" "$port"
      warn "Skipped public reverse proxy configuration. The private app should still be reachable at http://127.0.0.1:${port} on the server."
      return 0
      ;;
  esac
}

configure_public_proxy() {
  local server_name="$1" port="$2" proxy_mode="$3" listeners answer
  listeners="$(public_port_listener_summary)"
  if [ -n "$listeners" ]; then
    echo "Public ports 80/443 are currently used by: $listeners"
  fi
  case "$proxy_mode" in
    caddy)
      configure_caddy_proxy "$server_name" "$port"
      ;;
    manual)
      warn "Public port 80 or 443 is already used by another application. Nginx cannot bind to it safely."
      read -r -p "Skip Nginx setup and show reverse-proxy examples? [Y/n]: " answer || true
      answer="${answer:-Y}"
      case "$answer" in
        Y|y|yes|YES)
          show_proxy_examples "$server_name" "$port"
          return 0
          ;;
        *)
          warn "Trying Nginx anyway. It will fail unless the other service releases public ports 80/443."
          write_nginx_site "$server_name" "$port"
          start_or_reload_nginx
          ;;
      esac
      ;;
    *)
      write_nginx_site "$server_name" "$port"
      start_or_reload_nginx
      ;;
  esac
}

write_manager_command() {
  # The management command gives the user memorable keywords after deployment.
  $SUDO tee "$MANAGER_BIN" >/dev/null <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
SERVICE="web-teacher"
ENV_FILE="/etc/web-teacher/web-teacher.env"
INSTALL_DIR="/srv/web-teacher"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
  INSTALL_DIR="${WEB_TEACHER_INSTALL_DIR:-$INSTALL_DIR}"
fi
case "${1:-help}" in
  start) sudo systemctl start "$SERVICE" ;;
  stop) sudo systemctl stop "$SERVICE" ;;
  restart) sudo systemctl restart "$SERVICE" ;;
  reload) sudo systemctl daemon-reload; sudo systemctl reload nginx 2>/dev/null || true; sudo systemctl reload caddy 2>/dev/null || true; sudo systemctl restart "$SERVICE" ;;
  status) systemctl status "$SERVICE" --no-pager ;;
  logs) journalctl -u "$SERVICE" -f ;;
  nginx-test)
    sudo nginx -t || true
    sudo systemctl status nginx --no-pager || true
    sudo ss -ltnp | grep -E ':(80|443) ' || true
    ;;
  caddy-example)
    port="${WEB_TEACHER_PORT:-8000}"
    host="${SITE_URL:-http://example.com}"
    host="${host#http://}"
    host="${host#https://}"
    host="${host%%/*}"
    if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      address="http://${host}"
    else
      address="$host"
    fi
    cat <<CADDY
/etc/caddy/sites/web-teacher.caddy example:

${address} {
    encode gzip
    reverse_proxy 127.0.0.1:${port}
}

If /etc/caddy/Caddyfile does not import site snippets, add:
import /etc/caddy/sites/*.caddy
CADDY
    ;;
  paths)
    echo "Install dir:  $INSTALL_DIR"
    echo "Env file:     $ENV_FILE"
    echo "Database:     ${TEACHER_SITE_DB:-$INSTALL_DIR/data/site.sqlite3}"
    echo "Media dir:    ${TEACHER_SITE_MEDIA:-$INSTALL_DIR/media}"
    echo "Exports dir:  $INSTALL_DIR/exports"
    echo "Nginx site:   /etc/nginx/sites-available/web-teacher"
    echo "Caddy site:   /etc/caddy/sites/web-teacher.caddy"
    echo "Service:      /etc/systemd/system/web-teacher.service"
    ;;
  update)
    cd "$INSTALL_DIR"
    sudo git -C "$INSTALL_DIR" pull --ff-only
    sudo "$INSTALL_DIR/.venv/bin/python" -m pip install -r "$INSTALL_DIR/requirements.txt"
    (cd "$INSTALL_DIR" && sudo "$INSTALL_DIR/.venv/bin/python" -m tools.init_db --db "${TEACHER_SITE_DB:-$INSTALL_DIR/data/site.sqlite3}")
    sudo mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/exports" "$INSTALL_DIR/.cache"
    sudo touch "$INSTALL_DIR/i18n_dictionary.json"
    sudo chown -R www-data:www-data "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/exports" "$INSTALL_DIR/.cache" "$INSTALL_DIR/i18n_dictionary.json"
    sudo systemctl restart "$SERVICE"
    ;;
  backup)
    cd "$INSTALL_DIR"
    sudo mkdir -p exports
    ts="$(date +%Y%m%d-%H%M%S)"
    sudo tar -czf "exports/web-teacher-backup-${ts}.tar.gz" data media i18n_dictionary.json 2>/dev/null || sudo tar -czf "exports/web-teacher-backup-${ts}.tar.gz" data media
    echo "Backup written to $INSTALL_DIR/exports/web-teacher-backup-${ts}.tar.gz"
    ;;
  reset-data)
    echo "This will delete database, uploaded media, exports, cache and i18n dictionary under: $INSTALL_DIR"
    read -r -p "Type 'RESET WEB-TEACHER DATA' to continue: " answer
    [ "$answer" = "RESET WEB-TEACHER DATA" ] || { echo "Cancelled."; exit 1; }
    sudo systemctl stop "$SERVICE" 2>/dev/null || true
    sudo rm -rf "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/exports" "$INSTALL_DIR/.cache" "$INSTALL_DIR/i18n_dictionary.json"
    sudo mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/exports" "$INSTALL_DIR/.cache"
    sudo touch "$INSTALL_DIR/i18n_dictionary.json"
    (cd "$INSTALL_DIR" && sudo "$INSTALL_DIR/.venv/bin/python" -m tools.init_db --db "${TEACHER_SITE_DB:-$INSTALL_DIR/data/site.sqlite3}")
    sudo chown -R www-data:www-data "$INSTALL_DIR/data" "$INSTALL_DIR/media" "$INSTALL_DIR/exports" "$INSTALL_DIR/.cache" "$INSTALL_DIR/i18n_dictionary.json"
    sudo systemctl start "$SERVICE"
    echo "Runtime data reset. Visit /admin/setup to initialize the administrator again."
    ;;
  uninstall)
    echo "This will remove service, proxy config, environment file and install directory: $INSTALL_DIR"
    read -r -p "Type 'UNINSTALL WEB-TEACHER' to continue: " answer
    [ "$answer" = "UNINSTALL WEB-TEACHER" ] || { echo "Cancelled."; exit 1; }
    sudo systemctl stop "$SERVICE" 2>/dev/null || true
    sudo systemctl disable "$SERVICE" 2>/dev/null || true
    sudo rm -rf "$INSTALL_DIR" "$ENV_FILE" /etc/web-teacher /etc/systemd/system/web-teacher.service /etc/nginx/sites-available/web-teacher /etc/nginx/sites-enabled/web-teacher /etc/caddy/sites/web-teacher.caddy
    sudo systemctl daemon-reload
    sudo systemctl reload nginx 2>/dev/null || true
    sudo systemctl reload caddy 2>/dev/null || true
    echo "web-teacher was uninstalled. Remove /usr/local/bin/web-teacher manually if you no longer need this command."
    ;;
  shell)
    cd "$INSTALL_DIR"
    exec bash
    ;;
  help|*)
    cat <<HELP
Usage: web-teacher <command>

Commands:
  start       Start the website service
  stop        Stop the website service
  restart     Restart the website service
  reload      Reload systemd/proxy and restart website
  status      Show service status
  logs        Follow service logs
  nginx-test  Test Nginx configuration and public port listeners
  caddy-example  Show a Caddy reverse-proxy example for this site
  paths       Show important file paths
  update      Pull latest code, install deps, apply DB defaults, restart
  backup      Create a local tar.gz backup under exports/
  reset-data  Delete runtime data and reinitialize an empty database
  uninstall   Remove service, proxy config, env file and install directory
  shell       Open a shell in the install directory
HELP
    ;;
esac
EOF
  $SUDO chmod +x "$MANAGER_BIN"
}

main() {
  log "Teacher website Ubuntu/Debian one-click deployment"

  local detected_ip domain_or_ip app_port install_dir repo_url site_url server_name secret python_bin proxy_mode
  detected_ip="$(server_ip)"
  domain_or_ip="$(ask 'Enter domain name. Leave empty to use detected server IP' "$detected_ip")"
  app_port="$(ask 'Enter internal application listen port' "$DEFAULT_PORT")"
  install_dir="$(ask 'Enter installation directory' "$INSTALL_DIR_DEFAULT")"
  repo_url="$(ask 'Enter Git repository URL' "$REPO_URL_DEFAULT")"
  validate_port "$app_port"
  validate_domain_hint "$domain_or_ip" "$detected_ip"
  handle_existing_install "$install_dir"

  if [[ "$domain_or_ip" =~ ^https?:// ]]; then
    site_url="$domain_or_ip"
    server_name="$(printf '%s' "$domain_or_ip" | sed -E 's#^https?://##; s#/.*$##')"
  else
    site_url="http://${domain_or_ip}"
    server_name="$domain_or_ip"
  fi

  proxy_mode="$(public_proxy_mode)"
  if [ "$proxy_mode" = "nginx" ]; then
    log "Public ports 80/443 are free; installing Nginx reverse proxy"
  elif [ "$proxy_mode" = "caddy" ]; then
    log "Detected Caddy on public ports; Nginx will not be installed"
  else
    log "Detected another public reverse proxy; Nginx will not be installed by default"
  fi
  install_system_packages "$proxy_mode"
  python_bin="$(select_python)"

  log "Downloading/updating code in ${install_dir}"
  if [ -d "${install_dir}/.git" ]; then
    $SUDO git -C "$install_dir" fetch --all --prune
    $SUDO git -C "$install_dir" pull --ff-only
  else
    $SUDO mkdir -p "$(dirname "$install_dir")"
    $SUDO git clone "$repo_url" "$install_dir"
  fi

  log "Creating Python virtual environment"
  $SUDO "$python_bin" -m venv "${install_dir}/.venv"
  $SUDO "${install_dir}/.venv/bin/python" -m pip install --upgrade pip
  $SUDO "${install_dir}/.venv/bin/python" -m pip install -r "${install_dir}/requirements.txt"

  log "Preparing runtime directories and secret"
  secret=""
  if $SUDO test -f "$ENV_FILE"; then
    secret="$($SUDO sed -n 's/^TEACHER_SITE_AUTH_SECRET=//p' "$ENV_FILE" | head -n 1)"
  fi
  if [ -z "$secret" ]; then
    secret="$($SUDO openssl rand -base64 48 | tr -d '\n')"
  fi
  write_env_file "$site_url" "$app_port" "$install_dir" "$secret"
  $SUDO mkdir -p "${install_dir}/data" "${install_dir}/media" "${install_dir}/exports" "${install_dir}/.cache"
  $SUDO touch "${install_dir}/i18n_dictionary.json"

  log "Initializing database with baseline system settings"
  (cd "$install_dir" && $SUDO env "TEACHER_SITE_DB=${install_dir}/data/site.sqlite3" "${install_dir}/.venv/bin/python" -m tools.init_db --db "${install_dir}/data/site.sqlite3")

  log "Configuring runtime file ownership"
  # Keep source code root-owned/read-only; only runtime data paths are writable by the service user.
  $SUDO chown -R "${APP_USER}:${APP_GROUP}" "${install_dir}/data" "${install_dir}/media" "${install_dir}/exports" "${install_dir}/.cache" "${install_dir}/i18n_dictionary.json"
  $SUDO chmod 755 "$install_dir"

  log "Installing systemd service"
  write_systemd_service "$install_dir" "$app_port"
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now "$SERVICE_NAME"

  log "Configuring public reverse proxy"
  configure_public_proxy "$server_name" "$app_port" "$proxy_mode"

  log "Installing management command: ${MANAGER_BIN}"
  write_manager_command

  log "Deployment completed"
  echo
  echo "Website URL:      ${site_url}"
  echo "Admin setup URL:  ${site_url}/admin/setup"
  echo "Install dir:      ${install_dir}"
  echo "Env file:         ${ENV_FILE}"
  echo "Manager command:  web-teacher status | logs | restart | paths | update | backup | reset-data"
  echo
  warn "If you later enable HTTPS with certbot, update SITE_URL in ${ENV_FILE} to https://... and run: web-teacher restart"
}

main "$@"

