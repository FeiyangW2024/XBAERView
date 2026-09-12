#!/usr/bin/env bash
# Invoked by push-production.sh in a dedicated SSH process, never sourced into a login shell.
set -euo pipefail
[[ $# == 7 ]] || { echo 'Expected root, bundle, SHA, conda.sh, environment, health URL, public URL' >&2; exit 1; }
root=$1 bundle=$2 expected=$3 conda_sh=$4 conda_env=$5 health=${6%/} public=$7
[[ $expected =~ ^[a-f0-9]{40,64}$ && -f $bundle && -f $conda_sh ]] || exit 1
# Only this process and its children inherit the deployment environment.
source "$conda_sh"
conda activate "$conda_env"
cd -P "$root"
[[ $(git rev-parse --show-toplevel) == "$PWD" ]] || { echo 'Incorrect server project root' >&2; exit 1; }
node -e 'if(require("./package.json").name!=="xbaer-view")process.exit(1)'
node --version
npm --version
[[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'Server working tree is dirty; refusing checkout.' >&2; exit 1; }
[[ -z $(git ls-files -- dist deploy config/deployment.linux.json .production .production-link) ]] || { echo 'Server-owned files are tracked' >&2; exit 1; }
[[ -f .production/state.json && -f deploy/config.json && -f dist/index.html ]] || { echo 'Existing production baseline/config missing; first-time adoption must be done separately.' >&2; exit 1; }
[[ ! -e .production/journal.json && ! -e .production/lock ]] || { echo 'Existing deployment or interrupted transaction; inspect before retry.' >&2; exit 1; }
mkdir .production/push-lock || { echo 'Another push is active' >&2; exit 1; }
probe=""
cleanup() { code=$?; trap - EXIT; if [[ -n $probe ]]; then rm -rf "$probe"; fi; rmdir .production/push-lock; if [[ $code != 0 ]]; then echo 'Remote operation failed; production may still be the old release or may have switched before health validation failed. Inspect .production/state.json.' >&2; fi; exit "$code"; }
trap cleanup EXIT
command -v curl >/dev/null
git bundle verify "$bundle"
git fetch "$bundle" HEAD
target=$(git rev-parse FETCH_HEAD)
[[ $target == "$expected" ]] || { echo 'Target SHA differs from local SHA' >&2; exit 1; }
[[ -z $(git ls-tree -r --name-only "$target" -- dist deploy config/deployment.linux.json .production .production-link) ]] || { echo 'Target tracks protected server files' >&2; exit 1; }
# Keep the pre-update source reachable even if deployment fails after checkout.
git update-ref "refs/xbaer/before-push/$(date +%Y%m%d-%H%M%S)-$$" HEAD
git switch --detach "$target"
bash scripts/deploy-production.sh --check
bash scripts/deploy-production.sh
[[ -f .production/state.json && -f dist/index.html && -f deploy/config.json && -f dist/config.json ]] || { echo "Missing deployed artifacts" >&2; exit 1; }
cmp deploy/config.json dist/config.json
node - "$expected" <<'JS'
const fs=require('fs');const state=JSON.parse(fs.readFileSync('.production/state.json','utf8'));
if(state.current?.commit!==process.argv[2] || !state.previous?.commit)throw Error('Production state does not match expected commit');
JS
# Require HTTP 200, not redirects or an HTTP error page.
probe=$(mktemp -d /tmp/xbaer-health.XXXXXXXX)
for item in index.html config.json; do
  endpoint=$item; [[ $item != index.html ]] || endpoint=''
  status=$(curl --silent --show-error --connect-timeout 10 --max-time 30 -o "$probe/$item" -w '%{http_code}' "$health/$endpoint")
  [[ $status == 200 ]] || { echo "Health check failed: $health/$endpoint HTTP $status" >&2; exit 1; }
  cmp "dist/$item" "$probe/$item"
done
node - "$expected" "$public" <<'JS'
const fs=require('fs');const s=JSON.parse(fs.readFileSync('.production/state.json','utf8'));
console.log(`Deployment verified\nRequested: ${process.argv[2]}\nCurrent:   ${s.current.commit}\nPrevious:  ${s.previous.commit}\nURL:       ${process.argv[3]}`);
JS
