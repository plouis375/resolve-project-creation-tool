#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK_PLUGIN="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Workflow Integrations/Examples/SamplePlugin/WorkflowIntegration.node"
BUNDLED_PLUGIN="$ROOT/plugin/WorkflowIntegration.node"
if [ -f "$BUNDLED_PLUGIN" ]; then
  WORKFLOW_PLUGIN="$BUNDLED_PLUGIN"
elif [ -f "$SDK_PLUGIN" ]; then
  WORKFLOW_PLUGIN="$SDK_PLUGIN"
else
  printf 'Module Workflow Integration introuvable dans l’archive et dans Resolve.\n' >&2
  exit 1
fi
DIST_ROOT="$ROOT/dist"
DEST="$DIST_ROOT/com.idolatry.resolveprojectcreationtool"

mkdir -p "$DIST_ROOT"
STAGING="$(mktemp -d "$DIST_ROOT/.rpc-tool.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
cp -R "$ROOT/plugin/." "$STAGING/plugin/"
chmod 755 "$STAGING/plugin/ffprobe"
cp "$WORKFLOW_PLUGIN" "$STAGING/plugin/WorkflowIntegration.node"

if [ -e "$DEST" ]; then
  rm -rf "$DEST"
fi
mv "$STAGING/plugin" "$DEST"
printf 'Plugin prêt : %s\n' "$DEST"
