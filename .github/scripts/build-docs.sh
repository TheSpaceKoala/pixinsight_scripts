#!/bin/bash
set -e

echo "🔄 Rebuilding unified docs folder for GitHub Pages..."

# Remove any existing docs folder and create a new one.
rm -rf docs
mkdir docs

# List of common asset folders (these provide shared CSS, icons, etc.)
common_assets=("css" "icons" "pidoc" "titles")

# Copy common asset folders from doc/ to docs/ (if they exist)
for folder in "${common_assets[@]}"; do
  if [ -d "doc/$folder" ]; then
    cp -r "doc/$folder" docs/
    echo "✅ Copied common asset folder: $folder"
  fi
done

# Copy each script documentation folder from doc/scripts directly into docs/
if [ -d "doc/scripts" ]; then
  for sub in doc/scripts/*/; do
    subname=$(basename "$sub")
    mkdir -p "docs/$subname"
    cp -r "$sub"* "docs/$subname/"
    
    # Standardize the main HTML file:
    # If there's no index.html, try renaming <foldername>.html to index.html,
    # or if exactly one HTML file exists, rename that.
    if [ ! -f "docs/$subname/index.html" ]; then
      if [ -f "docs/$subname/$subname.html" ]; then
        mv "docs/$subname/$subname.html" "docs/$subname/index.html"
      else
        htmlCount=$(find "docs/$subname" -maxdepth 1 -type f -name "*.html" | wc -l)
        if [ "$htmlCount" -eq 1 ]; then
          htmlFile=$(find "docs/$subname" -maxdepth 1 -type f -name "*.html")
          mv "$htmlFile" "docs/$subname/index.html"
        fi
      fi
    fi
    echo "✅ Processed script folder: $subname"
  done
fi

# Generate the global index.html that lists only the script documentation folders.
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
  # List subdirectories in docs/ and skip the common asset folders.
  for d in docs/*/; do
      folderName=$(basename "$d")
      skip=false
      for asset in "${common_assets[@]}"; do
         if [ "$folderName" == "$asset" ]; then
            skip=true
         fi
      done
      if [ "$skip" = false ]; then
          if [ -f "$d/index.html" ]; then
            echo "    <li><a href=\"$folderName/index.html\">$folderName</a></li>"
          else
            echo "    <li>$folderName (No index.html found)</li>"
          fi
      fi
  done
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docs/index.html

echo "✅ Global index created in docs"
