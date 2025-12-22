# Mastra Slack Agent

Mastra と Slack を統合した AI アシスタントシステムです。
Slackのメンションに反応し、Google Calendar の管理や会話を通じて日常業務をサポートします。

## 主な機能

- 🤖 **AI アシスタント**: GPT-4oを使用した対話型パーソナルアシスタント
- 💬 **Slack統合**: Socket Mode / Events API による双方向連携
- 📅 **Google Calendar管理**: 予定の検索・一覧表示・作成
- ✅ **Human-in-the-Loop (HITL)**: 重要な操作（カレンダーイベント作成など）は承認フロー付き
- 🧠 **会話メモリ**: LibSQLによる会話履歴とセマンティック検索

## アーキテクチャ

```
User (Slack)
    ↓ mention
Assistant Agent
    ↓ (tools)
Google Calendar API
```

実装されているエージェント:
- **Assistant Agent** ([src/mastra/agents/assistant-agent.ts](src/mastra/agents/assistant-agent.ts)):
  - Google Calendar の操作（listEvents, searchEvents, createEvent）
  - 会話メモリによる過去のやり取りの記憶
  - セマンティック検索による関連情報の想起

## 前提条件 (Prerequisites)

### 1. Google Cloud Platform プロジェクトの設定

- **Google Calendar API** を有効化してください。
- **OAuth 同意画面 (Consent Screen)** を設定：
  - **User Type**: 個人の `@gmail.com` アカウントの場合は **External (外部)** を選択（**必須**）
  - **公開ステータス (Publishing Status)**: **Testing (テスト中)** に設定
  - **テストユーザー**: 自分のメールアドレスを追加
- **OAuth 2.0 クライアント認証情報** を作成：
  - アプリケーションの種類: **Desktop App (デスクトップアプリ)** を選択
  - _注: デスクトップアプリの場合、`http://localhost` へのリダイレクトはデフォルトで許可されます_

### 2. Slack App の作成

