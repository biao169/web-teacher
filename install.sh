#!/usr/bin/env bash
# Ubuntu/Debian bootstrap. Execute only from your own reviewed GitHub branch.
# Default repository: biao169/web-teacher, branch web-py. Replace the domain below.
# bash install.sh --domain example.org --port 8003
# --python selects an existing Python >=3.12; never replaces /usr/bin/python3.
set -Eeuo pipefail
repo='https://github.com/biao169/web-teacher.git' branch='web-py' domain='' port='8003' port_set=0 python='/usr/bin/python3'
usage() {
  printf '%s\n' 'Usage: install.sh [--domain example.org] [--port 8003] [--repo https://github.com/biao169/web-teacher.git] [--branch web-py] [--python /path/to/python3.12]' \
    'Installs git, ca-certificates, python3, python3-venv; then installs the single teacher website service.' \
    'Existing managed installation: use sudo tweb update instead.'
}
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0;;
    --repo|--branch|--domain|--port|--python)
      if (($# < 2)); then usage; exit 2; fi
      case "$1" in --repo) repo=$2;; --branch) branch=$2;; --domain) domain=$2;; --port) port=$2; port_set=1;; --python) python=$2;; esac
      shift 2;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2;;
  esac
done
if [[ -z $domain && -t 0 ]]; then read -r -p 'Domain / 域名（不带 https://）: ' domain; fi
if [[ $port_set == 0 && -t 0 ]]; then read -r -p "Local port / 本机监听端口 [$port]: " port_input; port=${port_input:-$port}; fi
[[ $repo =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || { usage; exit 2; }
[[ $branch =~ ^[A-Za-z0-9][A-Za-z0-9_./-]*$ && $branch != *..* ]] || { printf 'Invalid branch\n' >&2; exit 2; }
[[ $domain =~ ^[a-z0-9.-]+$ && $domain == *.* ]] || { printf 'Invalid domain\n' >&2; exit 2; }
[[ $port =~ ^[0-9]+$ && $port -ge 1024 && $port -le 65535 ]] || { printf 'Invalid port: use 1024-65535\n' >&2; exit 2; }
((EUID == 0)) || { printf 'Run using sudo bash install.sh ...\n' >&2; exit 1; }
[[ -d /run/systemd/system ]] || { printf 'A running systemd host is required.\n' >&2; exit 1; }
# Distribution ID is a system-owned file, not an imported website configuration.
. /etc/os-release
[[ $ID == ubuntu || $ID == debian ]] || { printf 'Only Ubuntu/Debian is supported.\n' >&2; exit 1; }
[[ ! -e /usr/local/bin/tweb && ! -L /usr/local/bin/tweb ]] || { printf 'tweb already exists. Use sudo tweb update.\n' >&2; exit 1; }
apt-get update
apt-get install -y --no-install-recommends git ca-certificates python3 python3-venv
"$python" -c 'import sys; assert sys.version_info >= (3,12), "Python 3.12+ required: provide --python /path/to/python3.12 with venv support"'
# Temporary download always gets cleaned; run manager as a child so the trap runs.
work=$(mktemp -d /tmp/teacher-install.XXXXXXXX)
trap 'rm -rf -- "$work"' EXIT
GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null clone --depth 1 --single-branch --branch "$branch" -- "$repo" "$work/source"
[[ -f "$work/source/deploy/linux/tweb.py" && ! -L "$work/source/deploy/linux/tweb.py" ]] || { printf 'Missing deployment manager\n' >&2; exit 1; }
# stdin remains the terminal for the administrator password; do not use curl | bash.
"$python" "$work/source/deploy/linux/tweb.py" install --repo "$repo" --branch "$branch" --domain "$domain" --port "$port" --python "$python"
