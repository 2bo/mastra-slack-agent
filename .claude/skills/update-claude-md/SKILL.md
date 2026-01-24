---
name: update-claude-md
description: セッション中に発見したプロジェクトの普遍的なルール・パターン・知見をCLAUDE.mdに反映する提案を行います。Trigger on "update claude.md", "CLAUDE.md更新", "ルールを追加", "これをルール化", "remember this".
---

# Update CLAUDE.md

セッション中に発見したプロジェクト固有の知見を分析し、CLAUDE.mdへの追加提案を行います。

## Instructions

このスキルが起動されたら、以下のステップを実行してください:

### 1. 現在のCLAUDE.mdを確認

```bash
# CLAUDE.mdの存在確認と内容読み取り
cat CLAUDE.md 2>/dev/null || echo "CLAUDE.md does not exist yet"
```

### 2. セッションから普遍的な知見を抽出

**以下の観点で会話履歴を分析:**

- 🔍 **コードパターン**: 繰り返し使われる実装パターン
- 📁 **ファイル構成**: プロジェクト固有のディレクトリ構造・命名規則
- ⚙️ **設定・ツール**: 使用しているツール、lint/format設定
- 🧪 **テスト慣習**: テストの書き方、配置場所
- 🔧 **デバッグ手法**: 効果的だったトラブルシューティング手順
- 📝 **コミット規約**: プロジェクト固有のコミットルール
- 🚫 **アンチパターン**: 避けるべき実装や設定
- 💡 **Tips**: 生産性を上げるコツ、ハマりやすいポイント

### 3. 普遍性の判定基準

**CLAUDE.mdに追加すべき内容:**

✅ **追加すべき（普遍的）:**
- 今後のセッションでも繰り返し必要になる情報
- プロジェクトの構造・アーキテクチャに関するルール
- チーム全体で共有すべきコーディング規約
- 環境構築・開発フローの手順
- 頻出するエラーの解決方法
- 依存関係やバージョンに関する重要な制約

❌ **追加すべきでない（一時的）:**
- 特定のタスクにのみ関連する情報
- すぐに古くなる一時的な回避策
- 個人の好みに過ぎない設定
- 既にドキュメント化されている内容の重複
- セキュリティ上機密にすべき情報

### 4. 提案フォーマット

CLAUDE.mdへの追加提案は以下の形式で行う:

```markdown
## 📝 CLAUDE.md 更新提案

### 追加理由
[なぜこの知見を追加すべきか]

### 追加セクション
[どのセクションに追加するか（新規/既存）]

### 提案内容
\`\`\`markdown
[追加するMarkdown内容]
\`\`\`

### 代替案（該当する場合）
[他の追加方法や、追加しない理由がある場合]
```

### 5. CLAUDE.mdの推奨構成

初めてCLAUDE.mdを作成する場合、または構成を見直す場合:

```markdown
# Project Name

## Overview
[プロジェクトの概要（1-2文）]

## Tech Stack
- [使用技術・フレームワーク]

## Development Setup
[開発環境のセットアップ手順]

## Project Structure
[主要ディレクトリの説明]

## Coding Conventions
[コーディング規約・スタイルガイド]

## Common Commands
[よく使うコマンド]

## Troubleshooting
[よくある問題と解決方法]

## Notes
[その他の重要な注意事項]
```

## Examples

### Example 1: 型定義パターンの発見

**セッション中の発見:**
「handlersのarg型はsrc/types/handlers.tsに集約している」

**提案:**
```markdown
## 📝 CLAUDE.md 更新提案

### 追加理由
ハンドラー関数の引数型定義の配置場所が明確になっており、
今後の開発でも一貫性を保つべきパターン。

### 追加セクション
Coding Conventions（新規または既存に追加）

### 提案内容
\`\`\`markdown
## Coding Conventions

### Type Definitions
- ハンドラー関数の引数型は `src/types/handlers.ts` に集約
- 型名は `{Handler名}Args` の命名規則に従う（例: `SlackMentionHandlerArgs`）
\`\`\`
```

### Example 2: 環境変数の追加

**セッション中の発見:**
「新しいSlack App設定にはSLACK_SIGNING_SECRETが必要」

**提案:**
```markdown
## 📝 CLAUDE.md 更新提案

### 追加理由
Slack webhook検証に必須の環境変数であり、
.env.exampleにも追記すべき設定。

### 追加セクション
Development Setup

### 提案内容
\`\`\`markdown
### Required Environment Variables

| Variable | Description |
|----------|-------------|
| SLACK_SIGNING_SECRET | Slack App の署名シークレット（webhook検証用） |
\`\`\`
```

### Example 3: トラブルシューティングの追加

**セッション中の発見:**
「Mastraのメモリ機能でresourceIdとentityNameの両方が必要」

**提案:**
```markdown
## 📝 CLAUDE.md 更新提案

### 追加理由
Mastraのメモリ機能でよくハマるポイントであり、
今後の開発で時間を節約できる。

### 追加セクション
Troubleshooting

### 提案内容
\`\`\`markdown
## Troubleshooting

### Mastra Memory

メモリ機能を使う際は `resourceId` と `entityName` の両方が必要:
- `resourceId`: リソース識別子（例: `user-123`）
- `entityName`: エンティティ識別子（例: `channel-456`）

この両方がないとメモリの取得・保存が正しく動作しない。
\`\`\`
```

## ユーザーへの確認

提案を行った後:

1. **確認を求める**: 「この内容をCLAUDE.mdに追加してよろしいですか？」
2. **修正を受け付ける**: ユーザーの修正要望を反映
3. **追加を実行**: 承認後にファイルを更新

## 自動検出のヒント

以下のような発言があった場合、このスキルの実行を提案:

- 「これ覚えておいて」「remember this」
- 「次回も使う」「再利用したい」
- 「いつもこうする」「毎回これ」
- 「ルールにしたい」「規約として」
- パターンを複数回説明した時
- トラブルシューティングを行った後
- 新しい設定やツールを導入した時

## Notes

- CLAUDE.mdは他のAIセッションでも参照されるため、簡潔で明確な記述を心がける
- 機密情報（APIキー、パスワード等）は絶対に含めない
- 既存の内容と重複しないよう確認してから追加
- 大きな変更の場合は段階的に追加することを提案
