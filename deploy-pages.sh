#!/usr/bin/env bash
# Publish the static solo-vs-bots build to GitHub Pages (gh-pages branch).
set -e
cd "$(dirname "$0")"
TMP=$(mktemp -d)
cp -r public/* "$TMP"/
cp game-core.js local-core.js "$TMP"/
touch "$TMP/.nojekyll"
git -C "$TMP" init -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.name=rawrben89 -c user.email=tan.roben@gmail.com commit -qm "Deploy to GitHub Pages"
git -C "$TMP" push -f git@github-mahjong-game:rawrben89/mahjong-game.git gh-pages
rm -rf "$TMP"
echo "Deployed: https://rawrben89.github.io/mahjong-game/"
