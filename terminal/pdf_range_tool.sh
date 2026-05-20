#!/bin/bash
# Interactive PDF page range extractor (working with spaces)
# 7-28,29-50,51-69,70-84,85-94,95-125,126-149,150-167,168-180,181-203,204-225,226-242,243-256,257-264,265-283,284-293,294-307
set -euo pipefail

# Check for qpdf
if ! command -v qpdf &> /dev/null; then
    echo "qpdf is required. Install with: brew install qpdf"
    exit 1
fi

# Ask for input PDF if not already set
if [ -z "${INPUT_PDF:-}" ]; then
    read -p "Enter PDF filename: " INPUT_PDF
    if [ ! -f "$INPUT_PDF" ]; then
        echo "File not found: $INPUT_PDF"
        exit 1
    fi
    export INPUT_PDF
fi

while true; do
    echo "Current PDF: $INPUT_PDF"
    read -p "Page ranges (e.g., 5-15,17-21,165,168-169) or 'quit': " ranges
    [[ "$ranges" == "quit" ]] && break
    [[ -z "$ranges" ]] && continue
    
        # Split ranges by comma and clean up any spaces
    ranges_clean=$(echo "$ranges" | tr -d ' ')
    IFS=',' read -ra parts <<< "$ranges_clean"
    
    # Process each range separately
    for part in "${parts[@]}"; do
        # Validate range format
        if [[ ! "$part" =~ ^[0-9]+$ ]] && [[ ! "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
            echo "Invalid range: $part"
            continue
        fi
        
        # Create output filename based on range
        output="${INPUT_PDF%.*}_${part}.pdf"
        echo "Extracting $part → $output"
        
        # Display the exact command for debugging
        echo "Running: qpdf --empty --pages \"$INPUT_PDF\" \"$part\" -- \"$output\""
        
        # Execute qpdf command for this specific range
        qpdf --empty --pages "$INPUT_PDF" "$part" -- "$output"
        
        echo "✅ Created $output"
    done


done