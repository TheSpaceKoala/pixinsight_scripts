#!/bin/bash
set -e

echo "🔄 Rebuilding docs folder..."

# Remove any existing docsForWebsite folder and create a new one
rm -rf docs
mkdir docs

# Copy docs from doc/scripts into docsForWebsite
for dir in doc/scripts/*; do
  name=$(basename "$dir")
  mkdir -p "docs/$name"
  cp -r "$dir"/* "docs/$name/"
done

# Copy docs from doc/docs into docsForWebsite
for dir in doc/docs/*; do
  name=$(basename "$dir")
  mkdir -p "docs/$name"
  cp -r "$dir"/* "docs/$name/"
done

echo "Docs copied to docs"

# Create an index.html file in docsForWebsite listing all subdirectories
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
  for d in docs/*/; do
    dir=$(basename "$d")
    echo "    <li><a href=\"$dir/\">$dir</a></li>"
  done
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docs/index.html

echo "Index created in docs"
