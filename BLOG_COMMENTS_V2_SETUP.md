# コメント機能 v2 — セットアップ

## 実装内容
- ログイン画面不要。Firebase Authenticationの匿名ログインを内部で使用
- 名前を入力する場合は30文字まで。空欄なら「匿名」
- コメントに返信可能（一般ユーザーも利用可）
- コメントを自分で削除可能。認証済み管理者は他人のコメントも削除可
- 「管理者コードを入力」欄はFirebase Functions側で認証し、Firestoreのルールで管理者署名（custom claim）を検証。コードはブラウザやGitHubに保存しない

## 初めに必須の設定
1. Firebase Authenticationで「匿名」を有効化する（既に有効ならそのまま）。
2. Firebase Console → Firestore Database → ルール にリポジトリの `firestore.rules` の内容を適用し、「公開」を押す。旧ルールでは匿名コメントを拒否する。
3. 初回は管理者機能を使わず、ゲストコメント・返信・削除を検証する。
4. 記事側の認証コードとFireStoreルールの変更は同時適用を推奨。

## 管理者コードの有効化（任意）
**管理者コードはチャットやGitHubの公開ファイルに貼らないこと。**
Firebase Functionsを使うにはプロジェクトの課金設定が必要になる場合があります。Blazeプラン等の課金状況を確認してから実施すること。

ローカルPC上で以下を実行：
```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
cd ..
firebase functions:secrets:set KOPPY_ADMIN_CODE --project koppyblog
firebase deploy --only functions:verifyKoppyAdmin --project koppyblog
```

`firebase functions:secrets:set` の入力プロンプトで、長くランダムな管理者コードを入力する。**コードを `.js` 等に書かないこと。**

サイトで「管理者コードを入力」→コード入力→「管理者認証」を押すと、Functionsが成功時にFirebase Authの `koppyAdmin` カスタムクレームを付与する。投稿・削除の権限はFirestore Rulesで検証する。

**注意：現状は管理者コードの認証に匿名ユーザーIDごとの試行制限を設けているが、端末を変えた攻撃や認証の再登録への完全な耐性はない。高負荷・荒らし対策としてApp Check・IPレート制限・通報/非表示/管理者によるモデレーションを運用前に追加検討する。**

## 現状の制約
- 以前のGoogleログインで投稿したコメントは閲覧できるが、利用者が匿名認証に切り替わると過去コメント削除権限は引き継がれない。
- コメントには公開コンテンツとして他人が投稿するため、掲示板のモデレーション機能が必要。
- 返信は同じ記事内のコメント文書に `parentId` を持たせる。親が削除された場合、その返信は親コメントと一緒に表示されなくなる場合がある。後日「削除済みコメント」プレースホルダーを導入する余地がある。
- Functionsデプロイ前は管理者認証欄は利用できず、通常のコメント投稿には影響しない。

## 管理者コードをお問い合わせ先メールへ送る方式（新仕様）
従来の固定 `KOPPY_ADMIN_CODE` は使用しません。管理者メニューの「メールに認証コードを送る」ボタンを押すと、Firebase Functionsが8桁の一時コードを生成し、フィードバックフォームの送信先と同じ `nikorihito@gmail.com` に送信します。コードは10分で期限切れ・1回使用・失敗5回で無効、発行はサイト全体で10分に1回に制限しています。

**Firebase Functionsはデプロイ前のため、まだメール送信はできません。**
SMTP送信元メールの認証情報をFirebase Secret Managerに保存します。ローカルPCでFirebase CLIを使い、以下を実施してください。

```bash
cd functions
npm install
cd ..
firebase functions:secrets:set KOPPY_SMTP_HOST --project koppyblog
firebase functions:secrets:set KOPPY_SMTP_USER --project koppyblog
firebase functions:secrets:set KOPPY_SMTP_PASS --project koppyblog
firebase functions:secrets:set KOPPY_OTP_PEPPER --project koppyblog
firebase deploy --only functions:requestKoppyAdminCode,functions:verifyKoppyAdmin --project koppyblog
```

例：SMTPホストはメール提供事業者から指定された値、SMTP_USERは送信元メールアドレス、SMTP_PASSは送信用パスワード（通常のGoogleアカウントパスワードではなく、専用のSMTP認証情報）、OTP_PEPPERは十分長いランダム文字列。これらの秘密情報はGitHubやサイト、チャットへ掲載しません。メール送信可能なSMTPアカウントと、Firebase Functionsをデプロイできる課金プランが必要です。

**注意**：古い手順内の `firebase functions:secrets:set KOPPY_ADMIN_CODE` は実行不要です。発行する一時コードはサーバーで生成されます。管理者コードの送信先メールはサーバー側の固定設定であり、訪問者が変更することはできません。これは認証機能の基盤実装で、実デプロイ・送信・認証の動作確認はまだ行っていません。
