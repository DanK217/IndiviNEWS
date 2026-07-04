# IndiviNEWS

個人用のプロジェクトです。技術ニュースを私専用にカスタマイズしてスマホでみやすくします。

Hacker News / はてなブックマーク人気エントリー / Zenn・Publickey(RSS) をまとめて
黒背景のシンプルなリストとして表示するWebページ。Widgetsmithの「Website」ウィジェット
（Mediumサイズ・横長）にはめ込んで使う想定。

**Vercel（無料のHobbyプラン）でホスティング**するため、自宅PCを起動していなくても
常にアクセスできる。ランニングコストは基本 $0（Vercel Hobbyプランの無料枠内）。

## アーキテクチャ

- リクエストのたびにサーバーレス関数（`api/index.js`）が Hacker News / はてなブックマーク /
  RSS を**ライブ取得**して1つのリストに混在させ、HTMLを返す（常駐プロセスは持たない）。
- ニュースの鮮度は `Cache-Control: s-maxage=1800` によりVercel Edgeのキャッシュで
  30分単位に保つ。Widgetsmith自体の更新頻度もこれより長いことが多いため、実際の
  サーバーレス関数の実行回数はごくわずかで無料枠に余裕がある。
- コードを変更しない限り再デプロイは不要（内容更新はキャッシュ切れ後の次回アクセスで
  自動的に反映される）。

## 1. ローカル動作確認

```powershell
npm install
npm run dev
```

`http://localhost:3000` をブラウザで開き、ウィンドウをおよそ 338×158px 前後
（Widgetsmith Mediumに近い比率）にリサイズして、黒背景・見出し表示・省略が
崩れていないか確認する。`http://localhost:3000/health` で取得件数をJSONで確認できる。

ニュースソースやフィードは `src/config/feeds.js` で変更できる。

## 2. GitHubリポジトリの作成

```powershell
git init
git add .
git commit -m "initial commit"
```

GitHub上で新規リポジトリを作成し、リモートを追加してpushする。

```powershell
git remote add origin https://github.com/<your-account>/<repo-name>.git
git branch -M main
git push -u origin main
```

## 3. Vercelへのデプロイ（GitHub連携・自動デプロイ）

1. [Vercel](https://vercel.com/) にアクセスし、GitHubアカウントでサインアップ/ログイン
2. 「Add New Project」→ 先ほど作成したGitHubリポジトリをインポート
3. Framework Presetは「Other」のままでOK（ビルドコマンド不要）
4. 「Deploy」を押してデプロイ完了を待つ
5. 発行された `https://<project-name>.vercel.app` のURLにアクセスして表示を確認

以降は `main` ブランチに `git push` するたびに自動で再デプロイされる。

## 4. Widgetsmithの設定

1. WidgetsmithアプリでWebsiteウィジェットを追加
2. 手順3で確認したVercelのURLを設定
3. サイズを「Medium」（横長）にしてホーム画面に配置

## 5. 動作確認チェックリスト

- [ ] `npm run dev` でローカル表示が崩れない
- [ ] `/health` で3ソースとも取得できている（0件のソースがあれば `src/config/feeds.js` の
      フィードURLを確認）
- [ ] GitHubにpush後、Vercel側で自動デプロイが走る
- [ ] デプロイ後のVercel URLに、Wi-Fiを切ったモバイル回線からアクセスできる
- [ ] PCの電源を切った状態でも同じURLにアクセスできる（Vercelでホスティングされているため）
- [ ] Widgetsmithの実機表示で見た目・可読性に問題がない

## 毎朝の自動ダイジェスト

ウィジェット表示とは別に、GitHub Actionsが毎朝06:00 JSTに全ソースの見出しを
まとめた `digests/YYYY-MM-DD.md` を自動コミットする（LLM不使用・コスト0円）。
詳細は [README_digest.md](README_digest.md) を参照。

## 補足: 料金について

Vercelの無料 Hobby プランは個人・非商用利用が前提。今回のように個人のウィジェット用に
ニュースを表示するだけの用途であれば問題ないが、今後アクセス数が大きく増えたり用途が
変わる場合は Pro プラン（有料）への切り替えを検討する。
