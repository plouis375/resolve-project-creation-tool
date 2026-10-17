#!/bin/bash
set -euo pipefail

PLUGIN="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/com.idolatry.resolveprojectcreationtool"
if [ -d "$PLUGIN" ]; then
  rm -rf "$PLUGIN"
  printf 'Resolve Project Creation Tool retiré.\n'
else
  printf 'Plugin absent.\n'
fi
