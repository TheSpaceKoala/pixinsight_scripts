#!/bin/bash

set -e

echo "Rebuilding GitHub Pages docsForWebsite folder..."

rm -rf docsForWebsite
mkdir docsForWebsite

# Copy docs from scripts/
for dir in doc/scripts/*; do
  name=$(basename "$dir")
  mkdir -p "docsForWebsite/$name"
  cp -r "$dir"/* "docsForWebsite/$name/"
done

# Copy docs from docs/
for dir in doc/docs/*; do
  name=$(basename "$dir")
  mkdir -p "docsForWebsite/$name"
  cp -r "$dir"/* "docsForWebsite/$name/"
done

echo "Docs copied to /docsForWebsite"
