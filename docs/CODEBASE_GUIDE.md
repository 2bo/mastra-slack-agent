# Mastra Slack Agent - コードベースガイド（最新版）

このドキュメントは、現在の実装（`src/`）に合わせた読み方ガイドです。  
詳細な処理図は `docs/PROCESS_FLOW.md` を参照してください。

関連ドキュメント:
- 全体フロー図: [docs/PROCESS_FLOW.md](./PROCESS_FLOW.md)
- HITL仕様: [docs/specs/HITL_MECHANISM.md](./specs/HITL_MECHANISM.md)
- デプロイ計画: [docs/DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 1. プロジェクト概要

`mastra-slack-agent` は、Slack の `app_mention` を入口として Mastra Agent を実行し、
Google Calendar ツールを利用する AI アシスタントです。

主な特徴:
- Slack Bolt ベースのイベント駆動
- Mastra Agent + Memory（LibSQL / Vector）
- Google Calendar ツール（`listEvents` / `searchEvents` / `createEvent`）
- `createEvent` 実行時の Human-in-the-Loop（承認/却下）

---

## 2. 全体アーキテクチャ

```mermaid
flowchart LR
  U[Slack User] --> S[Slack Events]
  S --> H[Slack Handlers\nsrc/slack/handlers/*]
  H --> R[Mention Response Service\nsrc/slack/services/mention-response-service.ts]
  R --> E[Agent Executor\nsrc/mastra/services/agent-executor.ts]
  E --> A[Assistant Agent\nsrc/mastra/agents/assistant-agent.ts]
  A --> M[(LibSQL Memory/Vector)]
  A --> T[Google Calendar Tools\nsrc/mastra/tools/google-calendar.ts]
  T --> G[Google Calendar API]
```

責務の分離:
- Slack 層: 受信イベント、Block Kit、メッセージ更新
- Service 層: メンション応答のオーケストレーション、ストリーム解釈、承認イベントの検出
- Mastra 層: モデル、メモリ、ツール実行

---

## 3. ディレクトリマップ

```text
src/
├── index.ts
├── mastra/
│   ├── constants.ts
│   ├── index.ts
│   ├── agents/
│   │   └── assistant-agent.ts
│   ├── services/
│   │   ├── agent-executor.ts
│   │   └── agent-executor.test.ts
│   └── tools/
│       ├── google-calendar.ts
│       └── google-calendar.test.ts
├── slack/
│   ├── bolt-app.ts
│   ├── constants.ts
│   ├── handlers/
│   │   ├── mention-handler.ts
│   │   ├── action-handler.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── agent-result-presenter.ts
│   │   ├── agent-result-presenter.test.ts
│   │   ├── mention-response-service.ts
│   │   └── mention-response-service.test.ts
│   ├── ui/
│   │   ├── approval-blocks.ts
│   │   └── approval-blocks.test.ts
│   ├── types/
│   │   └── handler-args.ts
│   └── utils/
│       ├── chat-stream.ts
│       ├── chat-stream.test.ts
│       ├── error-handler.ts
│       ├── id-parser.ts
│       ├── thread-id.ts
│       └── thread-id.test.ts
├── scripts/
│   └── get-google-token.ts
└── tests/
    └── hitl-simulation.ts
```

---

## 4. まず読むべき順序

1. [src/index.ts](../src/index.ts)
2. [src/slack/bolt-app.ts](../src/slack/bolt-app.ts)
3. [src/slack/handlers/mention-handler.ts](../src/slack/handlers/mention-handler.ts)
4. [src/slack/services/mention-response-service.ts](../src/slack/services/mention-response-service.ts)
5. [src/slack/services/agent-result-presenter.ts](../src/slack/services/agent-result-presenter.ts)
6. [src/slack/utils/chat-stream.ts](../src/slack/utils/chat-stream.ts)
7. [src/mastra/services/agent-executor.ts](../src/mastra/services/agent-executor.ts)
8. [src/mastra/agents/assistant-agent.ts](../src/mastra/agents/assistant-agent.ts)
9. [src/mastra/tools/google-calendar.ts](../src/mastra/tools/google-calendar.ts)
10. [src/slack/handlers/action-handler.ts](../src/slack/handlers/action-handler.ts)
11. [src/slack/ui/approval-blocks.ts](../src/slack/ui/approval-blocks.ts)
12. [docs/PROCESS_FLOW.md](./PROCESS_FLOW.md)

---

## 5. 起動とイベント登録

エントリーポイントは [src/index.ts](../src/index.ts)。

登録されるハンドラー:
- `app.event('app_mention', handleMention)`
- `app.action(/approve:.+/, handleAction)`
- `app.action(/reject:.+/, handleAction)`

Slack 起動処理は [src/slack/bolt-app.ts](../src/slack/bolt-app.ts):
- 必須 env (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, 必要なら `SLACK_APP_TOKEN`) を検証
- `SLACK_SOCKET_MODE === 'true'` で Socket Mode を利用

---

## 6. 主要実行フロー

### 6.1 メンション通常フロー

1. `handleMention` がメンション本文を抽出し、入力検証を行う
2. `runMentionResponseFlow(...)` が `Processing...` を投稿し、`streamToSlack({ ... })` を開始
3. `executeAgent(...)` が `assistantAgent.stream(...)` を実行
4. `text-delta` を受けるたびに `appendStream` で Slack 表示を更新
5. 完了時に `stopStream` で確定し、`Processing...` メッセージを削除

### 6.2 承認が必要なフロー（HITL）

`createEvent` 呼び出し時は `tool-call-approval` が発火し、
`executeAgent` は `approval-required` を返します。

その後:
- `mention-response-service` が承認 UI（Approve/Reject）をスレッドに投稿
- Approve: `action-handler` -> `approveToolCall(...)`
- Reject: `action-handler` -> `declineToolCall(...)`

---

## 7. 主要コンポーネント詳細

### 7.1 Mastraインスタンス

ファイル: [src/mastra/index.ts](../src/mastra/index.ts)

- `new Mastra({ agents, storage, logger })`
- `ASSISTANT_AGENT_KEY` でエージェント登録キーを一元管理
- storage は `LibSQLStore`（`TURSO_DATABASE_URL` 優先、未設定時 `file:mastra.db`）
- logger は `PinoLogger`（level: `info`）

### 7.2 Assistant Agent

ファイル: [src/mastra/agents/assistant-agent.ts](../src/mastra/agents/assistant-agent.ts)

- model: `openai('gpt-4o')`
- memory:
  - `LibSQLStore` + `LibSQLVector`
  - embedder: `text-embedding-3-small`
  - `lastMessages: 50`
  - semantic recall: `scope: 'thread'`, `topK: 5`, `messageRange: 100`
- tools:
  - `listEvents`
  - `searchEvents`
  - `createEvent`（`requireApproval: true` を付与）

### 7.3 Agent Executor

ファイル: [src/mastra/services/agent-executor.ts](../src/mastra/services/agent-executor.ts)

公開関数:
- `executeAgent(agent, query, { resourceId, threadId }, onStreamChunk?)`
- `approveToolCall(agent, runId, toolCallId, onStreamChunk?)`
- `declineToolCall(agent, runId, toolCallId, onStreamChunk?)`

戻り型（3関数で統一）:
- `completed`
- `approval-required`
- `error`

実装ポイント:
- `handleStream()` が `fullStream` を最後まで消費
- `tool-call-approval` 検出時に `runId/toolCallId/toolName/args` を保持
- `text-delta` を `onStreamChunk` 経由で Slack 側へ反映
- `No snapshot found` は「Session expired」に変換

### 7.4 Slack ストリーム制御

ファイル: [src/slack/utils/chat-stream.ts](../src/slack/utils/chat-stream.ts)

- `startStream`: Slack のストリームを開始
- `appendStream`: chunk を逐次追記
- `stopStream`: 必要に応じて最終差分を追記して終了

注意:
- `streamToSlack` は object 引数 (`{ chatClient, channel, threadTs, executor, ... }`) で統一
- `initialPrefix` を使うと、拒否時などの先頭文言を先頭chunkのみに付与できる

### 7.5 結果プレゼンテーション

ファイル: [src/slack/services/agent-result-presenter.ts](../src/slack/services/agent-result-presenter.ts)

- `AgentExecutionResult` を Slack UI 更新に変換する共通層
- `mention-response-service` と `action-handler` の両方から利用
- `presentMentionResult`: `approval-required` で承認UI投稿、`completed` で Processing 削除
- `presentActionResult`: `completed` は noop、`approval-required/error` はエラー処理

---

## 8. ID設計

### 8.1 Action ID

ファイル: [src/slack/constants.ts](../src/slack/constants.ts), [src/slack/utils/id-parser.ts](../src/slack/utils/id-parser.ts)

形式:
- 新形式: `{type}:{agentName}:{runId}:{toolCallId}`
- 旧3部形式 (`{type}:{runId}:{toolCallId}`) は現在サポート対象外

例:
- `approve:assistant-agent:run-123:tc-456`
- `reject:assistant-agent:run-123:tc-456`

---

## 9. メモリスコープ管理

ファイル: [src/slack/utils/thread-id.ts](../src/slack/utils/thread-id.ts)

```ts
export const generateThreadId = (
  channel: string,
  thread_ts: string | undefined,
  ts: string,
): string => {
  const threadTimestamp = thread_ts || ts;
  return `${channel}:${threadTimestamp}`;
};
```

意味:
- スレッド返信: `thread_ts` を使用
- 新規投稿: ルート投稿の `ts` を使用

これにより、Slack スレッド単位でメモリが分離されます。

---

## 10. Google Calendar ツール

ファイル: [src/mastra/tools/google-calendar.ts](../src/mastra/tools/google-calendar.ts)

提供ツール:
- `listEvents`
- `searchEvents`
- `createEvent`

共通実装:
- OAuth2 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) を必須化
- `GOOGLE_CALENDAR_ID` 未設定時は `primary`
- エラー時は `{ error: string }` 形式で返却

