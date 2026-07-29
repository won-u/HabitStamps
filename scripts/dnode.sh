#!/usr/bin/env bash
# Runs a command inside a Node 20 container with this repo mounted at /workspace.
# Node/npm/pnpm are not installed on the host, so all scaffolding/build commands
# go through this wrapper. A named Docker volume persists the pnpm store across runs.
# The container runs as root, so we chown the mounted repo back to the host
# user afterward (both on success and failure) to avoid leaving root-owned files.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

docker run --rm \
  -v "${REPO_ROOT}:/workspace" \
  -v habit_tracker_pnpm_store:/root/.local/share/pnpm/store \
  -w "${1:-/workspace}" \
  -e PNPM_HOME=/root/.local/share/pnpm \
  node:20 \
  bash -lc "corepack enable >/dev/null 2>&1; corepack prepare pnpm@9 --activate >/dev/null 2>&1; ${*:2}; STATUS=\$?; chown -R ${HOST_UID}:${HOST_GID} /workspace; exit \$STATUS"
