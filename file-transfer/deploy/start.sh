#!/bin/sh
set -eu
ft_deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$ft_deploy_dir/../scripts/start.mjs"
