# Learning Trajectory（internal）

このリポジトリは  
**Learning Trajectory サイトを構成・自動生成・運用するための作業用リポジトリ**。

外向け説明ではなく、  
「なぜこの構成なのか」「どこを触れば何が変わるか」を把握するためのメモを兼ねる。

---

## このリポジトリでやっていること

- Googleフォームからの記事投稿を自動化
- GASで記事HTML・メタ情報を生成
- GitHub Pagesで静的サイトとして公開
- GitHub Actionsで
  - 全体 index.json の再生成
  - カテゴリページ・ショートカット生成
- 学習系コンテンツと blog 系コンテンツを **同一基盤で共存**させる

---

## 全体アーキテクチャ（ざっくり）

```
Form → Spreadsheet → GAS
↓
(HTML + JSON)
↓
GitHub
↓
GitHub Actions
↓
GitHub Pages
```
※ 人手で HTML を書く運用はしない前提。

---

## ディレクトリ構成と役割
```
.
├─ docs/ # 公開物（GitHub Pages 直結）
│ ├─ index.html # 全体トップ
│ ├─ assets/ # 共通CSS / JS
│ │ ├─ styles.css
│ │ ├─ app.js # トップ・カテゴリ表示
│ │ └─ post.js # 記事用（前後リンク・問い合わせ）
│ ├─ data/
│ │ ├─ index.json # 全体横断インデックス（自動生成）
│ │ └─ new_items/ # GASがpushする差分メタ
│ └─ <category>/ # awscp / blog など
│ ├─ index.html # カテゴリトップ（自動生成）
│ ├─ data/index.json # カテゴリ専用インデックス
│ └─ posts/
│ └─ YYYY-MM-DD-<category>-<id>/
│ └─ index.html # 記事HTML（自動生成）
│
├─ scripts/ # GitHub Actions 用 Node.js
│ ├─ build_index.js # new_items → 全体 index.json
│ ├─ generate_shortcuts.js # 分類ショートカット生成
│ └─ generate_category_pages.js
│
├─ gas/ # Google Apps Script（キーなし）
│ ├─ LearningTrajectory.gs
│ ├─ SetUp.example.gs
│ └─ README.md
│
└─ .github/workflows/ # GitHub Actions 定義
```
---

## 記事生成の責務分担

### GAS（gas/）
- フォーム送信トリガー
- OpenAI API による
  - title / summary / tags
  - category / taxonomy
  - 記事ID（slug）
- 記事HTML + 差分JSONを GitHub に push

👉 **「1記事単位の生成」まで**

---

### GitHub Actions（scripts/）
- new_items を元に
  - docs/data/index.json を再生成
  - カテゴリ index.json / index.html を生成
  - ショートカットを作る

👉 **「サイト全体の再構築」**

---

### フロント（docs/assets）
- app.js  
  - トップ・カテゴリの一覧表示
  - ツリー俯瞰・検索
- post.js  
  - 前後記事リンク
  - 問い合わせリンク（Googleフォーム）

👉 **HTMLは基本的に触らない**

---

## category と 分類（taxonomy）の扱い

- **category**
  - 大分類（例：`awscp`, `blog`）
  - ディレクトリ構造に直結
- **分類（taxonomy）**
  - category 内での整理
  - 学習系：体系的
  - blog 系：`journal / note` など緩め

※ blog は「厳密分類しない」前提。

---

## 削除していいもの / 復活するもの

- `<category>/` ディレクトリ  
  → 削除しても、フォーム送信で自動復活
- `docs/data/new_items/`  
  → 削除OK（次回投稿で再生成）
- `index.json` 類  
  → **手で編集しない**

---

## セキュリティ・運用メモ

- APIキーは GitHub に置かない
- GAS の Script Properties にのみ保存
- `SetUp.gs`（実キー入り）はコミットしない

---

## 方針メモ（忘れないため）

- CMSに寄せない
- DBを持たない
- 「後から構造を変えられる」ことを最優先
- 学習ログも雑記も **同じ基盤で残す**

---

## TODO（思いついたらここに追記）

- blog 用プロンプトを学習系と分離
- awscp の記事IDを意味のある英語slugに統一
- 図解CSSの共通化（やるなら）