`createEvent`:
- ツール定義でも `requireApproval: true`
- Agent 側でも `...createEvent, requireApproval: true` を付与

---

## 11. 主要環境変数

必須:
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

Socket Mode 利用時:
- `SLACK_SOCKET_MODE=true`
- `SLACK_APP_TOKEN`

任意:
- `TIMEZONE`（デフォルト `Asia/Tokyo`）
- `PORT`（デフォルト `3000`）
- `GOOGLE_CALENDAR_ID`（デフォルト `primary`）
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

---

## 12. 開発コマンド

`package.json` の主要スクリプト:

```bash
# 開発
npm run dev          # Mastra Playground
npm run dev:slack    # Slack bot (watch)
npm run start:slack  # Slack bot (non-watch)

# 品質
npm run typecheck
npm run lint
npm run lint:fix
npm run format
npm run format:check

# テスト
npm test
npm test src/mastra/services/agent-executor.test.ts

# ビルド
npm run build
npm run start
```

コミット前の最低チェック:
- `npm run typecheck`
- `npm run lint`

---

## 13. テスト観点

主要テスト:
- [src/mastra/services/agent-executor.test.ts](../src/mastra/services/agent-executor.test.ts)
  - `text-delta` 結合
  - `tool-call-approval` 検出
  - Snapshot期限切れエラー変換
