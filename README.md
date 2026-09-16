# MultiCommenter

マルチ配信者向けの一括コメント送信デスクトップアプリです。  
YouTube、Twitch、ツイキャス、ニコニコ生放送、Kick、Kukulu、FC2ライブなど、複数の配信プラットフォームへ一度にメッセージを同時送信できます。

---

## 主な機能

- **マルチ配信サイト同時送信**:
  チェックを入れた配信サイト（YouTube, Twitch, ツイキャス, ニコ生, Kick, Kukulu, FC2）に1回の操作でコメントを一括送信。
- **Restream Chat風の軽量UI**:
  ゲーム画面や配信画面の上に邪魔にならず配置可能。
- **最前面ピン留め (📌)**:
  `Ctrl+Shift+T` で常に最前面表示をトグル。
- **クリック透過モード (👻)**:
  `Ctrl+Shift+Space` で背後のゲームやブラウザを直接クリック可能。
- **ゼロ負荷の音声認識入力 (🎙️)**:
  Chrome の Web Speech API を活用し、PC負荷（CPU/GPU）ほぼ0%で声による音声入力・自動送信が可能。
- **オレンジ君マスコット**:
  愛らしいオレンジ君アイコンとシステムトレイ常駐。

---

## 必要要件 & セットアップ

1. **Node.js** (v18以上推奨)
2. **NeonTimerApp との連携**:
   Twitch / Kick / YouTube などの認証データは `NeonTimerApp` の設定ファイルを自動参照します。

### インストール & 起動

```bash
# 依存関係のインストール
npm install

# 開発モード起動
npm start
```

### パッケージ化（.exe の生成）

```bash
# build.bat を実行するか、以下のコマンドを実行
npm run dist
```

`dist/MultiCommenter-win32-x64/MultiCommenter.exe` が生成されます。

---

## ショートカットキー

| ショートカット | 機能 |
|---|---|
| `Enter` | コメント送信 |
| `Ctrl + Shift + T` | 最前面固定の切り替え |
| `Ctrl + Shift + Space` | クリック透過の切り替え |

---

## 免責事項 & ライセンス

本ソフトウェアは個人開発の配信補助ツールです。各配信プラットフォームの利用規約に従ってご利用ください。

MIT License
