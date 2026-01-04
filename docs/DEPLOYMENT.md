# 本番環境デプロイメント計画: Mastra Slack Agent

## 概要
Mastra Slack Agentをローカル開発環境から本番環境対応のクラウドデプロイメントに移行します。RailwayプラットフォームとTursoデータベース、構造化ロギング、包括的なセキュリティ強化を実装します。

**デプロイ先**: Railway (WebSocket対応、コールドスタートなし)
**データベース**: Turso (LibSQL Cloud) - ファイルベースSQLiteから移行
**監視**: Axiom (構造化ログ集約)
**セキュリティ**: ユーザーホワイトリスト、レート制限、入力検証
**推定コスト**: 月額$18-20

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

### 1.2 .dockerignoreの作成
**新規ファイル**: `.dockerignore`

ビルドコンテキストから除外:
- `node_modules`, `.env`, `mastra.db*`
- `.git`, `.github`, `.husky`
- ドキュメントとテストファイル
- ビルドコンテキストを ~200MB から ~5MB に削減

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

## フェーズ3: セキュリティ強化

### 3.1 シークレット露出の修正
**ファイル**: [src/scripts/get-google-token.ts:36](../src/scripts/get-google-token.ts#L36)

**現在の問題**: リフレッシュトークンがプレーンテキストでコンソールにログ出力される

**修正**: トークン出力をマスクまたは制限付き権限でファイルに保存
```typescript
// フルトークンのconsole.logを以下に置き換え:
console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token?.substring(0, 10) + '...[REDACTED]');
// そしてセキュアなファイルに書き込み:
fs.writeFileSync('.env.google-token', `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`, { mode: 0o600 });
```

### 3.2 ユーザーホワイトリスト
**新規ファイル**: `src/slack/middleware/user-authorization.ts`

認可されたSlackユーザーにボットアクセスを制限するミドルウェア:
- `ALLOWED_SLACK_USERS`環境変数に対して`event.user`をチェック
- ホワイトリストになければ認可エラーを返す
- ホワイトリストが未設定の場合は全員許可 (後方互換性)

**統合**: [src/index.ts:20](../src/index.ts#L20)
```typescript
import { checkUserAuthorization } from './slack/middleware/user-authorization';
app.event('app_mention', checkUserAuthorization);
```

**環境変数**: `ALLOWED_SLACK_USERS=U01234ABC,U56789DEF`

### 3.3 レート制限
**新規ファイル**: `src/slack/middleware/rate-limiter.ts`

`bottleneck`ライブラリを使用したユーザーごとのレート制限:
- ユーザーあたり1分間に10リクエスト
- ユーザーあたり最大2同時リクエスト
- ユーザーに「レート制限超過」メッセージを返す

**依存関係**: [package.json](../package.json)に追加:
```bash
npm install bottleneck
npm install -D @types/bottleneck
```

**統合**: [src/index.ts:21](../src/index.ts#L21)
```typescript
import { rateLimitMiddleware } from './slack/middleware/rate-limiter';
app.event('app_mention', rateLimitMiddleware);
```

### 3.4 入力検証
**新規ファイル**: `src/slack/middleware/input-validator.ts`

悪用を防ぐためのユーザー入力検証:
- メッセージ最大長: 4000文字
- 疑わしいパターンをブロック (XSS試行、パストラバーサル)
- 違反時にはユーザーに検証エラーを返す

**統合**: [src/index.ts:22](../src/index.ts#L22)
```typescript
import { validateInput } from './slack/middleware/input-validator';
app.event('app_mention', validateInput);
```

---

## フェーズ4: 監視とロギング

### 4.1 構造化ロギング
**新規ファイル**: `src/utils/logger.ts`

`console.log`をPino構造化ロギングに置き換え:
- `logger`, `slackLogger`, `agentLogger`, `toolLogger`をエクスポート
- 開発環境: きれいに整形されたカラー出力
- 本番環境: サービス/モジュールメタデータ付きJSONログ
- `LOG_LEVEL`環境変数で設定可能

**統合**: コードベース全体の`console.log`を置き換え:
- [src/index.ts:14,33,37](../src/index.ts#L14)
- [src/mastra/services/agent-executor.ts:81,104,135,161](../src/mastra/services/agent-executor.ts#L81)
- [src/mastra/tools/google-calendar.ts:128,131,145,153,165](../src/mastra/tools/google-calendar.ts#L128)
- [src/slack/utils/error-handler.ts](../src/slack/utils/error-handler.ts)

### 4.2 ログ集約 (Axiom)
**セットアップ**:
1. axiom.coでAxiomアカウント作成
2. データセット作成: `mastra-slack-prod`
3. Axiomダッシュボードから APIトークン取得

**依存関係**: [package.json](../package.json)に追加:
```bash
npm install pino-axiom
```

**設定**: `src/utils/logger.ts`をAxiomトランスポートで更新:
```typescript
transport: process.env.AXIOM_TOKEN ? {
  target: 'pino-axiom',
  options: {
    dataset: process.env.AXIOM_DATASET,
    token: process.env.AXIOM_TOKEN,
  }
} : undefined
```

**環境変数**:
- `AXIOM_TOKEN=xaat-...`
- `AXIOM_DATASET=mastra-slack-prod`
- `LOG_LEVEL=info`

### 4.3 ヘルスチェックエンドポイント
**新規ファイル**: `src/health-check.ts`

Railwayのヘルス監視用HTTPサーバー:
- `GET /health`: 稼働時間、メモリ使用量、タイムスタンプを返す
- `GET /ready`: 準備完了プローブ (Slack接続チェックに拡張可能)
- ポート3001で実行 (メインアプリとは別)

**統合**: [src/index.ts:15](../src/index.ts#L15)
```typescript
import { startHealthCheckServer } from './health-check';

async function main() {
  startHealthCheckServer(3001);
  // ... 既存のコード
}
```

**Dockerfile**: ヘルスチェックポートを公開
```dockerfile
EXPOSE 3000 3001
```

### 4.4 エラーアラート
**セットアップ**: Axiomモニター
- クエリ: `level == "error"`
- しきい値: 5分間で>5エラー
- アクション: Slack #alertsチャンネルへWebhook

[src/slack/utils/error-handler.ts](../src/slack/utils/error-handler.ts)を更新して完全なエラーコンテキストで構造化ロギングを使用。

---

## フェーズ5: Railwayデプロイメント

### 5.1 Railway設定
**新規ファイル**: `railway.toml`

Railwayデプロイメント用の設定:
- ビルダー: Dockerfile
- 起動コマンド: `node .mastra/output/index.mjs`
- ヘルスチェック: `/health`エンドポイント
- 再起動ポリシー: 失敗時、最大3回リトライ
- 環境: `NODE_ENV=production`

### 5.2 環境変数 (Railwayダッシュボード)
**必須のシークレット** (合計42個):
```bash
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-...

# OpenAI
OPENAI_API_KEY=sk-...

# Google Calendar
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_CALENDAR_ID=primary

# データベース (Turso)
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=eyJ...

# 監視
AXIOM_TOKEN=xaat-...
AXIOM_DATASET=mastra-slack-prod
LOG_LEVEL=info

# セキュリティ
ALLOWED_SLACK_USERS=U01234ABC,U56789DEF

# アプリケーション
NODE_ENV=production
TIMEZONE=Asia/Tokyo
```

### 5.3 代替プラットフォーム

**Render** (`render.yaml`):
- ⚠️ 無料プランは15分でスピンダウン (Socket Modeが壊れる)
- 永続的な接続にはStarterプラン ($7/月) を使用

**Fly.io** (`fly.toml`):
- より手動的なセットアップ
- シークレットごとに`flyctl secrets set`が必要
- マルチリージョンデプロイメントに適している

**推奨**: シンプルさとSocket Modeサポートのため Railway

---

## フェーズ6: CI/CDパイプライン

### 6.1 GitHub Actionsワークフロー
**新規ファイル**: `.github/workflows/deploy.yml`

自動デプロイメントパイプライン:
1. **テストジョブ**: すべてのPRとmainブランチプッシュで実行
   - 型チェック (`npm run typecheck`)
   - Lint (`npm run lint`)
   - テスト (`npm test`)
   - ビルド検証 (`npm run build`)

2. **デプロイジョブ**: mainブランチプッシュ時のみ実行 (テスト通過後)
   - `railway-deploy`アクションを使用してRailwayへデプロイ
   - 成功/失敗時にSlackへ通知

**必須シークレット** (GitHubリポジトリ設定):
- `RAILWAY_TOKEN`: Railwayダッシュボード → Settings → Tokensから取得
- `SLACK_DEPLOY_WEBHOOK`: デプロイ通知用Webhook URL

### 6.2 ステージング環境 (オプション)
- 別のRailwayサービスを作成: `mastra-slack-agent-staging`
- 別のTurso DBを作成: `mastra-slack-staging`
- `develop`ブランチからデプロイ
- `main`へマージ前にテスト

---

## フェーズ7: デプロイ実行チェックリスト

### デプロイ前 (ローカル)
- [ ] テスト実行: `npm test`
- [ ] 型チェック: `npm run typecheck`
- [ ] Lint: `npm run lint`
- [ ] ビルド: `npm run build`
- [ ] Dockerをローカルでテスト: `docker build -t mastra-slack-agent . && docker run --env-file .env mastra-slack-agent`
- [ ] `.env`がgitignoreされていることを確認
- [ ] ハードコードされたシークレットを監査: `git log -p | grep -i "token\|secret"`

### Tursoセットアップ
- [ ] Turso CLIインストール: `brew install tursodatabase/tap/turso`
- [ ] ログイン: `turso auth login`
- [ ] データベース作成: `turso db create mastra-slack-prod --location nrt`
- [ ] 接続URL取得: `turso db show mastra-slack-prod`
- [ ] 認証トークン作成: `turso db tokens create mastra-slack-prod`
- [ ] (オプション) データ移行: `turso db shell mastra-slack-prod < dump.sql`

### 監視セットアップ
- [ ] Axiomアカウント作成
- [ ] データセット作成: `mastra-slack-prod`
- [ ] ダッシュボードからAPIトークン取得
- [ ] エラーアラート設定 (5分間で>5エラー → Slack webhook)

### Railwayデプロイメント
- [ ] Railwayアカウント作成
- [ ] GitHubリポジトリ接続
- [ ] 新規プロジェクト作成: `mastra-slack-agent`
- [ ] 環境変数設定 (フェーズ5.2参照)
- [ ] ビルド方法設定: Dockerfile
- [ ] ヘルスチェックパス設定: `/health`
- [ ] 再起動ポリシー設定: 失敗時、3回リトライ
- [ ] デプロイ: `main`ブランチへプッシュまたは手動トリガー

### 検証
- [ ] Railwayログで"Slack Bolt app is running"を確認
- [ ] ヘルスエンドポイントテスト: `curl https://{app}.railway.app/health`
- [ ] Slackメンションテスト: `@YourBot hello`
- [ ] カレンダーテスト: `@YourBot show my calendar`
- [ ] HITL承認テスト: `@YourBot create event tomorrow at 2pm`
- [ ] Axiomダッシュボードでログを確認
- [ ] Tursoにデータがあることを確認 (Tursoダッシュボードをチェック)
- [ ] レート制限テスト: 15件の連続メッセージ送信
- [ ] 認可テスト: ホワイトリストにないユーザーからのメッセージ

### デプロイ後監視 (最初の24時間)
- [ ] Axiomでエラー率監視 (目標: <0.1%)
- [ ] メモリ使用量確認 (目標: <800MB)
- [ ] OpenAIコストが想定と一致することを確認
- [ ] WebSocket切断がないことを確認
- [ ] ユーザーフィードバックをレビュー

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

### 作成するファイル (9個の新規ファイル)
1. `Dockerfile` - マルチステージコンテナビルド
2. `.dockerignore` - ビルド最適化
3. `railway.toml` - Railway デプロイ設定
4. `src/utils/logger.ts` - 構造化ロギング
5. `src/health-check.ts` - ヘルスエンドポイント
6. `src/slack/middleware/user-authorization.ts` - ユーザーホワイトリスト
7. `src/slack/middleware/rate-limiter.ts` - レート制限
8. `src/slack/middleware/input-validator.ts` - 入力検証
9. `.github/workflows/deploy.yml` - CI/CDパイプライン

### 変更するファイル (6個の既存ファイル)
1. [src/mastra/index.ts:11-13](../src/mastra/index.ts#L11-L13) - Turso設定追加
2. [src/mastra/agents/assistant-agent.ts:29-34](../src/mastra/agents/assistant-agent.ts#L29-L34) - Turso設定追加 (2箇所)
3. [src/scripts/get-google-token.ts:36](../src/scripts/get-google-token.ts#L36) - シークレット露出修正
4. [src/index.ts](../src/index.ts) - ミドルウェアとヘルスチェック追加
5. [package.json](../package.json) - 依存関係追加: `bottleneck`, `pino-axiom`
6. 複数ファイル - `console.log`を構造化ロギングに置き換え

---

## コスト見積もり

**月額コスト**:
- Railway (1GB RAM): ~$10
- Turso: $0 (無料プラン)
- Axiom: $0 (無料プラン)
- OpenAI API: ~$8 (1日50会話)
- Google Calendar: $0 (無料プラン)

**合計: $18-20/月**

**コスト最適化**:
- 積極的なレート制限でOpenAI呼び出しを削減
- 簡単なクエリにはGPT-4o-miniを使用 (90%安い)
- OpenAIダッシュボードで予算アラート設定

---

## 成功指標

**運用**:
- 稼働率: >99.5%
- 応答時間: <3秒 (P95)
- エラー率: <0.1%

**セキュリティ**:
- 不正アクセスゼロ
- シークレット漏洩ゼロ
- すべてのレート制限が適用される

**コスト**:
- 月額コスト <$25
- 会話あたりコスト <$0.20

---

## 実装タイムライン

**1週目**: セキュリティとインフラストラクチャ
- セキュリティ問題修正、Dockerfile作成、Tursoセットアップ

**2週目**: 監視とデプロイメント
- ロギング実装、Axiomセットアップ、Railwayステージングへデプロイ

**3週目**: 本番とCI/CD
- 本番デプロイ、GitHub Actionsセットアップ、厳密な監視

**4週目**: 最適化
- 使用状況分析、コスト最適化、アラート改善
