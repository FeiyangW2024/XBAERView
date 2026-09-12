#!/usr/bin/env bash
set -euo pipefail
if [[ ${1:-} == --help ]]; then
  echo 'Usage: ./deploy.sh [--check] (run after committing changes).'
  echo 'Overrides: XBAER_SSH_TARGET, XBAER_REMOTE_ROOT, XBAER_CONDA_SH, XBAER_CONDA_ENV, XBAER_HEALTH_URL, XBAER_PUBLIC_URL.'
  exit 0
fi
[[ $# == 0 || ( $# == 1 && $1 == --check ) ]] || { echo 'Unknown argument' >&2; exit 1; }
cd -P "$(dirname "${BASH_SOURCE[0]}")/.."
for cmd in git node npm ssh scp; do command -v "$cmd" >/dev/null; done
[[ $(git rev-parse --show-toplevel) == "$PWD" ]] || { echo 'Not the project root' >&2; exit 1; }
node -e 'if(require("./package.json").name!=="xbaer-view")process.exit(1)'
clean() { [[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'Commit or save local changes first; working tree must be clean.' >&2; exit 1; }; }
clean
[[ -z $(git ls-files -- dist deploy config/deployment.linux.json .production .production-link) ]] || { echo 'Server-owned paths are tracked in Git; refusing upload.' >&2; exit 1; }
sha=$(git rev-parse HEAD)
npm test
[[ -x node_modules/.bin/vue-tsc ]] || { echo 'Run npm ci locally first.' >&2; exit 1; }
./node_modules/.bin/vue-tsc --noEmit
clean
[[ $(git rev-parse HEAD) == "$sha" ]] || { echo 'HEAD changed during checks' >&2; exit 1; }
if [[ ${1:-} == --check ]]; then echo "Local checks passed: $sha (no SSH or upload)"; exit 0; fi
host=${XBAER_SSH_TARGET:-admin1@10.103.2.100}
root=${XBAER_REMOTE_ROOT:-/home/admin1/xbaer-view}
conda_sh=${XBAER_CONDA_SH:-/home/admin1/miniforge3/etc/profile.d/conda.sh}
conda_env=${XBAER_CONDA_ENV:-xbaer-web}
health=${XBAER_HEALTH_URL:-http://127.0.0.1:8080}
public=${XBAER_PUBLIC_URL:-http://10.103.2.100:8080/}
# Restrict transport parameters before embedding them in remote shell commands.
[[ $host =~ ^[a-zA-Z0-9_.-]+@[a-zA-Z0-9.-]+$ ]] || exit 1
for value in "$root" "$conda_sh"; do [[ $value =~ ^/[a-zA-Z0-9_./-]+$ && $value != *..* ]] || exit 1; done
[[ $conda_env =~ ^[a-zA-Z0-9_-]+$ && $health =~ ^https?://[a-zA-Z0-9.:/-]+$ && $public =~ ^https?://[a-zA-Z0-9.:/-]+$ ]] || exit 1
local_tmp=$(mktemp -d "${TMPDIR:-/tmp}/xbaer-push.XXXXXXXX")
remote_tmp=''
cleanup() {
  code=$?
  trap - EXIT
  rm -rf "$local_tmp"
  if [[ -n $remote_tmp ]]; then
    ssh "$host" "rm -f -- '$remote_tmp/update' '$remote_tmp/run.sh'; rmdir -- '$remote_tmp'" </dev/null || echo "Remote transfer cleanup failed: $remote_tmp" >&2
  fi
  if [[ $code != 0 ]]; then echo 'Push/deploy failed. Do not assume rollback: inspect server state and use the existing recovery/rollback tools if needed.' >&2; fi
  exit "$code"
}
trap cleanup EXIT
git bundle create "$local_tmp/update" HEAD
git bundle verify "$local_tmp/update"
[[ $(git bundle list-heads "$local_tmp/update" HEAD) == "$sha HEAD" ]] || { echo 'Bundle SHA changed during packaging' >&2; exit 1; }
git show "$sha:scripts/receive-production.sh" > "$local_tmp/run.sh"
clean
[[ $(git rev-parse HEAD) == "$sha" ]] || { echo 'HEAD changed before upload' >&2; exit 1; }
remote_tmp=$(ssh "$host" 'umask 077; mktemp -d /tmp/xbaer-push.XXXXXXXX')
[[ $remote_tmp =~ ^/tmp/xbaer-push\.[a-zA-Z0-9]+$ ]] || { remote_tmp=''; echo 'Invalid remote temporary path' >&2; exit 1; }
scp "$local_tmp/update" "$host:$remote_tmp/update"
scp "$local_tmp/run.sh" "$host:$remote_tmp/run.sh"
ssh "$host" "bash --noprofile --norc '$remote_tmp/run.sh' '$root' '$remote_tmp/update' '$sha' '$conda_sh' '$conda_env' '$health' '$public'"
