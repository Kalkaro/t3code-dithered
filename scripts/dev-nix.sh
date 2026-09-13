#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

exec nix develop "$repo_root" --command bash -c '
  set -euo pipefail
  repo_root=$1
  shift
  cd -- "$repo_root"
  pnpm install
  exec pnpm exec vp run dev "$@"
' bash "$repo_root" "$@"
