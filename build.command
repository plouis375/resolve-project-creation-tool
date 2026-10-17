#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK_PLUGIN="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
DIST_ROOT="$ROOT/dist"
DEST="$DIST_ROOT/com.idolatry.resolveprojectcreationtool"

if [ ! -f "$SDK_PLUGIN" ]; then
  printf 'Resolve SDK plug-in module not found:\n%s\n' "$SDK_PLUGIN" >&2
  exit 1
fi

mkdir -p "$DIST_ROOT"
STAGING="$(mktemp -d "$DIST_ROOT/.rpc-tool.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
ditto "$ROOT/plugin" "$STAGING/plugin"
cp "$SDK_PLUGIN" "$STAGING/plugin/WorkflowIntegration.node"

if [ -e "$DEST" ]; then
  rm -rf "$DEST"
fi
mv "$STAGING/plugin" "$DEST"
printf 'Plugin prêt : %s\n' "$DEST"
