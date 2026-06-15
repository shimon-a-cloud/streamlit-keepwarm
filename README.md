# streamlit-keepwarm

Streamlit Community Cloud のアプリを「常時すぐ開ける」状態に保つための keep-warm ツール。

## なぜ必要か

Streamlit Cloud のスリープ判定は **実際のブラウザ接続（websocketセッション）** が基準。
`curl` や UptimeRobot のような **HTTP監視はアプリが眠っていても 200 を返す**ため、
スリープを防げず、起こすこともできない。

そこで GitHub Actions 上で **本物のヘッドレスブラウザ（Playwright/Chromium）** を定期的に
起動し、対象アプリを開く。眠っていれば「Yes, get this app back up!」を自動でクリックして起こす。

## 仕組み

- `.github/workflows/keep-warm.yml` … 3時間おき・24時間（1日8回）実行。手動実行も可。
  Streamlit Cloud は「実ブラウザ訪問が12時間ないと休眠」なので、1日数回で十分（HTTP監視は無効）。
- `keepwarm.mjs` … 対象URLを順に開き、必要ならwakeボタンをクリック→Streamlitシェルの接続を待つ。
- 対象URLは GitHub Secret `APP_URLS`（改行 or カンマ区切り）で指定。コードにURLは書かない。

## 対象アプリの追加・変更

GitHub の Settings → Secrets and variables → Actions → `APP_URLS` を編集するだけ。
複数アプリをまとめて keep-warm できる（matcha / engate-console 等を1本化可能）。

## 注意

- Streamlit 公式機能ではなくコミュニティの回避策。頻度は控えめ（10分間隔）に保つ。
- GitHub の予約実行は数分の遅延・まれにスキップがあり得るため、ごく稀に眠ることはある。
- アプリのパスワードは入力しない（ログインゲートの手前で接続が成立し、それで十分なため）。
