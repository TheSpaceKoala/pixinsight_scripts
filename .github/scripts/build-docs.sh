#!/bin/bash
set -e

echo "🔄 Rebuilding docs folder for GitHub Pages..."

# Remove any existing docs folder and create a new one.
rm -rf docs
mkdir docs

# Copy EVERYTHING from doc/ to docs/ (including hidden files)
rsync -av --progress doc/ docs/

echo "✅ Copied all contents from doc/ to docs/"

# Generate index.html in docs/ that only lists HTML files found in:
#   - docs/scripts/*/*.html
#   - docs/docs/*/*.html
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
  
  # List HTML files in docs/scripts/*/*.html
  find docs/scripts -mindepth 2 -maxdepth 2 -type f -name "*.html" | while read htmlfile; do
      # Remove the leading "docs/" to form a relative URL
      relpath=${htmlfile#docs/}
      label=$(basename "$htmlfile" .html)
      echo "    <li><a href=\"$relpath\">$label</a></li>"
  done
  
  # List HTML files in docs/docs/*/*.html
  find docs/docs -mindepth 2 -maxdepth 2 -type f -name "*.html" | while read htmlfile; do
      relpath=${htmlfile#docs/}
      label=$(basename "$htmlfile" .html)
      echo "    <li><a href=\"$relpath\">$label</a></li>"
  done
  
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docs/index.html

echo "✅ Global index created in docs/index.html"
