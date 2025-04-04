#!/bin/bash
set -e

echo "🔄 Rebuilding docs folder for GitHub Pages..."

# Remove any existing docs folder and create a new one.
rm -rf docs
mkdir docs

# Copy all subdirectories from the original doc/ folder into docs.
# This will copy subfolders such as doc/scripts, doc/docs, etc.
for dir in doc/*/; do
  name=$(basename "$dir")
  mkdir -p "docs/$name"
  cp -r "$dir"/* "docs/$name/"
done

echo "✅ All subdirectories from doc/ copied to docs."

# Create an index.html file in docs that links to each subfolder's HTML file.
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
  # Iterate over every subdirectory in docs/
  for d in docs/*/; do
    folder=$(basename "$d")
    # Find the first .html file in the subdirectory.
    htmlfile=$(find "docs/$folder" -maxdepth 1 -type f -name "*.html" | head -n 1)
    if [ -n "$htmlfile" ]; then
      # Remove the "docs/" prefix so the link is relative to the site root.
      href=${htmlfile#docs/}
      echo "    <li><a href=\"$href\">$folder</a></li>"
    else
      echo "    <li>$folder (No HTML file found)</li>"
    fi
  done
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docs/index.html

echo "✅ Index created in docs"
