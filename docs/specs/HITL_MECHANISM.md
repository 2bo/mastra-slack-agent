# Mastra 自律型 HITL (Human-in-the-Loop) 仕様書

本文書では、Mastra における Human-in-the-Loop (HITL) 承認フローの仕様詳細について記述します。

## 概要

Mastra は、特定のツールが呼び出された際にエージェントの実行を一時停止し、人間の介入（承認）を求めるネイティブなメカニズムを提供しています。これはツール定義の `requireApproval` プロパティによって設定されます。

## 1. 設定 (エージェント側)

ツールの HITL を有効にするには、`createTool` のオプションで `requireApproval: true` を設定します。

```typescript
export const createEvent = createTool({
  id: 'createEvent',
  description: "新しいイベントを作成します...",
  requireApproval: true, // <--- HITL を有効化
  inputSchema: z.object({ ... }),
  execute: async ({ context }) => { ... },
});
```

## 2. ランタイムの挙動

エージェントが `requireApproval: true` のツールを呼び出そうと決定した際、以下のフローが発生します：

1.  エージェントはツールの引数を計算します。
2.  **実行の停止**: エージェントはツールを即座には*実行しません*。
3.  **イベントの発火**: ストリーム内に `tool-call-approval` イベントが送出されます。
4.  ストリームは再開されるまでオープンのまま（概念的には一時停止状態）となります。

### イベントペイロード

`tool-call-approval` イベントは以下の構造を持ちます：

```typescript
type Chunk = {
  type: 'tool-call-approval';
  payload: ToolCallApprovalPayload;
};

interface ToolCallApprovalPayload {
  toolCallId: string; // この特定のツール呼び出しに対する一意なID
  toolName: string; // ツールのID (例: 'createEvent')
  args: Record<string, any>; // エージェントが使用しようとしている引数
}
```

## 3. クライアント側の処理 (Slack/UI)

エージェントのストリームを処理するクライアントアプリケーション（例: Slack連携の実装）は、`tool-call-approval` イベントタイプをリッスンする必要があります。

**推奨実装:**

1.  **イベント検知**: `chunk.type === 'tool-call-approval'` をチェックします。
2.  **UI表示**: ユーザーに対して、承認インターフェース（例: Slack Block Kit の「承認」「拒否」ボタン）を表示します。この際、`toolName` と `args` を提示して判断材料とします。
3.  **コンテキスト保存**: 再開時に必要な `runId` と `toolCallId` を保持します。

## 4. 実行の再開

ユーザーのアクションに応じて、クライアントは Mastra Agent API を呼び出し、実行を再開させます。

### 承認 (Approve)

実行を承認する場合、エージェントインスタンスの `approveToolCall` を呼び出します。

```typescript
const resumedStream = await agent.approveToolCall({
  runId: string,       // 停止中の runId
  toolCallId?: string; // オプション（推奨）: ペイロードから取得した ID
});
```

- Mastra はツールを実行します。
- 結果はエージェントにフィードバックされます。
- エージェントは生成（ストリーム）を再開します。

### 拒否 (Decline)

実行を拒否する場合：

```typescript
const resumedStream = await agent.declineToolCall({
  runId: string,
  toolCallId?: string;
  info?: string; // オプション: 拒否理由
});
```

- ツールは*実行されません*。
- エージェントには拒否が通知されます（多くの場合、ツールエラーや特定の拒否シグナルとして扱われます）。
- エージェントはそれを受けて、代替案を提示したり謝罪したりすることが可能です。