1. [Slack API](https://api.slack.com/apps) にアクセスし、新しいアプリを作成
2. **OAuth & Permissions** で以下のBot Token Scopesを追加:
   - `app_mentions:read` - メンションの受信
   - `chat:write` - メッセージ送信
   - `channels:history` - チャンネル履歴の読み取り
3. **Event Subscriptions** を有効化し、`app_mention` イベントをサブスクライブ
4. **Socket Mode** を有効化（開発環境推奨）:
   - App-Level Token を生成（スコープ: `connections:write`）
5. アプリをワークスペースにインストール

## セットアップ手順 (Setup Steps)

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env` ファイルを作成し、以下の値を設定してください:

```bash
# Google Calendar API
GOOGLE_CLIENT_ID=your_client_id_from_gcp
GOOGLE_CLIENT_SECRET=your_client_secret_from_gcp
GOOGLE_REFRESH_TOKEN=  # 次のステップで取得

# Slack
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_SOCKET_MODE=true
SLACK_APP_TOKEN=xapp-your-app-token

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# Optional
TIMEZONE=Asia/Tokyo
PORT=3000
```

### 3. Google Refresh Token の取得

認証用スクリプトを実行して、Refresh Token を取得します:

```bash
npx tsx src/scripts/get-google-token.ts
```

1. ブラウザが自動的に開きます（またはコンソールのURLを開いてください）
2. Google アカウントでログインし、権限を許可
3. コンソールに表示される `GOOGLE_REFRESH_TOKEN=...` を `.env` に追記

### 4. 型チェックとビルド確認

```bash
npm run typecheck
npm run build
```

### 5. アプリケーションの起動

#### 開発環境（推奨）

TypeScriptを直接実行:

```bash
npm run start:slack
```

#### 本番環境

ビルド後に実行:

```bash
npm run build
npm start
```

以下のようなログが表示されれば起動成功です:

```
Starting Mastra Slack Agent...
⚡️ Slack Bolt app is running in Socket Mode!
🚀 Application is ready!
```

## 使い方

### Slack で使う

1. Slack の任意のチャンネルにボットを招待
2. `@YourBot 明日の予定を教えて` のようにメンション
3. カレンダーイベント作成時は承認ボタンが表示されます

**使用例:**

```
@YourBot 明日の予定を教えて
@YourBot 明日の15時に「開発会議」を入れて
@YourBot 来週の月曜日の予定は?
```

### Mastra Playground で使う（開発用）

Mastra Playground を使ってブラウザから直接エージェントをテストできます:

```bash
npm run dev
```

Playground (通常 `http://localhost:3000`) にアクセスしてエージェントと会話できます。

**注意**: Playground モードでは Slack 連携は動作しません。Slack Bot として動かすには `npm run start:slack` を使用してください。

## プロジェクト構造

```
src/
├── index.ts                    # アプリケーションエントリーポイント
├── mastra/
│   ├── index.ts               # Mastraインスタンス
│   ├── agents/
│   │   └── assistant-agent.ts # AIアシスタントエージェント
│   ├── tools/
│   │   └── google-calendar.ts # Google Calendar ツール
│   └── services/
│       └── agent-executor.ts  # エージェント実行サービス
├── slack/
│   ├── bolt-app.ts            # Slack Bolt アプリ初期化
│   ├── constants.ts           # Slack関連定数
│   ├── handlers/
│   │   ├── mention-handler.ts # メンションイベント処理
│   │   ├── action-handler.ts  # ボタンアクション処理
│   │   └── view-handler.ts    # モーダル送信処理
│   ├── ui/
│   │   └── approval-blocks.ts # 承認UIブロック
│   └── utils/
│       ├── chat-stream.ts     # ストリーミングチャット処理
│       ├── metadata.ts        # Slackメタデータ管理
│       ├── thread-id.ts       # スレッドID管理
│       ├── id-parser.ts       # ID解析ユーティリティ
│       └── error-handler.ts   # エラーハンドリング
├── scripts/
│   └── get-google-token.ts    # Google認証トークン取得スクリプト
└── tests/
    └── hitl-simulation.ts     # HITLシミュレーションテスト
```

## 開発

### 利用可能なコマンド

```bash
# 開発・起動
npm run dev          # Mastra Playground起動（ブラウザでテスト）
npm run dev:slack    # Slack Bot起動（開発モード・TypeScript直接実行）
npm run start:slack  # Slack Bot起動（開発モード）※dev:slackと同じ
npm run build        # 本番用ビルド
npm start            # 本番用起動（ビルド後）

# テスト
npm test             # ユニットテスト実行

# コード品質
npm run typecheck    # TypeScript型チェック
npm run lint         # リント実行
npm run lint:fix     # リント自動修正
npm run format       # コード整形
npm run format:check # 整形チェック
```

### HITL シミュレーション

承認フローのテストを実行:

```bash
npx tsx src/tests/hitl-simulation.ts
```

## 技術スタック

- **Framework**: [Mastra](https://mastra.ai) - AIエージェントフレームワーク
- **Slack SDK**: [@slack/bolt](https://slack.dev/bolt-js/) - Slack アプリ開発
- **AI Model**: OpenAI GPT-4o
- **Database**: LibSQL (SQLite互換) - 会話履歴・メモリ管理・セマンティック検索
- **Calendar API**: Google Calendar API via googleapis
- **Language**: TypeScript
- **Runtime**: Node.js ≥ 22.13.0

## トラブルシューティング

### Google 認証エラー

- `.env` の `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` が正しいか確認
- GCP コンソールでカレンダーAPIが有効化されているか確認
- OAuth 同意画面のテストユーザーに自分のアカウントが追加されているか確認

### Slack 接続エラー

- Socket Mode が有効になっているか確認
- `SLACK_APP_TOKEN` (`xapp-` で始まる) が設定されているか確認
- Bot Token のスコープが正しく設定されているか確認
- アプリがワークスペースにインストールされているか確認

## ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。

## 参考リンク

- [Mastra Documentation](https://mastra.ai/docs)
- [Slack Bolt for JavaScript](https://slack.dev/bolt-js/)
- [Google Calendar API](https://developers.google.com/calendar/api)
