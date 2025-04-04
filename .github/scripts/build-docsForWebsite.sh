#!/bin/bash
set -e

echo "🔄 Rebuilding docsForWebsite folder..."

# Remove any existing docsForWebsite folder and create a new one
rm -rf docsForWebsite
mkdir docsForWebsite

# Copy docs from doc/scripts into docsForWebsite
for dir in doc/scripts/*; do
  name=$(basename "$dir")
  mkdir -p "docsForWebsite/$name"
  cp -r "$dir"/* "docsForWebsite/$name/"
done

# Copy docs from doc/docs into docsForWebsite
for dir in doc/docs/*; do
  name=$(basename "$dir")
  mkdir -p "docsForWebsite/$name"
  cp -r "$dir"/* "docsForWebsite/$name/"
done

echo "Docs copied to docsForWebsite"

# Create an index.html file in docsForWebsite listing all subdirectories
echo "Creating index.html in docsForWebsite..."
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
  for d in docsForWebsite/*/; do
    dir=$(basename "$d")
    echo "    <li><a href=\"$dir/\">$dir</a></li>"
  done
  echo "  </ul>"
  echo "</body>"
  echo "</html>"
) > docsForWebsite/index.html

echo "Index created in docsForWebsite"
