# 管理者コメントの10桁認証（導入待ち）

## 仕様
- 「管理者としてコメントする」チェックボックスを設置。オフなら通常コメントとして投稿
- チェックを入れ、未認証の場合は10桁認証コードの送信と入力欄を表示
- 10桁の数字は**サーバー側**の暗号学的乱数で発行し、管理者メールに送信
- 送信**成功応答を受信した場合にだけ**「管理者に10桁のコードを送りました」と表示
- 10分で期限切れ、最大5回まで入力可能、1回利用したら無効
- 有効なコードで認証され、Firebase Authenticationの `koppyAdmin` Custom Claimが付与された利用者だけ「こっぴー（管理者）」として投稿可能
- 通常ユーザーは名前入力不要、匿名コメント・名前付きコメント・返信が従来通り利用可能

## 現在のブロッカー
**koppyblog はSparkプランであり、Firebase Functionsがデプロイされていません。**
このブランチの10桁認証コード送信・検証はFirebase Functions（BlazeプランとSMTP送信設定）が必要です。
Firebaseを無料プランに維持する場合は、Firebaseとは別の安全なバックエンド（例：メール送信とFirebase Admin認証に対応した外部サーバー）が必要です。
Formspreeはフォーム通知には使用できますが、Formspreeだけではコードの安全な発行、コード照合、管理者権限の付与を行えません。

## 必須準備
- Firebase Functionsの利用可能な課金プランと、メール送信用SMTPアカウント
- Firebase Secret Managerに `KOPPY_SMTP_HOST`, `KOPPY_SMTP_USER`, `KOPPY_SMTP_PASS`, `KOPPY_OTP_PEPPER` を登録
- `functions/index.js` の `requestKoppyAdminCode`, `verifyKoppyAdmin` をデプロイ
- Firestoreの本番ルールを、更新した `firestore.rules` に同期
- 申請成功・メール配送・誤入力・期限切れ・再利用・匿名ユーザーの権限昇格防止を実環境で検証

## 注意
本機能は**本番未公開・実環境未検証**です。GitHubにコードを作成しただけではメール送信も管理者権限付与も起こりません。認証コードそのものやSMTP認証情報を公開サイト、リポジトリ、チャットに投稿しないこと。