- [src/slack/services/mention-response-service.test.ts](../src/slack/services/mention-response-service.test.ts)
  - `completed/approval-required/error` 分岐
  - 進捗メッセージ更新と承認UI投稿のオーケストレーション
- [src/slack/services/agent-result-presenter.test.ts](../src/slack/services/agent-result-presenter.test.ts)
  - 結果型ごとの Slack UI 更新分岐
- [src/slack/utils/chat-stream.test.ts](../src/slack/utils/chat-stream.test.ts)
  - `initialPrefix` の付与
  - `stopStream` 時の最終差分送信
- [src/slack/ui/approval-blocks.test.ts](../src/slack/ui/approval-blocks.test.ts)
  - 承認ボタンID生成
- [src/slack/utils/thread-id.test.ts](../src/slack/utils/thread-id.test.ts)
- [src/mastra/tools/google-calendar.test.ts](../src/mastra/tools/google-calendar.test.ts)

手動確認:
- `npx tsx src/tests/hitl-simulation.ts`

---

## 14. 拡張時のチェックリスト

新しい Mastra ツール追加時:
1. `src/mastra/tools/` に追加
2. `assistant-agent.ts` の `tools` に登録
3. 重要操作なら `requireApproval: true`
4. 必要なら `docs/PROCESS_FLOW.md` と本書を更新
5. テスト追加

新しい Slack UI アクション追加時:
1. `constants.ts` に ID/文言追加
2. `id-parser.ts` で形式を担保
3. handler を `src/index.ts` で登録
4. `approval-blocks.test.ts` 形式でユニットテスト追加

---

## 15. 注意点（現実装ベース）

- `action-handler.ts` は `approve/reject` を設定テーブルで一元化し、`parseActionId` の失敗を `IdParseError` として扱います。
- `mention-handler.ts` は入力検証だけを担当し、実行フロー本体は `mention-response-service.ts` に委譲しています。
- `chat-stream.ts` は Slack 公式の `chat.startStream` / `chat.appendStream` / `chat.stopStream` を利用します。
