#!/bin/bash
set -e

echo "🔄 Rebuilding unified docs folder for GitHub Pages..."

# Remove any existing docs folder and create a new one
rm -rf docs
mkdir docs

# Define source folders you want to include (adjust or add more if needed)
sources=("doc/scripts" "doc/docs" "doc/pidoc")

# Function to process a single documentation subfolder
process_doc_folder() {
  local srcFolder="$1"
  # Iterate over every subdirectory (each doc item) in the source folder
  for folder in "$srcFolder"/*/; do
    # Get the folder name
    local docName
    docName=$(basename "$folder")
    # Create a corresponding folder in docs (if it doesn't already exist)
    mkdir -p "docs/$docName"
    # Copy all files and subfolders from the source doc folder to the target
    cp -r "$folder"* "docs/$docName/"
    
    # Now, standardize the main HTML file:
    # If there's already an index.html in the target, leave it.
    if [ ! -f "docs/$docName/index.html" ]; then
      # First, try: if there's a file named exactly like the folder (e.g., SendImageToTelegram.html)
      if [ -f "docs/$docName/$docName.html" ]; then
        mv "docs/$docName/$docName.html" "docs/$docName/index.html"
      else
        # Otherwise, check if there's exactly one .html file in the folder
        htmlCount=$(find "docs/$docName" -maxdepth 1 -type f -name "*.html" | wc -l)
        if [ "$htmlCount" -eq 1 ]; then
          htmlFile=$(find "docs/$docName" -maxdepth 1 -type f -name "*.html")
          mv "$htmlFile" "docs/$docName/index.html"
        fi
      fi
    fi
  done
}

# Process each source folder
for src in "${sources[@]}"; do
  if [ -d "$src" ]; then
    process_doc_folder "$src"
  fi
done

echo "✅ All documentation subfolders have been restructured into docs/."

# Create a global index.html in docs/ that lists all subfolders
echo "Creating global index.html in docs..."
(
  echo "<!DOCTYPE html>"
  echo "<html lang='en'>"
  echo "<head>"
  echo "  <meta charset='UTF-8'>"
  echo "  <title>Documentation Index</title>"
  echo "  <style>"
  echo "    body { font-family: Arial, sans-serif; padding: 20px; }"
  echo "    h1 { color: #333; }"
  echo "    ul { list-style-type: none; padding: 0; }"
  echo "    li { margin-bottom: 10px; }"
  echo "    a { text-decoration: none; color: #1a0dab; }"
  echo "    a:hover { text-decoration: underline; }"
  echo "  </style>"
  echo "</head>"
  echo "<body>"
  echo "  <h1>Documentation Index</h1>"
  echo "  <ul>"
  for folder in docs/*/; do
      docName=$(basename "$folder")
      # Assume the main file is now index.html
      if [ -f "$folder/index.html" ]; then
        echo "    <li><a href=\"$docName/index.html\">$docName</a></li>"
      else
        echo "    <li>$docName (No index.html found)</li>"
      fi
  done
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docs/index.html

echo "✅ Global index created in docs"
