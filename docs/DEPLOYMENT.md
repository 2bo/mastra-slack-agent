# 本番環境デプロイメント計画: Mastra Slack Agent

## 概要

Mastra Slack Agentを**月額$0-5**でクラウドデプロイします。

**コスト**: 月額$0-5
**所要時間**: 30-60分
**必要なもの**:
- Dockerコンテナ化
- Tursoクラウドデータベース (無料)
- Railwayへのデプロイ

---

**基本スペック**:
- **デプロイ先**: Railway（常時稼働）
- **Slack接続**: Socket Mode（推奨）または Events API
- **データベース**: Turso (LibSQL Cloud) - ファイルベースSQLiteから移行
- **推定コスト**: 月額$0-5

### Slack接続モードについて

**Socket Mode（デフォルト）**:
- ✅ 公開URL不要
- ✅ ファイアウォール越え可能
- ⚠️ Docker/コンテナ環境で稀に接続が切れる報告あり（[#1652](https://github.com/slackapi/node-slack-sdk/issues/1652), [#1906](https://github.com/slackapi/bolt-js/issues/1906)）
- 設定: `SLACK_SOCKET_MODE=true` + `SLACK_APP_TOKEN`
- 本プロジェクトは最新のsocket-mode v2を使用（多くの問題は修正済み）

**Events API（代替案）**:
- ✅ より安定した配信
- ⚠️ 公開URLが必要（RailwayのドメインをSlack App設定に追加）
- 設定: `SLACK_SOCKET_MODE=false`（SLACK_APP_TOKEN不要）

**推奨**: Socket Modeで開始し、接続問題が頻発する場合のみEvents APIに切り替える

---

## フェーズ1: コンテナ化 (Docker構築)

### 1.1 Dockerfileの作成
**新規ファイル**: `Dockerfile`

Node.js 22 ES modules向けにマルチステージビルドで最適化:
- ステージ1: 本番依存関係をインストール
- ステージ2: `mastra build`でアプリケーションをビルド
- ステージ3: tsx実行環境 (ESMネイティブ対応)
- セキュリティのため非rootユーザーで実行
- 最終イメージサイズ: ~150MB

主な設計判断:
- `node:22-alpine`を使用して最小フットプリント
- ソースファイルを含める (tsx実行に必要)
- `.mastra/output`ビルド成果物をコピー
- データベースファイルは含めない (Tursoへ移行)
- CMD: `npx tsx src/index.ts`

### 1.2 .dockerignoreの作成（オプション）
**新規ファイル**: `.dockerignore`

ビルド高速化のため、不要なファイルを除外できます（必須ではありません）。

---

## フェーズ2: Tursoへのデータベース移行

### 2.1 Tursoデータベースのセットアップ
**前提条件**: Turso CLIをローカルにインストール
```bash
brew install tursodatabase/tap/turso
turso auth login
turso db create mastra-slack-prod --location nrt
turso db tokens create mastra-slack-prod
```

出力を保存:
- `TURSO_DATABASE_URL`: libsql://mastra-slack-prod-{org}.turso.io
- `TURSO_AUTH_TOKEN`: eyJ...

### 2.2 Turso対応のコード変更

**ファイル1**: [src/mastra/index.ts:11-13](../src/mastra/index.ts#L11-L13)
```typescript
// 現在:
storage: new LibSQLStore({
  url: 'file:mastra.db',
}),

// 以下に置き換え:
storage: new LibSQLStore({
  url: process.env.TURSO_DATABASE_URL || 'file:mastra.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
}),
```

**ファイル2**: [src/mastra/agents/assistant-agent.ts:29-34](../src/mastra/agents/assistant-agent.ts#L29-L34)
```typescript
// 現在 (2箇所):
storage: new LibSQLStore({
  url: 'file:mastra.db',
}),
vector: new LibSQLVector({
  connectionUrl: 'file:mastra.db',
}),

// 以下に置き換え:
storage: new LibSQLStore({
  url: process.env.TURSO_DATABASE_URL || 'file:mastra.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
}),
vector: new LibSQLVector({
  connectionUrl: process.env.TURSO_DATABASE_URL || 'file:mastra.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
}),
```

**利点**: `file:mastra.db`へのフォールバックでローカル開発が変更なく継続可能。

---

## フェーズ3: Railwayデプロイメント (最小構成)

このフェーズで**すぐに動くSlack Botをデプロイ**できます。

### 3.1 Railway設定
**新規ファイル**: `railway.toml`

最小構成のRailwayデプロイメント設定:
- ビルダー: Dockerfile
- 起動コマンド: `npx tsx src/index.ts`
- 環境: `NODE_ENV=production`

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "npx tsx src/index.ts"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

### 3.2 環境変数 (Railwayダッシュボード)
**最小構成の必須シークレット** (11個):
```bash
# Slack (必須)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-...

# OpenAI (必須)
OPENAI_API_KEY=sk-...

# Google Calendar (必須)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary

# データベース - Turso (必須)
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=eyJ...

# アプリケーション (オプション)
NODE_ENV=production
TIMEZONE=Asia/Tokyo
```

**注意**:
- Axiom、レート制限などの環境変数は最小構成では不要
- 後から追加可能

### 3.3 Railwayへのデプロイ手順

1. **Railwayアカウント作成**
   - railway.app にアクセス
   - GitHubアカウントで登録 (無料)

2. **GitHubリポジトリ接続**
   - New Project → Deploy from GitHub repo
   - このリポジトリを選択

3. **環境変数設定**
   - Variables タブで上記の環境変数を設定
   - 特に `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を忘れずに

4. **デプロイ実行**
   - Railwayが自動的にDockerfileを検出してビルド
   - ログで "Slack Bolt app is running" を確認

5. **動作確認**
   - Slackで `@YourBot hello` とメンション
   - カレンダー確認: `@YourBot show my calendar`

### 3.4 Railway無料プランの制限

**無料プラン**:
- 初回30日間: $5クレジット
- 以降: 月$1クレジット (非累積)
- メモリ使用量を512MB以下に抑えることを推奨

**超過時の対応**:
- Railwayは従量課金に自動移行
- 予算アラート設定を推奨 (Settings → Usage Limits)

---

## ✅ デプロイ完了!

ここまでで**月額$0-5でSlack Botが稼働**します。

---

## デプロイ実行チェックリスト (最小構成)

### ステップ1: デプロイ前準備 (ローカル)
- [ ] ビルドが成功することを確認: `npm run build`
- [ ] 型チェック: `npm run typecheck`
- [ ] Dockerfileが存在することを確認
- [ ] `.env`がgitignoreされていることを確認

### ステップ2: Tursoデータベースセットアップ
- [ ] Turso CLIインストール: `brew install tursodatabase/tap/turso`
- [ ] ログイン: `turso auth login`
- [ ] データベース作成: `turso db create mastra-slack-prod --location nrt`
- [ ] 接続URL取得: `turso db show mastra-slack-prod`
- [ ] 認証トークン作成: `turso db tokens create mastra-slack-prod`
- [ ] (オプション) データ移行: `turso db shell mastra-slack-prod < dump.sql`

### ステップ3: Railwayデプロイメント
- [ ] Railwayアカウント作成
- [ ] GitHubリポジトリ接続
- [ ] 新規プロジェクト作成: `mastra-slack-agent`
- [ ] 環境変数設定 (フェーズ3.2の最小構成11個を設定)
- [ ] デプロイ実行: Railwayが自動的にDockerfileを検出してビルド

### ステップ4: 動作確認
- [ ] Railwayログで"Slack Bolt app is running"を確認
- [ ] Slackメンションテスト: `@YourBot hello`
- [ ] カレンダーテスト: `@YourBot show my calendar`
- [ ] HITL承認テスト: `@YourBot create event tomorrow at 2pm`
- [ ] Tursoダッシュボードでデータが保存されていることを確認

### ステップ5: 初期監視 (最初の24時間)
- [ ] Railwayログでエラーがないことを確認
- [ ] メモリ使用量確認 (目標: <512MB、無料枠内)
- [ ] OpenAIコストが想定と一致することを確認 ($1-3/月程度)
- [ ] WebSocket切断がないことを確認
- [ ] Railway使用量ダッシュボードで$5クレジット内に収まっているか確認

---

## ロールバック戦略

**デプロイ起動失敗時**:
1. Railwayログでエラー確認
2. 環境変数を検証
3. Railwayダッシュボード → Deployments → 前のデプロイ → Redeployでロールバック

**データベース接続問題時**:
1. Tursoデータベースがアクセス可能か確認: `turso db show mastra-slack-prod`
2. 認証トークン再生成: `turso db tokens create mastra-slack-prod`
3. Railwayで`TURSO_AUTH_TOKEN`を更新
4. サービス再起動

**緊急ロールバック**:
```bash
railway rollback
```

---

## 重要ファイル一覧

### 作成するファイル (最小構成)
1. `Dockerfile` - ✅ 既存
2. `.dockerignore` - ビルド最適化（オプション）
3. `railway.toml` - Railway デプロイ設定

### 変更するファイル（Turso対応のみ）
1. [src/mastra/index.ts:11-13](../src/mastra/index.ts#L11-L13) - Turso環境変数対応
2. [src/mastra/agents/assistant-agent.ts:29-34](../src/mastra/agents/assistant-agent.ts#L29-L34) - Turso環境変数対応

---

## コスト見積もり

### 💰 無料プラン構成 (推奨開始点)

**月額コスト: $0-5**
- Railway無料プラン: $0 (初回30日$5クレジット、以降月$1クレジット)
- Turso: $0 (無料プラン - 500MB、月間10億行読取)
- OpenAI API: $1-3 (1日10-20会話、GPT-4o-mini使用)
- Google Calendar: $0 (無料プラン)
- 監視: $0 (Railwayの基本ログのみ)

**合計: $1-5/月** (軽量使用なら無料枠内)

**無料枠で収める条件**:
- メモリ使用量を512MB以下に抑える
- OpenAI APIは1日20会話以下
- GPT-4o-miniモデルを優先使用
- Axiomなどの外部監視ツールは使わない

---

## 成功指標

**運用**:
- Slack Botが24時間応答可能
- 応答時間: <5秒
- Railwayログにエラーがない

**コスト**:
- 月額コスト: $0-5 (無料枠内)
- OpenAI API: $1-3/月

---

## 実装タイムライン

**所要時間: 30-60分**

1. **準備** (10分)
   - Dockerfile確認 (既に作成済み)
   - railway.toml作成

2. **Tursoセットアップ** (10分)
   - Turso CLIインストール
   - データベース作成、トークン取得

3. **Railwayデプロイ** (20分)
   - アカウント作成、リポジトリ接続
   - 環境変数設定 (11個)
   - デプロイ実行

4. **動作確認** (10-20分)
   - Slackでテスト
   - ログ確認
