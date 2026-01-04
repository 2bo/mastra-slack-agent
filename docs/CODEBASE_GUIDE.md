# Mastra Slack Agent - コードベース読み方ガイド

## プロジェクト概要

**Mastra Slack Agent** は、SlackとGoogle Calendarを統合したAIアシスタントです。Slackでメンションすると、GPT-4oがカレンダー操作を手伝ってくれます。重要な操作（イベント作成など）には、Human-in-the-Loop（HITL）による承認フローが組み込まれています。

---

## 📋 目次

1. [プロジェクト構造](#1-プロジェクト構造)
2. [読み進める順序（推奨パス）](#2-読み進める順序推奨パス)
3. [アプリケーションフロー](#3-アプリケーションフロー)
4. [主要コンポーネント詳解](#4-主要コンポーネント詳解)
5. [メモリとコンテキスト管理](#5-メモリとコンテキスト管理)
6. [HITLメカニズム](#6-hitlメカニズム)
7. [設定ファイルガイド](#7-設定ファイルガイド)
8. [開発ワークフロー](#8-開発ワークフロー)

---

## 1. プロジェクト構造

```
mastra-slack-agent/
├── src/
│   ├── index.ts                          # 🚀 エントリーポイント
│   ├── mastra/                           # 🤖 Mastraフレームワーク層
│   │   ├── index.ts                     # Mastraインスタンス設定
│   │   ├── agents/                      # AIエージェント定義
│   │   │   └── assistant-agent.ts       # メインのアシスタント
│   │   ├── tools/                       # ツール実装
│   │   │   └── google-calendar.ts       # カレンダーツール
│   │   └── services/                    # サービス層
│   │       └── agent-executor.ts        # エージェント実行ラッパー
│   ├── slack/                            # 💬 Slack統合層
│   │   ├── bolt-app.ts                  # Slack App初期化
│   │   ├── handlers/                    # イベントハンドラー
│   │   │   ├── mention-handler.ts       # メンション処理
│   │   │   ├── action-handler.ts        # ボタンクリック処理
│   │   │   └── view-handler.ts          # モーダル送信処理
│   │   ├── ui/                          # Block Kit UI
│   │   │   └── approval-blocks.ts       # 承認UI
│   │   └── utils/                       # ユーティリティ
│   ├── scripts/                          # 🛠️ ユーティリティスクリプト
│   │   └── get-google-token.ts          # OAuth認証ヘルパー
│   └── tests/                            # 🧪 テスト
│       └── hitl-simulation.ts           # HITL動作シミュレーション
├── docs/specs/                           # 📚 技術仕様書
│   └── HITL_MECHANISM.md                # HITLメカニズム詳細
└── *.db                                  # 💾 LibSQLデータベース
```

---

## 2. 読み進める順序（推奨パス）

### 🌱 フェーズ1: 基礎理解（ここから開始）

1. **[README.md](../README.md)** - セットアップとプロジェクト全体像
2. **[package.json](../package.json)** - 依存関係とスクリプト
3. **[src/index.ts](../src/index.ts)** - アプリケーションの起動処理
4. **[docs/specs/HITL_MECHANISM.md](specs/HITL_MECHANISM.md)** - 承認フローの仕様

### 🏗️ フェーズ2: コアアーキテクチャ

5. **[src/mastra/index.ts](../src/mastra/index.ts)** - Mastra設定とストレージ
6. **[src/mastra/agents/assistant-agent.ts](../src/mastra/agents/assistant-agent.ts)** - GPT-4oエージェント
7. **[src/mastra/tools/google-calendar.ts](../src/mastra/tools/google-calendar.ts)** - カレンダーツール3種
8. **[src/mastra/services/agent-executor.ts](../src/mastra/services/agent-executor.ts)** - 実行抽象化層

### 💬 フェーズ3: Slack統合

9. **[src/slack/bolt-app.ts](../src/slack/bolt-app.ts)** - Slack初期化
10. **[src/slack/constants.ts](../src/slack/constants.ts)** - 全定数定義
11. **[src/slack/handlers/mention-handler.ts](../src/slack/handlers/mention-handler.ts)** - メインイベントハンドラー
12. **[src/slack/utils/chat-stream.ts](../src/slack/utils/chat-stream.ts)** - リアルタイムストリーミング
13. **[src/slack/utils/thread-id.ts](../src/slack/utils/thread-id.ts)** - メモリスコープ管理

### ✅ フェーズ4: HITL承認フロー

14. **[src/slack/ui/approval-blocks.ts](../src/slack/ui/approval-blocks.ts)** - 承認UIブロック
15. **[src/slack/handlers/action-handler.ts](../src/slack/handlers/action-handler.ts)** - ボタンアクション
16. **[src/slack/handlers/view-handler.ts](../src/slack/handlers/view-handler.ts)** - モーダル処理
17. **[src/slack/utils/id-parser.ts](../src/slack/utils/id-parser.ts)** - ID解析ロジック
18. **[src/slack/utils/metadata.ts](../src/slack/utils/metadata.ts)** - メタデータシリアライズ

### 🧪 フェーズ5: テストとユーティリティ

19. **[src/slack/utils/error-handler.ts](../src/slack/utils/error-handler.ts)** - エラーハンドリング
20. **[src/scripts/get-google-token.ts](../src/scripts/get-google-token.ts)** - OAuth2フロー
21. **[src/tests/hitl-simulation.ts](../src/tests/hitl-simulation.ts)** - HITLテスト
22. **テストファイル群** - `*.test.ts`ファイル

---

## 3. アプリケーションフロー

### 起動シーケンス

```typescript
// src/index.ts での起動フロー

1. dotenv/config で環境変数読み込み
   ↓
2. initSlackApp() でSlackアプリ初期化
   ↓
3. イベントハンドラー登録:
   - app.event('app_mention', handleMention)      // @メンション
   - app.action(/approve:.+/, handleAction)       // 承認ボタン
   - app.action(/reject:.+/, handleAction)        // 却下ボタン
   - app.view(/reject_reason:.+/, handleViewSubmission)  // 却下理由モーダル
   ↓
4. startSlackApp(app) でSocket Mode開始
```

### ユーザーインタラクションフロー

```
👤 ユーザーがSlackでボットをメンション
    ↓
📝 mention-handler.ts
    - メンションテキストからクエリ抽出
    - threadId生成（メモリスコープ用）
    ↓
⚡ agent-executor.ts の executeAgent()
    - エージェント実行開始
    - ストリーミング処理開始
    ↓
🤖 assistant-agent (GPT-4o)
    - メモリから過去の会話取得
    - ツールを使って応答生成
    ↓
🛠️ Google Calendar Tools
    - listEvents / searchEvents / createEvent
    - createEvent は requireApproval: true
    ↓
⏸️ tool-call-approval イベント発火
    - agent-executor がイベント検出
    - runId と toolCallId を保存
    ↓
🎨 approval-blocks.ts
    - Slack Block Kit でUI生成
    - 承認/却下ボタン表示
    ↓
👆 ユーザーがボタンをクリック
    ↓
【承認の場合】
✅ action-handler.ts
    - approveToolCall() 呼び出し
    - ツール実行継続

【却下の場合】
❌ action-handler.ts → view-handler.ts
    - 却下理由モーダル表示
    - declineToolCall() 呼び出し
    - エージェントに理由を伝達
    ↓
💬 Slackにレスポンスをストリーミング
```

---

## 4. 主要コンポーネント詳解

### 🤖 Mastraインスタンス ([src/mastra/index.ts](../src/mastra/index.ts))

```typescript
export const mastra = new Mastra({
  agents: { assistantAgent },
  systemLogger: {
    type: 'PINO',
    config: { level: 'info', transport: { target: 'pino-pretty' } }
  },
  storage: {
    type: 'LIBSQL',
    url: 'file:mastra.db'  // SQLiteベース
  }
});
```

**★ Insight ─────────────────────────────────────**
- **LibSQL**: Turso社開発のSQLite互換DB。ベクトル検索にも対応
- **Pino**: 高速JSONロガー。本番環境でも使える軽量設計
- **シングルトンパターン**: プロジェクト全体で1つのMastraインスタンスを共有
─────────────────────────────────────────────────

### 🧠 アシスタントエージェント ([src/mastra/agents/assistant-agent.ts](../src/mastra/agents/assistant-agent.ts))

```typescript
export const assistantAgent = new Agent({
  name: 'assistant',
  model: {
    provider: 'OPEN_AI',
    name: 'gpt-4o',
    toolChoice: 'auto'
  },
  tools: {
    listEvents,
    searchEvents,
    createEvent
  },
  memory: {
    type: 'semantic-memory',
    config: {
      maxLastMessages: 50,      // 直近50件
      maxSemanticResults: 5,    // セマンティック検索上位5件
      semanticSearchLimit: 100  // 検索対象は過去100件
    }
  }
});
```

**★ Insight ─────────────────────────────────────**
- **セマンティックメモリ**: text-embedding-3-smallでベクトル化
- **ハイブリッド検索**: 直近メッセージ + 意味的に関連するメッセージ
- **ツールチョイス: auto**: GPT-4oが自動でツール使用を判断
─────────────────────────────────────────────────

### ⚡ エージェントエグゼキューター ([src/mastra/services/agent-executor.ts](../src/mastra/services/agent-executor.ts))

3つの主要関数を提供：

```typescript
// 1. エージェント実行（ストリーミング付き）
export async function executeAgent(
  agentName: string,
  userMessage: string,
  resourceId: string,
  threadId: string,
  onStream?: (chunk: string, fullText: string) => Promise<void>,
  onApprovalNeeded?: (payload: ToolCallApprovalPayload) => Promise<void>
): Promise<RunResponse>

// 2. ツール呼び出し承認
export async function approveToolCall(
  runId: string,
  toolCallId: string,
  onStream?: (chunk: string, fullText: string) => Promise<void>
): Promise<RunResponse>

// 3. ツール呼び出し却下
export async function declineToolCall(
  runId: string,
  toolCallId: string,
  reason: string,
  onStream?: (chunk: string, fullText: string) => Promise<void>
): Promise<RunResponse>
```

**★ Insight ─────────────────────────────────────**
- **抽象化レイヤー**: SlackとMastraを疎結合に保つ設計
- **ストリーミングコールバック**: リアルタイムUI更新を実現
- **イベント検出**: tool-call-approvalイベントを自動検出して処理停止
─────────────────────────────────────────────────

### 🛠️ Google Calendarツール ([src/mastra/tools/google-calendar.ts](../src/mastra/tools/google-calendar.ts))

```typescript
// 1. イベント一覧取得
export const listEvents = createTool({
  id: 'list-events',
  description: 'List upcoming calendar events',
  inputSchema: z.object({
    maxResults: z.number().optional(),
    timeMin: z.string().optional()
  }),
  execute: async ({ context, maxResults = 10, timeMin }) => {
    // OAuth2認証 → Google Calendar API呼び出し
  }
});

// 2. イベント検索
export const searchEvents = createTool({
  id: 'search-events',
  description: 'Search for calendar events by query',
  inputSchema: z.object({
    query: z.string(),
    maxResults: z.number().optional()
  }),
  execute: async ({ context, query, maxResults = 10 }) => { ... }
});

// 3. イベント作成（承認必須）
export const createEvent = createTool({
  id: 'create-event',
  description: 'Create a new calendar event',
  requireApproval: true,  // ← HITL承認が必要
  inputSchema: z.object({
    summary: z.string(),
    startDateTime: z.string(),
    endDateTime: z.string(),
    description: z.string().optional()
  }),
  execute: async ({ context, summary, startDateTime, endDateTime, description }) => { ... }
});
```

**★ Insight ─────────────────────────────────────**
- **requireApproval**: Mastraの機能で、trueにするとHITLフローが自動発動
- **Zod**: TypeScript型安全性とランタイムバリデーションを両立
- **OAuth2 Refresh Token**: 期限切れを自動で再取得する仕組み内蔵
─────────────────────────────────────────────────

---

## 5. メモリとコンテキスト管理

### Thread ID生成 ([src/slack/utils/thread-id.ts](../src/slack/utils/thread-id.ts))

```typescript
export function generateThreadId(channelId: string, threadTs: string | undefined): string {
  return `${channelId}:${threadTs || 'root'}`;
}
```

**メモリスコープの仕組み:**

```
Channel A, Thread 1 → threadId: "C123:1234567890.123456"
  └─ 独立したメモリ空間

Channel A, Thread 2 → threadId: "C123:9876543210.654321"
  └─ 別の独立したメモリ空間

Channel B, Thread 1 → threadId: "C456:1111111111.111111"
  └─ さらに別の独立したメモリ空間
```

**★ Insight ─────────────────────────────────────**
- **スレッド分離**: 各Slackスレッドが独立した会話コンテキストを持つ
- **永続化**: LibSQLに保存され、ボット再起動後も記憶が残る
- **プライバシー**: ユーザー間、チャンネル間でメモリが混ざらない
─────────────────────────────────────────────────

### ストリーミングチャット ([src/slack/utils/chat-stream.ts](../src/slack/utils/chat-stream.ts))

```typescript
export async function createStreamHandler(
  app: App,
  channelId: string,
  threadTs: string
): Promise<(chunk: string, fullText: string) => Promise<void>> {
  let messageTs: string | undefined;
  let lastUpdateTime = 0;
  const UPDATE_INTERVAL_MS = 500;  // 0.5秒に1回更新

  return async (chunk: string, fullText: string) => {
    const now = Date.now();

    if (!messageTs) {
      // 初回: メッセージ投稿
      const result = await app.client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: fullText
      });
      messageTs = result.ts;
    } else if (now - lastUpdateTime >= UPDATE_INTERVAL_MS) {
      // 更新: 既存メッセージを上書き
      await app.client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: fullText
      });
      lastUpdateTime = now;
    }
  };
}
```

**★ Insight ─────────────────────────────────────**
- **スロットリング**: 0.5秒間隔で更新し、API rate limitを回避
- **漸進的表示**: ChatGPTのようなタイピングエフェクトを実現
- **エラーハンドリング**: 失敗時はストリーム停止し、エラーメッセージ表示
─────────────────────────────────────────────────

---

## 6. HITLメカニズム

### 承認フロー全体図

```
🤖 エージェントがツール実行を試みる
    ↓
    createEvent(summary: "会議", startDateTime: "...", ...)
    ↓
    requireApproval: true を検出
    ↓
📤 tool-call-approval イベント発火
    {
      runId: "run_abc123",
      toolCallId: "call_xyz789",
      toolName: "create-event",
      args: { summary: "会議", ... }
    }
    ↓
💾 runId と toolCallId を保存（action ID / metadata に埋め込み）
    ↓
🎨 Slack Block Kitで承認UIを表示
    [承認する] [却下する]
    ↓
👆 ユーザーがボタンをクリック
    ↓
【承認ルート】
    ↓
✅ action-handler.ts
    - action_id から runId/toolCallId を抽出
    - approveToolCall(runId, toolCallId) を呼び出し
    - エージェントが実行再開
    - ツールが実際に実行される
    - 結果がSlackにストリーミング

【却下ルート】
    ↓
❌ action-handler.ts
    - 却下理由入力モーダルを開く
    - private_metadata に runId/toolCallId を保存
    ↓
📝 view-handler.ts
    - モーダルからreason取得
    - declineToolCall(runId, toolCallId, reason)
    - エージェントに却下理由を伝達
    - 代替案の提示などをエージェントが生成
```

### Action ID設計 ([src/slack/utils/id-parser.ts](../src/slack/utils/id-parser.ts))

```typescript
// Action ID形式: "approve:assistant:run_abc123:call_xyz789"
const ACTION_ID_PATTERN = /^(approve|reject):([^:]+):([^:]+):([^:]+)$/;

export function parseActionId(actionId: string): ActionIdComponents | null {
  const match = actionId.match(ACTION_ID_PATTERN);
  if (!match) return null;

  const [, type, agentName, runId, toolCallId] = match;
  return { type: type as 'approve' | 'reject', agentName, runId, toolCallId };
}
```

**★ Insight ─────────────────────────────────────**
- **自己記述的ID**: IDだけで全情報を持つため、DBルックアップ不要
- **正規表現パース**: 堅牢なパース処理でバグを防止
- **型安全性**: TypeScriptの型ガードでコンパイル時にエラー検出
─────────────────────────────────────────────────

### 承認UIブロック ([src/slack/ui/approval-blocks.ts](../src/slack/ui/approval-blocks.ts))

```typescript
export function createApprovalBlocks(
  agentName: string,
  runId: string,
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>
): Block[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:white_check_mark: *承認リクエスト*\n\n` +
              `ツール: \`${toolName}\`\n\n` +
              `引数:\n\`\`\`${JSON.stringify(args, null, 2)}\`\`\``
      }
    },
    {
      type: 'actions',
      block_id: BLOCK_IDS.APPROVAL_ACTIONS,
      elements: [
        {
          type: 'button',
          action_id: `approve:${agentName}:${runId}:${toolCallId}`,
          text: { type: 'plain_text', text: '✅ 承認する' },
          style: 'primary'
        },
        {
          type: 'button',
          action_id: `reject:${agentName}:${runId}:${toolCallId}`,
          text: { type: 'plain_text', text: '❌ 却下する' },
          style: 'danger'
        }
      ]
    }
  ];
}
```

**★ Insight ─────────────────────────────────────**
- **Slack Block Kit**: JSONベースのリッチUI記述フォーマット
- **可視性**: 実行パラメータをJSON整形して表示し、ユーザーが判断しやすく
- **アクションID埋め込み**: ボタン自体に全コンテキストを保持
─────────────────────────────────────────────────

---

## 7. 設定ファイルガイド

### 環境変数 ([.env](../.env))

```bash
# Google Calendar API
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token

# Slack (Socket Mode)
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# OpenAI
OPENAI_API_KEY=sk-...

# オプション
TIMEZONE=Asia/Tokyo
PORT=3000
```

**取得方法:**
- Google: [src/scripts/get-google-token.ts](../src/scripts/get-google-token.ts) を実行
- Slack: https://api.slack.com/apps でアプリ作成
- OpenAI: https://platform.openai.com/api-keys

### TypeScript設定 ([tsconfig.json](../tsconfig.json))

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",  // ← Mastraバンドラー用
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true  // ← ビルドはMastraが担当
  }
}
```

**★ Insight ─────────────────────────────────────**
- **ES2022**: 最新のJavaScript機能（Top-level await等）
- **bundler解決**: Node.jsのESM制約を回避し、柔軟にインポート
- **Strict mode**: 型安全性を最大化
─────────────────────────────────────────────────

---

## 8. 開発ワークフロー

### 利用可能なコマンド

```bash
# 🚀 開発モード
npm run dev          # Mastra Playground（ブラウザUI）
npm run dev:slack    # Slackボット（ホットリロード有効）
npm run start:slack  # Slackボット（本番用）

# 🏗️ ビルドと実行
npm run build        # 本番ビルド
npm start            # ビルド済みコード実行

# ✅ コード品質
npm run typecheck    # 型チェック
npm run lint         # リント
npm run lint:fix     # リント自動修正
npm run format       # コード整形
npm run format:check # 整形チェックのみ

# 🧪 テスト
npm test             # テスト実行
npx tsx src/tests/hitl-simulation.ts  # HITL動作確認
```

### 2つの動作モード

#### 1. **Playground Mode** (`npm run dev`)
- ブラウザUIでエージェントをテスト
- Slack接続不要
- 開発・デバッグに最適

#### 2. **Slack Bot Mode** (`npm run start:slack`)
- 実際のSlackに接続
- Socket ModeまたはEvents API
- 本番運用モード

---

## 9. アーキテクチャ図

### コンポーネント階層

```
┌─────────────────────────────────────────────────┐
│              Slack (User Interface)              │
│         - メンション                              │
│         - ボタンクリック                          │
│         - モーダル送信                            │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          Slack Handlers Layer                    │
│  - mention-handler.ts   (メンション処理)          │
│  - action-handler.ts    (ボタン処理)             │
│  - view-handler.ts      (モーダル処理)            │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│         Agent Executor Service                   │
│  - executeAgent()       (実行)                   │
│  - approveToolCall()    (承認)                   │
│  - declineToolCall()    (却下)                   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│           Mastra Agent Framework                 │
│  - assistantAgent       (GPT-4o)                │
│  - Memory               (LibSQL + Vector)        │
│  - Tools                (Google Calendar)        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│         External Services                        │
│  - Google Calendar API                           │
│  - OpenAI API (GPT-4o + Embeddings)             │
└──────────────────────────────────────────────────┘
```

### データフロー

```
ユーザー入力
    ↓
Slack Event (app_mention)
    ↓
mention-handler
    ↓
executeAgent(message, threadId)
    ↓
Mastra Agent (GPT-4o)
    ├─→ Memory取得 (LibSQL)
    ├─→ Tool呼び出し判断
    └─→ レスポンス生成
    ↓
【通常ツール】
    ツール実行 → 結果返却

【承認必須ツール】
    tool-call-approval イベント
    ↓
    承認UI表示
    ↓
    ユーザー操作待ち
    ↓
    approveToolCall() or declineToolCall()
    ↓
    実行 or キャンセル
    ↓
レスポンスをストリーミング
    ↓
Slack表示更新 (0.5秒間隔)
```

---

## 10. ベストプラクティスと設計パターン

### 責任の分離 (Separation of Concerns)

このプロジェクトは3層アーキテクチャを採用：

1. **Slack層** (`src/slack/`)
   - UI/UXの責務のみ
   - Block Kit、イベントハンドリング
   - エージェントロジックを含まない

2. **サービス層** (`src/mastra/services/`)
   - ビジネスロジックの抽象化
   - ストリーミング、HITL制御
   - Slack固有の詳細を知らない

3. **Mastra層** (`src/mastra/`)
   - AIエージェントとツール
   - 純粋な機能実装
   - プレゼンテーション層から完全分離

### ID管理パターン

**自己記述的ID (Self-Describing IDs)**:
```typescript
// Action ID: "approve:assistant:run_abc123:call_xyz789"
// 形式: {action}:{agent}:{runId}:{toolCallId}
```

利点：
- データベースルックアップ不要
- 全情報がID内に含まれる
- デバッグが容易

### 定数の集約

すべてのマジックストリングを [src/slack/constants.ts](../src/slack/constants.ts) に集約：
```typescript
export const BLOCK_IDS = {
  APPROVAL_ACTIONS: 'approval_actions',
  REJECTION_REASON: 'rejection_reason_input'
};

export const MESSAGES = {
  APPROVAL_NEEDED: '⏸️ 承認が必要です',
  PROCESSING: '🤔 考え中...'
};
```

### エラーハンドリング戦略

集中エラーハンドラー ([src/slack/utils/error-handler.ts](../src/slack/utils/error-handler.ts)):
```typescript
export async function handleError(
  app: App,
  error: unknown,
  channelId: string,
  threadTs: string,
  messageTs?: string,
  logPrefix: string = 'Error'
): Promise<void>
```

- ログ出力とUI更新を一元化
- ユーザーフレンドリーなエラーメッセージ
- セッション期限エラーの特別処理

---

## 11. トラブルシューティング

### よくある問題と解決方法

#### 1. メモリが残らない
**症状**: 過去の会話を覚えていない

**原因**: threadIdの生成ロジックが誤っている

**解決**: [src/slack/utils/thread-id.ts](../src/slack/utils/thread-id.ts:5-7) を確認
```typescript
// スレッド内: event.thread_ts を使用
// 新規メッセージ: event.ts を使用
```

#### 2. 承認ボタンが動作しない
**症状**: ボタンクリックでエラー

**原因**: Action IDのパースに失敗

**解決**: [src/slack/utils/id-parser.ts](../src/slack/utils/id-parser.ts:3) の正規表現を確認
```typescript
const ACTION_ID_PATTERN = /^(approve|reject):([^:]+):([^:]+):([^:]+)$/;
```

#### 3. ストリーミングが途切れる
**症状**: メッセージが途中で止まる

**原因**: Slack API rate limit

**解決**: [src/slack/utils/chat-stream.ts](../src/slack/utils/chat-stream.ts:6) の更新間隔を調整
```typescript
const UPDATE_INTERVAL_MS = 500; // 必要に応じて増やす
```

#### 4. Google認証エラー
**症状**: カレンダーツールでエラー

**原因**: Refresh Tokenが無効

**解決**:
```bash
npx tsx src/scripts/get-google-token.ts
# 新しいトークンを .env に設定
```

---

## 12. 拡張ガイド

### 新しいツールの追加

1. **ツール定義** ([src/mastra/tools/](../src/mastra/tools/))
```typescript
export const newTool = createTool({
  id: 'new-tool',
  description: 'ツールの説明',
  inputSchema: z.object({
    param: z.string()
  }),
  requireApproval: false,  // 必要に応じてtrue
  execute: async ({ context, param }) => {
    // 実装
    return { result: '成功' };
  }
});
```

2. **エージェントに登録** ([src/mastra/agents/assistant-agent.ts](../src/mastra/agents/assistant-agent.ts:10-14))
```typescript
tools: {
  listEvents,
  searchEvents,
  createEvent,
  newTool  // ← 追加
}
```

3. **システムプロンプト更新** (必要に応じて)
```typescript
instructions: `
既存の指示...

新しいツールの使い方：
- ...
`
```

### 新しいSlackイベントの追加

1. **ハンドラー作成** ([src/slack/handlers/](../src/slack/handlers/))
```typescript
export async function handleNewEvent(event: NewEvent, app: App) {
  // イベント処理
}
```

2. **イベント登録** ([src/index.ts](../src/index.ts:11-14))
```typescript
app.event('new_event', handleNewEvent);
```

---

## まとめ

このプロジェクトは、**明確な責任分離**と**モジュラー設計**が特徴です：

- **Mastra層**: AIエージェントとツールのロジック
- **サービス層**: 実行抽象化とストリーミング
- **Slack層**: UI/UXとイベント処理

HITLメカニズムにより、AIが重要な操作を行う前に必ず人間の承認を得る設計となっており、安全性と信頼性を担保しています。

推奨読書パスに従って読み進めることで、段階的に理解を深められます。Happy coding! 🚀
