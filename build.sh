#!/bin/bash
set -e

echo "📦 Building kiro-cecli-sync extension..."

# Install deps if needed
if [ ! -d node_modules ]; then
  echo "→ Installing dependencies..."
  npm install
fi

# Compile TypeScript
echo "→ Compiling TypeScript..."
npx tsc -p ./

# Package as VSIX
echo "→ Packaging VSIX..."
npx vsce package --no-dependencies --no-git-tag-version

echo ""
echo "✅ Done! Install with:"
echo "   code --install-extension kiro-cecli-sync-*.vsix"
