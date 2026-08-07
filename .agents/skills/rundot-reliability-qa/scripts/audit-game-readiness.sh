#!/usr/bin/env bash
# Advisory local preflight for the canonical GAME_READINESS_CHECKLIST.md.
set -u

project_dir=${1:-.}
project_dir=$(cd "$project_dir" 2>/dev/null && pwd) || {
  echo "FAIL project directory is not accessible: ${1:-.}" >&2
  exit 2
}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

pass=0
warn=0
fail=0

check_file() {
  local path=$1 label=$2
  if [[ -f "$path" ]]; then
    printf 'PASS %s\n' "$label"; ((pass+=1))
  else
    printf 'WARN %s (%s missing)\n' "$label" "$path"; ((warn+=1))
  fi
}

echo "RUN readiness advisory: $project_dir"
check_file "$project_dir/package.json" "package manifest"
check_file "$project_dir/public/thumbnail.jpg" "catalog thumbnail"

if [[ -f "$project_dir/public/thumbnail.jpg" ]] && command -v file >/dev/null 2>&1; then
  dimensions=$(file -b "$project_dir/public/thumbnail.jpg" 2>/dev/null || true)
  if [[ ( "$dimensions" == *"512x512"* || "$dimensions" == *"512 x 512"* ) && "$dimensions" == *"JPEG"* ]]; then
    printf 'PASS thumbnail is 512x512 JPEG\n'; ((pass+=1))
  else
    printf 'WARN thumbnail is not verified as 512x512 JPEG: %s\n' "$dimensions"; ((warn+=1))
  fi
fi

if compgen -G "$project_dir/game.config.*.json" >/dev/null || [[ -f "$project_dir/rundot/game.config.json" ]]; then
  printf 'PASS game configuration found\n'; ((pass+=1))
else
  printf 'WARN no game.config.<env>.json or rundot/game.config.json found\n'; ((warn+=1))
fi

if [[ -f "$project_dir/rundot/liveops.config.json" ]]; then
  printf 'PASS LiveOps config tracked\n'; ((pass+=1))
fi

if [[ -f "$project_dir/package.json" ]] && command -v node >/dev/null 2>&1; then
  scripts=$(node -e 'const p=require(process.argv[1]); console.log(Object.keys(p.scripts||{}).join(" "))' "$project_dir/package.json" 2>/dev/null || true)
  for script in build test lint; do
    if [[ " $scripts " == *" $script "* ]]; then
      printf 'PASS package script: %s\n' "$script"; ((pass+=1))
    else
      printf 'WARN package script absent: %s\n' "$script"; ((warn+=1))
    fi
  done
fi

if [[ -d "$project_dir/dist" ]]; then
  printf 'PASS build output directory exists\n'; ((pass+=1))
else
  printf 'WARN build output directory does not exist (run the project build before deploy)\n'; ((warn+=1))
fi

purchase_check="$script_dir/check-purchase-recovery.mjs"
if [[ -f "$purchase_check" ]] && command -v node >/dev/null 2>&1; then
  if purchase_output=$(node "$purchase_check" "$project_dir" 2>&1); then
    printf '%s\n' "$purchase_output"
    if [[ "$purchase_output" == *"PASS "* ]]; then ((pass+=1)); fi
  else
    printf '%s\n' "$purchase_output"
    ((fail+=1))
  fi
else
  printf 'WARN purchase recovery checker unavailable\n'; ((warn+=1))
fi

printf '\nSummary: %d pass, %d warning, %d failure.\n' "$pass" "$warn" "$fail"
printf 'Complete the human evidence gates in references/GAME_READINESS_CHECKLIST.md next to this script.\n'
exit 0
