# 管理者用10桁コード：Cloudflare Workers + D1（Firebase Spark維持）

## 仕様
- 「管理者としてコメントする」をチェックし「10桁のコードを管理者に送る」を押す
- Workersが暗号学的乱数で10桁のコードを生成し、**お問い合わせと同じFormspreeフォーム**に送信
- 管理者のメールで受信したコードを、申請したブラウザで入力
- 10分間有効、誤入力5回まで、1回限り。UID・IP・全体で発行回数制限あり
- WorkersがFirebase IDトークンを検証し、正しいコードの場合にのみFirebaseの `koppyAdmin` カスタムクレームを付与
- 管理者用のGoogleサービスアカウントキーはCloudflareのシークレットにだけ保存する。GitHubとWebブラウザへは公開しない
- 通常の匿名コメント・名前付きコメント・返信は影響を受けない

## 前提条件
Cloudflareアカウント（Workers・D1の無料枠）。Cloudflareの利用上限・プラン内容は適用時に確認すること。
Firebaseプロジェクト `koppyblog` のAuthenticationとFirestore Rulesが正常に動作していること。
Formspreeの `mdkzgoeb` フォームのメール通知が届いていること。
このコードを追加するだけではデプロイされず、管理者コードは有効になりません。

## セットアップ（コマンドは `cloudflare-admin-otp` ディレクトリ内で実行）
1. [Cloudflare](https://dash.cloudflare.com/) にログインし、Workers & Pages を利用可能にする。
2. ローカル環境にNode.jsとnpmを用意し、リポジトリを取得する。
3. `cd cloudflare-admin-otp`、`npm install`、`npx wrangler login`。
4. `npx wrangler d1 create koppyblog-admin-otp` を実行。表示されたD1 database_idを `wrangler.toml` の `REPLACE_WITH_D1_DATABASE_ID` と入れ替える（ID自体は秘密ではない）。
5. `npx wrangler d1 execute koppyblog-admin-otp --remote --file=./schema.sql` でデータベースのテーブルを作成。
6. Firebase Consoleのプロジェクト設定 → サービス アカウントから**この用途専用**のサービスアカウントを用意し、Firebase Authenticationユーザー管理に必要な権限に限定する。広範なOwner権限を与えない。
7. 秘密情報をCloudflare Workersへ設定する。
   - `npx wrangler secret put FIREBASE_API_KEY`：Firebase WebアプリのAPIキー
   - `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`：専用サービスアカウントのJSON全体
   - `npx wrangler secret put OTP_PEPPER`：十分長いランダム値（32バイト以上推奨）
   - 値をGitHubやチャットへ貼らない。CloudflareのSecret欄にだけ入力する。
8. `npx wrangler deploy` でWorkerをデプロイ。WorkersのURLは通常 `https://koppyblog-admin-otp.<subdomain>.workers.dev` の形式。
9. `blog/firebase-config.js` にある `window.KOPPY_ADMIN_OTP_API = "";` を、デプロイされたURL（末尾に/なし）に更新する。
10. 実環境で10桁の送信→Formspreeメール受信→正しいコードで認証→管理者投稿・通常投稿を確認。誤入力・期限切れ・使用済みコードの拒否も検証。

## 安全上の注意
- 管理者コードは**サーバーでのみ生成**されます。生成したコードをクライアントに返しません。
- Formspreeは配送だけに使用。コードの照合・権限付与はCloudflare Workerが行います。
- Formspreeからメールが届かない場合は、Formspreeの通知設定とスパムフォルダを確認。
- `wrangler.toml` のD1 IDは自分のCloudflare環境の値に設定する。秘密情報を設定するまではデプロイを実施しない。
- 認証に使用したFirebase匿名アカウントのブラウザデータが失われると、管理者権限も失う可能性があります。
- 運用前にWebブラウザで送信成功、誤入力5回、10分失効、同じコードの再利用、他UIDでの使用不可、Formspreeスパム制御、Cloudflare D1とFirebase側の権限制御を確認してください。
- 無料枠と利用規約には制限があります。無制限にメールが送れる構成ではありません。

## 現在のリリース状態
Workerのソースとブログ側の接続UIはGitHubに保存済みですが、Cloudflareアカウント上のD1・Secrets・デプロイ設定は**未実施**。
`KOPPY_ADMIN_OTP_API` の値が空の間は、管理者コードの発行・照合ボタンは無効です。
