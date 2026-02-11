#!/bin/bash
set -eo pipefail

# Claude Code Web 環境でのみ実行
[[ "$CLAUDE_CODE_REMOTE" == "true" ]] || exit 0

LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"
export PATH="$LOCAL_BIN:$PATH"

# インストール済みでなければインストール
if ! command -v gh &>/dev/null; then
  VERSION=$(curl -sL "https://api.github.com/repos/cli/cli/releases/latest" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
  [[ -n "$VERSION" ]] || { echo "Failed to get gh version"; exit 1; }

  curl -sL "https://github.com/cli/cli/releases/download/v${VERSION}/gh_${VERSION}_linux_amd64.tar.gz" \
    | tar -xz --strip-components=2 -C "$LOCAL_BIN" "gh_${VERSION}_linux_amd64/bin/gh"
  chmod +x "$LOCAL_BIN/gh"

  [[ -n "$CLAUDE_ENV_FILE" ]] && echo "export PATH=\"$LOCAL_BIN:\$PATH\"" >> "$CLAUDE_ENV_FILE"
  echo "Installed gh v${VERSION}"
fi

# 動作確認: バイナリが実行可能か & 認証が通るか
gh auth status || { echo "gh auth failed: GITHUB_TOKEN or GH_TOKEN may be missing/expired"; exit 1; }
