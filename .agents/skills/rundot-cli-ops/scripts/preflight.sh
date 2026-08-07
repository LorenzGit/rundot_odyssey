#!/usr/bin/env bash
set -euo pipefail

project="${1:-.}"
cd "$project"

echo "CLI: $(rundot --version 2>/dev/null || echo unavailable)"
if [[ -f package.json ]]; then
  echo "Node: $(node --version)"
  npm ls @series-inc/rundot-game-sdk --depth=0 2>/dev/null || true
fi

configs=()
while IFS= read -r file; do configs+=("$file"); done < <(find . -maxdepth 1 -name 'game.config.*.json' -print | sort)
if ((${#configs[@]} == 0)); then
  echo "Game config: missing (rundot init has not completed)"
else
  printf 'Game config: %s\n' "${configs[@]}"
fi

if [[ -d dist ]]; then
  echo "Build: dist exists"
else
  echo "Build: dist missing"
fi
