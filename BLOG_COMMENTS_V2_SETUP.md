# ブログの管理者申請（Formspree・無料Sparkプラン）

## 仕組み
- ブログ記事の「管理者認証を申請」から、既存のお問い合わせと同じFormspreeフォーム（`feedback.html` と同じ送信先）へ申請する。
- 申請内容には名前、返信先メールアドレス、Firebase UID、記事のパスが含まれる。
- **メールを受け取っただけでは管理者権限は付与されない。** 申請者の本人確認後、Firebase管理者がUIDに `koppyAdmin: true` のカスタムクレームを付与する。
- 投稿の管理者表示はFirestore Security Rulesでこのクレームを検査する。誰でも送れるFormspreeフォーム自体は認証要素ではない。
- SparkプランではCloud Functionsによる自動コード発行は使わない。

## 管理者権限の付与方法
以下は管理者のみが**ローカルPC**で実行。ブラウザ上やGitHub Pagesで管理者権限を変更してはいけない。

1. Formspreeから管理者申請が届いたら、申請者本人であることを別経路でも確認する。メールアドレスや申請されたUIDのみを根拠に管理者にしない。
2. Firebase Consoleの「Authentication → ユーザー」で対象UIDを照合する。
3. Firebase Admin SDKを認証済みローカル環境で実行し、対象ユーザーにカスタムクレームを付与する。詳しくは公式ガイド：https://firebase.google.com/docs/auth/admin/custom-claims
4. 申請者が記事を再読み込み（認証トークン更新）すると、「こっぴー（管理者）」として投稿できる。

**注意**：匿名認証のUIDはブラウザのデータ消去で変わることがある。管理者には長期安定したFirebase認証（例：既存のGoogleプロバイダへのリンク）を使うことが望ましい。なお現在のブログの通常コメントは引き続き匿名認証を利用する。

## 権限と運用
- 権限付与は一般公開のWebサイトやFormspree経由では行わない。
- Firebaseサービスアカウントの秘密鍵はGitHubやブラウザへ公開しない。
- 本人確認・UID照合・付与・失効は管理者が扱う。
- 旧 `requestKoppyAdminCode` / `verifyKoppyAdmin` 関数はWebから利用しない。将来Blazeに切り替える場合も、セキュリティ検証のうえで導入する。
- Firebase実環境でのFormspree送信と管理者権限付与のエンドツーエンドテストは未実施。
