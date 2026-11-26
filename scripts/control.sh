#!/usr/bin/env bash
set -euo pipefail
ref=refs/heads/flop-control
remote=refs/remotes/origin/flop-control
status=0
git ls-remote --exit-code origin "$ref" >/dev/null || status=$?
if [[ "$status" == 0 ]]; then
  git fetch --no-tags -q origin "$ref:$remote"
elif [[ "$status" != 2 ]]; then
  exit "$status"
fi
if [[ "$1" == check ]]; then
  [[ "$status" == 0 ]] && git show "$remote:control.json" | jq -e '.mode == "RUNNING"' >/dev/null
  exit
fi
case "$1" in
  start)  mode=RUNNING ;;
  stop)   mode=STOPPED ;;
  halt)   mode=HALTED ;;
  *) exit 2 ;;
esac
key=${FLOP_PUBLIC_KEY:-}
[[ "$key" =~ ^[a-f0-9]{64}$ ]] || key=
blob=$(jq -nc --arg mode "$mode" --arg publicKey "$key" '{mode:$mode,publicKey:$publicKey}' | git hash-object -w --stdin)
tree=$(printf '100644 blob %s\tcontrol.json\n' "$blob" | git mktree)
parent=()
if [[ "$status" == 0 ]]; then parent=(-p "$remote"); fi
commit=$(git -c user.name='FLOP-Agent' -c user.email='actions@users.noreply.github.com' \
  commit-tree "$tree" "${parent[@]}" -m "Set FLOP control to $mode")
git push origin "$commit:$ref"
