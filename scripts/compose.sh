#!/usr/bin/env bash
set -euo pipefail

# Always run from the repository root so the compose file is discoverable
# regardless of the caller's working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

# Unless the caller explicitly passed a compose file, default to the repo's
# docker-compose.yml so Podman and Docker CLIs consistently locate it.
NEEDS_DEFAULT_FILE=1
for arg in "$@"; do
  case "$arg" in
    -f|--file|--file=*)
      NEEDS_DEFAULT_FILE=0
      break
      ;;
  esac
done

if [[ ${NEEDS_DEFAULT_FILE} -eq 1 && -f docker-compose.yml ]]; then
  set -- -f docker-compose.yml "$@"
fi

# Prefer the native Podman compose plugin when available.
if command -v podman >/dev/null 2>&1; then
  if podman compose version >/dev/null 2>&1; then
    if ! podman info >/dev/null 2>&1; then
      echo "Podman is installed but no active service connection is available." >&2
      echo "Start or connect to a Podman machine (e.g. 'podman machine init' and 'podman machine start') and retry." >&2
      exit 125
    fi
    exec podman compose "$@"
  fi
fi

# Fall back to the standalone podman-compose Python script.
if command -v podman-compose >/dev/null 2>&1; then
  exec podman-compose "$@"
fi

# Finally, allow Docker Compose as a last resort.
if command -v docker >/dev/null 2>&1; then
  if docker compose version >/dev/null 2>&1; then
    exec docker compose "$@"
  fi
fi

echo "No compose-compatible command found. Install Podman compose plugin, podman-compose, or Docker Compose." >&2
exit 1
