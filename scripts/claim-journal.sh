#!/usr/bin/env bash
set -euo pipefail
branch=refs/heads/flop-claim-state
tracking=refs/remotes/origin/flop-claim-state
journal=$2

case "$1" in
  pull)
    result=0
    git ls-remote --exit-code origin "$branch" >/dev/null || result=$?
    case "$result" in
      0)
        git fetch --no-tags origin "$branch:$tracking"
        git show "$tracking:journal.sqlite" > "$journal"
        ;;
      2) ;;
      *) exit "$result" ;;
    esac
    ;;
  push)
    blob=$(git hash-object -w "$journal")
    summary=$(node src/public-claim.mjs "$journal" | git hash-object -w --stdin)
    tree=$(printf '100644 blob %s\tjournal.sqlite\n100644 blob %s\tpublic.json\n' "$blob" "$summary" | git mktree)
    parent=()
    if git show-ref --verify --quiet "$tracking"; then
      if [[ $(git rev-parse "$tracking^{tree}") == "$tree" ]]; then exit 0; fi
      parent=(-p "$tracking")
    fi
    commit=$(git -c user.name='FLOP-Agent' -c user.email='actions@users.noreply.github.com' \
      commit-tree "$tree" "${parent[@]}" -m 'Checkpoint public Testnet faucet operation')
    git push origin "$commit:$branch"
    git update-ref "$tracking" "$commit"
    ;;
  *) exit 2 ;;
esac
