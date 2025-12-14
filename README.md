# Google Calendar エージェント

Mastraで作られた Google Calendar を操作できるエージェントです。
あなたの Google アカウントと連携し、スケジュールの確認や作成をチャットで行うことができます。

## 前提条件 (Prerequisites)

1.  **Google Cloud Platform プロジェクトの作成**:
    - **Google Calendar API** を有効化してください。
    - **OAuth 同意画面 (Consent Screen)** を設定してください：
      - **User Type**: 個人の `@gmail.com` アカウントの場合は **External (外部)** を選択します（**必須**）。Google Workspace アカウントの場合は **Internal (内部)** も選択可能です。
      - **公開ステータス (Publishing Status)**: **Testing (テスト中)** に設定します。これにより、Google の審査なしでアプリを利用できます。
      - **テストユーザー**: あなた自身のメールアドレスをリストに追加してください。
    - **OAuth 2.0 クライアント認証情報** を作成してください：
      - アプリケーションの種類: **Desktop App (デスクトップアプリ)** を選択してください。
      - _注意: デスクトップアプリの場合、`http://localhost` へのリダイレクトはデフォルトで許可されるため、リダイレクトURIの手動設定は不要です。_

## セットアップ手順 (Setup Steps)

### 1. 環境設定

`.env` ファイルを作成し（または `example.env` をコピーして）、GCP コンソールから取得した認証情報を設定してください：

```bash
GOOGLE_CLIENT_ID=your_client_id_from_gcp
GOOGLE_CLIENT_SECRET=your_client_secret_from_gcp
```

### 2. リフレッシュトークンの生成

認証用スクリプトを実行して、Refresh Token を取得します：

```bash
npx tsx src/scripts/get-google-token.ts
```

1.  ブラウザが自動的に開きます（またはコンソールにURLが表示されるので開いてください）。
2.  Google アカウントでログインし、権限を許可します。
3.  成功するとコンソールに `GOOGLE_REFRESH_TOKEN=...` と表示されます。
4.  このトークンを `.env` ファイルに追記してください。

### 3. エージェントの起動

Mastra の開発サーバーを起動します：

```bash
mastra dev
```

これで `calendarAgent` が利用可能になります。

## 動作確認 (Verification)

Mastra Playground (通常は `http://localhost:3000`) などからエージェントに話しかけてみてください。

**試すことの例:**

- 「明日の予定を教えて」
- 「明日の15時に『開発会議』を入れて」
- 「さっき何を予約したっけ？」 (メモリ機能の確認)

## 実装の詳細

- **スクリプト**: `src/scripts/get-google-token.ts` はローカルサーバーを使ったコールバックフローで安全にトークンを取得します。
- **ツール**: `src/mastra/tools/google-calendar.ts` はタイムゾーン `Asia/Tokyo` を強制してカレンダー操作を行います。
- **エージェント**: `src/mastra/agents/calendar-agent.ts` は、予定の重複確認や作成前のユーザー確認を行うよう指示されています。
