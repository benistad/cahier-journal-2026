#!/bin/bash
# Publie les modifications du cahier journal sur GitHub Pages
cd "$(dirname "$0")"
git add data.json docs/
git diff --cached --quiet && echo "Rien à publier." && exit 0
git commit -m "Mise à jour cahier journal – $(date '+%d/%m/%Y %H:%M')"
git push origin main
echo "✅ Publié sur https://benistad.github.io/cahier-journal-2026/"
