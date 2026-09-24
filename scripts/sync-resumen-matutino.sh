#!/usr/bin/env bash
# Sync Chief of Staff morning brief into the repo (Vercel-readable bundle).
# CoS writes ~08:00 ART to /workspace/dhf-digest/latest.txt
# Run AFTER that (~08:00+ ART), then commit + push so production picks it up.
# Strips personal "Agenda:" lines — digest web keeps markets/FX/grains only.
#
# Usage:
#   ./scripts/sync-resumen-matutino.sh
#   ./scripts/sync-resumen-matutino.sh /path/to/other.txt
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-/workspace/dhf-digest/latest.txt}"
DEST="$ROOT/src/data/resumen-matutino.txt"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: source missing: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
# Copy then strip Agenda / personal calendar lines (do not invent content)
awk '
  BEGIN { IGNORECASE=1 }
  /^[[:space:]]*Agenda:/ { next }
  /^[[:space:]]*Agenda / { next }
  /agenda personal/ { next }
  /reuniones/ && /recordatorio/ { next }
  { print }
' "$SRC" > "$DEST"

echo "Synced $SRC → $DEST (Agenda lines stripped)"
BODY=$(awk 'BEGIN{b=0} /^$/{b=1; next} b && NF{c++} END{print c+0}' "$DEST")
echo "Body lines: $BODY"
head -n 12 "$DEST"
