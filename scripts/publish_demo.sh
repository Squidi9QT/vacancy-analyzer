#!/usr/bin/env bash
# Publishes explainer/ to the gh-pages branch (GitHub Pages serves it).
# Usage: scripts/publish_demo.sh   (after committing changes in explainer/)
set -euo pipefail
cd "$(dirname "$0")/.."
git subtree split --prefix explainer -b gh-pages-tmp >/dev/null
git push -f origin gh-pages-tmp:gh-pages
git branch -D gh-pages-tmp >/dev/null
echo "Published: https://squidi9qt.github.io/vacancy-analyzer/"
