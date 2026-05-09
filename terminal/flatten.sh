#!/bin/bash
# Flatten all files from current folder tree into one folder

set -euo pipefail

DEST="flattened"                     # the single output folder
ROOT="$(pwd)"                        # use the folder you cd'd into
DEST_PATH="$ROOT/$DEST"

# Avoid accidentally processing the destination folder itself
if [ -d "$DEST_PATH" ]; then
    echo "Warning: '$DEST' already exists. Files may be overwritten."
    read -p "Continue? (y/n) " -n 1 -r
    echo
    [[ "$REPLY" =~ ^[Yy]$ ]] || exit 1
fi

mkdir -p "$DEST_PATH"

# Find every file (excluding the destination folder)
find "$ROOT" -type f -not -path "$DEST_PATH/*" | while read -r file; do
    # Get relative path from ROOT and replace '/' with '_' to avoid name collisions
    rel="${file#$ROOT/}"
    safe_name="${rel//\//_}"
    
    # Move the file (use -n to never overwrite)
    mv -n "$file" "$DEST_PATH/$safe_name" 2>/dev/null || echo "Skipped: $file (target exists)"
done

echo "All files moved to $DEST_PATH"