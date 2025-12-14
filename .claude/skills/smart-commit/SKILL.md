---
name: smart-commit
description: Create well-structured, atomic commits following Conventional Commits specification. Use when committing changes, reviewing staged files, or organizing commits. Detects credentials and enforces best practices.
---

# Smart Commit

コミットのベストプラクティスに従い、Conventional Commits 仕様に準拠した高品質なコミットを作成します。

## Instructions

コミットを作成する際は、以下のステップを必ず実行してください:

### 1. 変更内容の分析

```bash
git status
git diff --staged
```

- ステージングされた変更を確認
- 未ステージの変更も確認
- 変更されたファイルを論理的にグループ化

### 2. Atomic Commits の原則

**必ず守るべきルール:**

- ✅ **1つのコミット = 1つの論理的な変更単位**
  - 単一の機能追加、バグ修正、リファクタリングなど
  - コミット後もコードが実行可能な状態を保つ
  - テストが通る状態を維持

- ✅ **異なる関心事は分割する**
  - フォーマット変更とロジック変更は別コミット
  - 複数の機能は別コミット
  - 依存関係のない変更は別コミット

- ✅ **git add -p を活用**
  - 1つのファイルに複数の論理的変更がある場合
  - インタラクティブに変更を選択してステージング

**分割が必要な例:**
```
❌ Bad: "Update auth and fix CSS"
✅ Good:
  - Commit 1: "feat(auth): add password reset functionality"
  - Commit 2: "fix(ui): correct button alignment on login page"
```

### 3. Conventional Commits 仕様

**フォーマット:**
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**必須要素:**

- **type**: 変更の種類（必須）
  - `feat`: 新機能
  - `fix`: バグ修正
  - `docs`: ドキュメントのみの変更
  - `style`: コードの意味に影響しない変更（空白、フォーマット、セミコロンなど）
  - `refactor`: バグ修正や機能追加ではないコード変更
  - `perf`: パフォーマンス改善
  - `test`: テストの追加や修正
  - `build`: ビルドシステムや外部依存関係の変更（npm, webpack など）
  - `ci`: CI設定ファイルやスクリプトの変更
  - `chore`: その他の変更（.gitignore など）
  - `revert`: 以前のコミットの取り消し

- **description**: 簡潔な説明（50文字以内推奨）
  - 現在形の命令形を使用（"add" not "added"）
  - 最初の文字は小文字
  - 末尾にピリオドを付けない

- **scope** (オプション): 影響範囲
  - `(auth)`, `(api)`, `(ui)`, `(db)` など

**Body（オプション）:**
- 変更の動機と以前の動作との対比を説明
- description から1行空ける
- 72文字で折り返す

**Footer（オプション）:**
- `BREAKING CHANGE:` 破壊的変更の説明
- `Closes #123` イシューの参照

**例:**
```
feat(auth): add OAuth2 authentication

Implement OAuth2 flow with Google and GitHub providers.
This replaces the basic auth system to improve security
and user experience.

BREAKING CHANGE: Basic auth endpoints have been removed.
Users must migrate to OAuth2.

Closes #456
```

### 4. クレデンシャル検出

**コミット前に必ずチェック:**

- ❌ **絶対にコミットしてはいけないもの:**
  - API キー、トークン、パスワード
  - `.env` ファイル（.gitignoreに追加）
  - `config.yml` や設定ファイル内の認証情報
  - プライベートキー（SSH、SSL証明書など）
  - データベース接続文字列
  - AWS credentials, GCP service account keys

- ✅ **検出パターン:**
  ```bash
  # コミット前に以下をチェック
  git diff --staged | grep -E '(API_KEY|SECRET|PASSWORD|TOKEN|credentials)'
  ```

- ⚠️ **もし見つかった場合:**
  1. 即座にコミットを中止
  2. 該当ファイルを .gitignore に追加
  3. 環境変数や設定管理ツールを使用
  4. すでにコミットしてしまった場合は、即座にキーをローテーション

**推奨される保護手段:**
- `.gitignore` で機密ファイルを除外
- 環境変数（`.env.example` のみコミット）
- git-secrets や detect-secrets などのツール導入

### 5. コミットメッセージのベストプラクティス

**DO:**
- ✅ 変更の「なぜ」を説明（「何を」はdiffでわかる）
- ✅ チームメンバーが理解できる言葉を使う
- ✅ 未来の自分が理解できるよう書く
- ✅ 頻繁にコミット（完璧になる前にコミット、公開前に整理）

**DON'T:**
- ❌ "WIP", "fix", "update" だけのメッセージ
- ❌ 複数の無関係な変更を1つのコミットに
- ❌ コミットメッセージで謝罪や言い訳
- ❌ 65文字を超えるサブジェクト行

### 6. コミットワークフロー

```bash
# 1. 変更内容の確認
git status
git diff

# 2. 論理的な単位でステージング
git add -p  # インタラクティブにハンク選択
# または
git add specific-file.js  # 特定ファイル

# 3. ステージングされた内容を確認
git diff --staged

# 4. クレデンシャルチェック
git diff --staged | grep -iE '(api[_-]?key|secret|password|token|credential|private[_-]?key)'

# 5. コミット作成（このスキルで生成されたメッセージを使用）
git commit -m "type(scope): description"

# 6. 必要に応じてコミットを分割・整理
git rebase -i HEAD~3  # 直近3コミットを対話的に編集
```

### 7. コミット後の確認

```bash
# コミット履歴を確認
git log --oneline -5

# 各コミットの内容を確認
git show HEAD
```

## Examples

### Example 1: 機能追加
```
feat(slack): add message reaction handler

Implement handler for slack message reactions to trigger
workflow events. Includes event parsing and validation.
```

### Example 2: バグ修正
```
fix(api): prevent duplicate webhook deliveries

Add idempotency check using request IDs to prevent
processing the same webhook multiple times.

Closes #234
```

### Example 3: 破壊的変更
```
feat(auth)!: migrate to token-based authentication

Replace session-based auth with JWT tokens for improved
scalability and stateless architecture.

BREAKING CHANGE: Session cookies are no longer supported.
Clients must update to use Authorization header with JWT.
```

### Example 4: 複数ファイルを論理的に分割

**シナリオ:** `auth.ts` と `api.ts` に変更がある場合

```bash
# auth.ts の変更のみステージング
git add auth.ts
git commit -m "feat(auth): add password validation"

# api.ts の変更をステージング
git add api.ts
git commit -m "refactor(api): extract error handler"
```

## コミット実行時のチェックリスト

私（Claude）がコミットを提案する前に確認すること:

- [ ] git diff --staged で変更内容を確認済み
- [ ] 変更は1つの論理的な単位か？（そうでなければ分割を提案）
- [ ] コミット後もコードが実行可能か？
- [ ] クレデンシャル情報が含まれていないか？
- [ ] Conventional Commits 仕様に準拠しているか？
- [ ] Subject line は50文字以内か？
- [ ] Body（必要な場合）は72文字で折り返しているか？

## 参考リンク

- [Conventional Commits 仕様](https://www.conventionalcommits.org/)
- [Atomic Commits ガイド](https://www.freshconsulting.com/insights/blog/atomic-commits/)
- [Git Best Practices](https://sethrobertson.github.io/GitBestPractices/)

## Notes

このスキルは以下の場合に自動的に起動されます:
- ユーザーがコミットを作成したい時
- "commit" や "コミット" という単語を含むリクエスト
- git の変更をレビューする時
