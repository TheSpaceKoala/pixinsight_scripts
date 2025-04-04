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

echo "✅ Global JSON index created in docs/index.json"
