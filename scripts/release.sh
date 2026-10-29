#!/usr/bin/env bash
# 发布流程：版本三处一致性校验 → 测试 → 构建 → 提交 → git tag vX.Y.Z
# 用法：npm version <patch|minor|major> && npm run release
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")
MANIFEST=$(node -p "require('./manifest.json').version")
VERSIONS=$(node -e "const v=require('./versions.json');const ks=Object.keys(v);console.log(ks[ks.length-1])")

if [ "$VERSION" != "$MANIFEST" ] || [ "$VERSION" != "$VERSIONS" ]; then
  echo "❌ 版本不一致：package.json=$VERSION manifest.json=$MANIFEST versions.json=$VERSIONS"
  echo "   请用 npm version <patch|minor|major> 统一提升，并在 CHANGELOG.md 记录。"
  exit 1
fi

echo "✅ 版本一致：$VERSION"
echo "— 运行测试…"
npm test
echo "— 构建…"
npm run build

TAG="v$VERSION"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "❌ tag $TAG 已存在，先删除或提升版本。"
  exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "— 工作区干净，直接打 tag。"
else
  git add -A
  git commit -m "release $TAG"
fi
git tag "$TAG"
echo "✅ 已打 tag $TAG（推送：git push origin main --tags）"
echo "发布产物：main.js manifest.json versions.json styles.css"
