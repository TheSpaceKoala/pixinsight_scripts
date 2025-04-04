#!/bin/bash
set -e

echo "🔄 Rebuilding docs folder for GitHub Pages..."

# Remove any existing docs folder and create a new one
rm -rf docs
mkdir docs

# Copy entire contents of the original doc/ folder into docs/
cp -r doc/* docs/

echo "✅ All subdirectories from doc/ copied to docs."

# Create an index.html file in docs that links to a primary HTML file in each subfolder.
echo "Creating index.html in docs..."
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
  # Loop through every subdirectory in docs/
  for folder in docs/*/; do
    folderName=$(basename "$folder")
    
    # Look for index.html first; if not found, pick the first .html file.
    if [ -f "$folder/index.html" ]; then
      link="$folderName/index.html"
    else
      # Find any .html file in the folder
      htmlFile=$(find "$folder" -maxdepth 1 -type f -name "*.html" | head -n 1)
      if [ -n "$htmlFile" ]; then
        # Remove "docs/" prefix for the URL
        link=${htmlFile#docs/}
      else
        link=""
      fi
    fi
    
    if [ -n "$link" ]; then
      echo "    <li><a href=\"$link\">$folderName</a></li>"
    else
      echo "    <li>$folderName (No HTML file found)</li>"
    fi
  done
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docs/index.html

echo "✅ Index created in docs"
