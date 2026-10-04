#!/usr/bin/env bash
# Ubuntu/Debian bootstrap. Execute only from your own reviewed GitHub branch.
# Default repository: biao169/web-teacher, branch web-py. Replace the domain below.
# bash install.sh --domain example.org
# --python selects an existing Python >=3.12; never replaces /usr/bin/python3.
set -Eeuo pipefail
repo='https://github.com/biao169/web-teacher.git' branch='web-py' domain='' allowed_domains='' python='/usr/bin/python3' port='' pip_source='tuna'
usage() {
  printf '%s\n' 'Usage: install.sh --domain example.org [--allowed-domains lab.example.org,other.example.org] [--repo https://github.com/biao169/web-teacher.git] [--branch web-py] [--python /path/to/python3.12] [--port 8003] [--pip-source tuna|pypi]' \
    'Installs git, ca-certificates, python3, python3-venv, procps; then installs the single teacher website service.' \
    'Existing installation: choose repair or confirmed clean reinstall.' \
    '--domain also configures /robots.txt and /sitemap.xml automatically / 域名同时用于自动生成爬虫规则与站点地图。'
}
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0;;
    --repo|--branch|--domain|--allowed-domains|--python|--port|--pip-source)
      if (($# < 2)); then usage; exit 2; fi
      case "$1" in --repo) repo=$2;; --branch) branch=$2;; --domain) domain=$2;; --allowed-domains) allowed_domains=$2;; --python) python=$2;; --port) port=$2;; --pip-source) pip_source=$2;; esac
      shift 2;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2;;
  esac
done
# Use one HTTPS package index. Never disable TLS verification or combine indexes.
[[ $pip_source == tuna || $pip_source == pypi ]] || { printf 'Invalid pip source / 无效依赖源\n' >&2; exit 2; }
# --port is the private application port, not the public HTTPS port.
# Interactive installs allow typing a value; unattended installs default to 8003.
if [[ -z $port ]]; then
  if [[ -t 0 ]]; then read -r -p '应用端口 / Application port [8003]: ' port; fi
  port=${port:-8003}
fi
[[ $port =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1024 && 10#$port <= 65535)) || { printf '端口须为 1024–65535 / Port must be 1024–65535\n' >&2; exit 2; }
port=$((10#$port))
[[ $repo =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { usage; exit 2; }
[[ $branch =~ ^[A-Za-z0-9][A-Za-z0-9_./-]*$ && $branch != *..* ]] || { printf 'Invalid branch\n' >&2; exit 2; }
[[ $domain =~ ^[a-z0-9.-]+$ && $domain == *.* ]] || { printf 'Invalid domain\n' >&2; exit 2; }
((EUID == 0)) || { printf 'Run using sudo bash install.sh ...\n' >&2; exit 1; }
[[ -d /run/systemd/system ]] || { printf 'A running systemd host is required.\n' >&2; exit 1; }
# Distribution ID is a system-owned file, not an imported website configuration.
. /etc/os-release
[[ $ID == ubuntu || $ID == debian ]] || { printf 'Only Ubuntu/Debian is supported.\n' >&2; exit 1; }
apt-get update
apt-get install -y --no-install-recommends git ca-certificates python3 python3-venv procps
"$python" -c 'import sys; assert sys.version_info >= (3,12), "Python 3.12+ required: provide --python /path/to/python3.12 with venv support"'
# Temporary download always gets cleaned; run manager as a child so the trap runs.
work=$(mktemp -d /tmp/teacher-install.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null clone --depth 1 --single-branch --branch "$branch" -- "$repo" "$work/source"
[[ -f "$work/source/deploy/linux/tweb.py" && ! -L "$work/source/deploy/linux/tweb.py" ]] || { printf 'Missing deployment manager\n' >&2; exit 1; }
# stdin remains the terminal for the administrator password; do not use curl | bash.
"$python" "$work/source/deploy/linux/tweb.py" install --repo "$repo" --branch "$branch" --domain "$domain" --allowed-domains "$allowed_domains" --python "$python" --port "$port" --pip-source "$pip_source"
