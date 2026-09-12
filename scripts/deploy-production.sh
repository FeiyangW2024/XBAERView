#!/usr/bin/env bash
set -euo pipefail
# Run from the project root. No remote operations are performed.
exec node "$(dirname "${BASH_SOURCE[0]}")/production.mjs" deploy "$@"
