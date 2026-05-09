#!/bin/bash
set -euo pipefail

DEST="flattened"
ROOT="$(pwd)"
DEST_PATH="$ROOT/$DEST"

combine_pdf_pngs_in_folder() {
    local folder="$1"
    
    shopt -s nullglob
    local pdf_list=("$folder"/*.pdf "$folder"/*.PDF)
    local png_list=("$folder"/*.png "$folder"/*.PNG)
    shopt -u nullglob
    
    if [ ${#pdf_list[@]} -gt 0 ] && [ ${#png_list[@]} -gt 0 ]; then
        echo "📁 Processing: $folder"
        echo "   Found ${#pdf_list[@]} PDF(s) and ${#png_list[@]} PNG(s)"
        
        local tmp_dir="$(mktemp -d)"
        local png_pdfs=()
        
        for png in "${png_list[@]}"; do
            local png_name="$(basename "$png")"
            local temp_pdf="$tmp_dir/${png_name%.*}.pdf"
            sips -s format pdf "$png" --out "$temp_pdf" >/dev/null 2>&1
            png_pdfs+=("$temp_pdf")
        done
        
        local output_pdf="$folder/combined_$(date +%Y%m%d_%H%M%S).pdf"
        magick "${pdf_list[@]}" "${png_pdfs[@]}" "$output_pdf"
        
        rm -f "${pdf_list[@]}" "${png_list[@]}"
        rm -rf "$tmp_dir"
        
        echo "   ✅ Created: $output_pdf"
    fi
}

echo "🔍 Scanning folders with PDF + PNGs..."
find "$ROOT" -type d -not -path "$DEST_PATH/*" -not -path "$ROOT" | while read -r dir; do
    combine_pdf_pngs_in_folder "$dir"
done

mkdir -p "$DEST_PATH"
echo "🗄️ Flattening into $DEST_PATH ..."
find "$ROOT" -type f -not -path "$DEST_PATH/*" | while read -r file; do
    rel="${file#$ROOT/}"
    safe_name="${rel//\//_}"
    mv -n "$file" "$DEST_PATH/$safe_name" 2>/dev/null || echo "   Skipped duplicate: $safe_name"
done

echo "✨ Done. All files are now in $DEST_PATH"