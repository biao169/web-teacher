#!/usr/bin/env bash
# Ubuntu/Debian bootstrap. Execute only from your own reviewed GitHub branch.
# Default repository: biao169/web-teacher, branch web-py. Replace the domain below.
# bash install-multi.sh --domain example.org
# --python selects an existing Python >=3.12; never replaces /usr/bin/python3.
set -Eeuo pipefail
repo='https://github.com/biao169/web-teacher.git' branch='web-py' domain='' allowed_origins='' python='/usr/bin/python3' port='' pip_source='tuna' instance='' base='' command_name=''
usage() {
  printf '%s\n' 'Usage: install-multi.sh --domain example.org [--allowed-origins https://alias.example.org] [--repo https://github.com/biao169/web-teacher.git] [--branch web-py] [--python /path/to/python3.12] [--port 8003] [--pip-source tuna|pypi] [--instance NAME] [--command tweb2] [--base /opt/teacher-site-2]' \
    'Installs git, ca-certificates, python3, python3-venv, procps; then installs one isolated teacher website instance.' \
    'Existing files: choose a new directory, repair, or confirmed clean reinstall.' \
    '--domain also configures /robots.txt and /sitemap.xml automatically / 域名同时用于自动生成爬虫规则与站点地图。'
}
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0;;
    --repo|--branch|--domain|--allowed-origins|--python|--port|--pip-source|--instance|--base|--command)
      if (($# < 2)); then usage; exit 2; fi
      case "$1" in --repo) repo=$2;; --branch) branch=$2;; --domain) domain=$2;; --allowed-origins) allowed_origins=$2;; --python) python=$2;; --port) port=$2;; --pip-source) pip_source=$2;; --instance) instance=$2;; --base) base=$2;; --command) command_name=$2;; esac
      shift 2;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2;;
  esac
done
# Use one HTTPS package index. Never disable TLS verification or combine indexes.
[[ $pip_source == tuna || $pip_source == pypi ]] || { printf 'Invalid pip source / 无效依赖源\n' >&2; exit 2; }
# --port is the private application port, not the public HTTPS port.
# Interactive installs allow typing a value; unattended installs default to 8003.
if [[ -z $port ]]; then
  port=${port:-8003}
fi
[[ $port =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1024 && 10#$port <= 65535)) || { printf '端口须为 1024–65535 / Port must be 1024–65535\n' >&2; exit 2; }
port=$((10#$port))
[[ $repo =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { usage; exit 2; }
[[ $branch =~ ^[A-Za-z0-9][A-Za-z0-9_./-]*$ && $branch != *..* ]] || { printf 'Invalid branch\n' >&2; exit 2; }
[[ $domain =~ ^[a-z0-9.-]+$ && $domain == *.* ]] || { printf 'Invalid domain\n' >&2; exit 2; }
((EUID == 0)) || { printf 'Run using sudo bash install-multi.sh ...\n' >&2; exit 1; }
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
multi_args=(--multi)
[[ -z $instance ]] || multi_args+=(--instance "$instance")
[[ -z $base ]] || multi_args+=(--base "$base")
[[ -z $command_name ]] || multi_args+=(--command "$command_name")
# Patch must be published together with this entry point.
"$python" -c 'from pathlib import Path; import sys; assert "MULTI_LAYOUT_VERSION = 1" in Path(sys.argv[1]).read_text(), "Upload multi-instance deployment patch to this branch first"' "$work/source/deploy/linux/tweb.py"
"$python" "$work/source/deploy/linux/tweb.py" "${multi_args[@]}" install --repo "$repo" --branch "$branch" --domain "$domain" --allowed-origins "$allowed_origins" --python "$python" --port "$port" --pip-source "$pip_source"
