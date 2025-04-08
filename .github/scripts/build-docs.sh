#/bin/bash
set -e

echo "🔄 Rebuilding docs folder for GitHub Pages..."

# Remove any existing docs folder and create a new one.
rm -rf docs
mkdir docs

# Copy everything from doc/ into docs/ (all contents, not the doc/ folder itself)
cp -R doc/. docs/

echo "✅ Copied entire content of doc/ into docs/"

# Generate index.html in docs/ that lists HTML files only in:
#   - docs/scripts/*/*.html
#   - docs/docs/*/*.html
echo "Creating index.html in docs..."
(
  echo "<!DOCTYPE html>"
  echo "<html lang='en'>"
  echo "<head>"
  echo "  <meta charset='UTF-8'>"
  echo "  <title>PixInsight Scripts</title>"
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
  echo "  <h1>PixInsight Scripts</h1>"
  echo "  <ul>"
  
  # List HTML files in docs/scripts/*/*.html
  find docs/scripts -mindepth 2 -maxdepth 2 -type f -name "*.html" | while read htmlfile; do
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

# Generate a JSON index listing HTML files in docs/scripts/*/*.html and docs/docs/*/*.html
echo "Creating index.json in docs..."
(
  echo "["
  firstEntry=true
  for d in docs/scripts/*/ docs/docs/*/; do
      for htmlfile in "$d"*.html; do
          # Skip if the file is index.html of the global index
          if [[ "$htmlfile" == "docs/index.html" ]]; then
              continue
          fi
          # Determine the title (use the basename without extension)
          title=$(basename "$htmlfile" .html)
          # Determine the relative URL by stripping the docs/ prefix
          relpath=${htmlfile#docs/}
          if [ "$firstEntry" = true ]; then
            firstEntry=false
          else
            echo ","
          fi
          echo "  { \"title\": \"${title}\", \"url\": \"${relpath}\" }"
      done
  done
  echo ""
  echo "]"
) > docs/index.json

echo "Global JSON index created in docs/index.json"

echo "Adding styled Back button to all HTML files..."

for htmlfile in docs/scripts/*/*.html docs/docs/*/*.html; do
  if [[ "$htmlfile" == "docs/index.html" ]]; then
    continue
  fi

  sed -i 's|<body>|<body>\n  <div style="position: fixed; top: 10px; left: 80px; background: #f8f8f8; padding: 5px 12px; border-radius: 8px; z-index: 9999; font-family: sans-serif; font-size: 14px;"><a href="../../index.html" style="text-decoration: none; color: #000;">← Back</a></div>|' "$htmlfile"

echo "Fixed-position Back buttons added to all HTML files"
