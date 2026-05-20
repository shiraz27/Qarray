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
    IFS=',' read -ra groups <<< "$(echo "$ranges" | tr -d ' ')"
    
    # Process each group (may contain merged ranges with +)
    for group in "${groups[@]}"; do
        # Split group into individual ranges by +
        IFS='+' read -ra subranges <<< "$group"
        
        # Validate each subrange and build the range string for qpdf
        valid_ranges=()
        for subrange in "${subranges[@]}"; do
            if [[ "$subrange" =~ ^[0-9]+$ ]]; then
                valid_ranges+=("$subrange")
            elif [[ "$subrange" =~ ^([0-9]+)-([0-9]+)$ ]]; then
                valid_ranges+=("${BASH_REMATCH[1]}-${BASH_REMATCH[2]}")
            else
                echo "Invalid range: $subrange"
                continue 2
            fi
        done
        
        # Skip if no valid ranges found
        if [ ${#valid_ranges[@]} -eq 0 ]; then
            echo "No valid ranges in group: $group"
            continue
        fi
        
        # Create output filename based on the group (replace + with _ for readability)
        output="${INPUT_PDF%.*}_${group//+/_}.pdf"
        echo "Extracting ${valid_ranges[*]} → $output"
        
        # Display the exact command for debugging
        echo "Running: qpdf --empty --pages \"$INPUT_PDF\" ${valid_ranges[*]} -- \"$output\""
        
        # Execute qpdf command for this group of ranges
        qpdf --empty --pages "$INPUT_PDF" "${valid_ranges[*]}" -- "$output"
        
        echo "✅ Created $output"
    done



done