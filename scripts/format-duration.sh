#!/usr/bin/env bash
# Format a non-negative duration in milliseconds for human-facing workflow output.
# Keep sub-second precision; round to whole seconds thereafter, then retain lower
# units for longer durations (for example, 500000 -> 8m20s).

format_duration() {
  local milliseconds="${1:?usage: format_duration <milliseconds>}"

  if ! [[ "$milliseconds" =~ ^[0-9]+$ ]]; then
    printf 'format_duration: expected a non-negative integer number of milliseconds, got %q\n' "$milliseconds" >&2
    return 2
  fi

  if ((milliseconds < 1000)); then
    printf '%dms' "$milliseconds"
    return
  fi

  local seconds=$(((milliseconds + 500) / 1000))
  if ((seconds < 60)); then
    printf '%ds' "$seconds"
    return
  fi

  local days=$((seconds / 86400))
  local hours=$(((seconds % 86400) / 3600))
  local minutes=$(((seconds % 3600) / 60))
  local remaining_seconds=$((seconds % 60))
  local result=""

  if ((days > 0)); then result+="${days}d"; fi
  if ((hours > 0)); then result+="${hours}h"; fi
  if ((minutes > 0)); then result+="${minutes}m"; fi
  if ((remaining_seconds > 0)); then result+="${remaining_seconds}s"; fi
  printf '%s' "${result:-0s}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  format_duration "$@" || exit $?
  printf '\n'
fi
