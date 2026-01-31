# GAS (internal) – Learning Trajectory

このディレクトリは  
**Learning Trajectory の記事生成・メタ生成・GitHub連携を担う Google Apps Script（GAS）一式**を保管する場所。

「なぜこのGASが存在するのか」「どこを直すと何が変わるのか」を  
**後から見返してすぐ思い出すための内向きメモ**を兼ねる。

---

## このGASでやっていること

- Googleフォーム送信を起点に処理開始
- フォーム回答（HTML本文）をもとに：
  - 記事メタ（title / summary / tags）
  - category / 分類
  - 記事ID（slug）
  を OpenAI API で生成
- 記事HTMLと差分メタJSONを GitHub に push
- GitHub Actions に後続処理を委譲する

👉 **GASは「1記事分を正しく生成して渡す」までが責務**

---

## ファイル構成


```
gas/
├─ LearningTrajectory.gs
├─ SetUp.example.gs
└─ README.md
```


---

## 各ファイルの役割

### `LearningTrajectory.gs`
- メインロジック
- 主な処理：
  - onFormSubmit トリガー
  - OpenAI Responses API 呼び出し
  - 記事ID（slug）生成
  - GitHub API 経由で以下を push
    - 記事HTML  
      `docs/<category>/posts/YYYY-MM-DD-<category>-<id>/index.html`
    - 差分メタJSON  
      `docs/data/new_items/<id>.json`
- **APIキー・トークンは一切含めない**
- Script Properties 前提で動作

---

### `SetUp.example.gs`
- Script Properties 設定用テンプレート
- GitHub にコミットしてよいのは **この example のみ**
- 実運用時の流れ：
  1. `SetUp.example.gs` をコピーして `SetUp.gs` を作成
  2. 実際のキー・トークンを入力
  3. `setAllScriptProperties()` を手動実行
  4. `SetUp.gs` は **絶対にコミットしない**

---

## 使用している Script Properties

- `OPENAI_API_KEY`
- `GITHUB_TOKEN`
- `GH_OWNER`
- `GH_REPO`
- `GH_BRANCH`

※ ここに増やすのは「環境依存する値」のみ  
※ ロジックで分岐したい設定は **コード側に書く**

---

## 記事ID（slug）生成方針メモ

- category ごとに方針が異なる
  - **awscp**
    - 記事テーマを要約した英語スラッグ
    - 文字数上限あり
    - 日付 + slug で一意性担保
  - **blog**
    - 厳密性は不要
    - ほぼ本文そのままでもOK
- ID衝突は極力 GAS 側で防ぐ

※ ここは将来一番触りそうな箇所

---

## category / 分類の扱い（GAS側）

- category
  - ディレクトリ構造に直結
  - awscp / blog など
- 分類（taxonomy）
  - awscp：体系的（資格向け）
  - blog：journal / note など緩め

※ blog では **過剰分類しない方針**

---

## 触るときの注意点

- GAS側では **index.json を直接生成しない**
  - → GitHub Actions 側の責務
- HTML構造はプロンプトで厳密に固定
- post-nav / contactLink / post.js の構造は壊さない

---

## 削除・リセットについて

- GASコードは消さない（設計資産）
- Script Properties は
  - 誤動作時は一度全削除 → 再設定でOK
- new_items が空でも問題なし
  - 次回投稿で復活する

---

## このディレクトリの位置づけ

- 「動かすためのコード」＋「設計の記録」
- 半年後に見て
  - なぜこうしたか
  - どこを直せばいいか
  が分かることを最優先

---

## TODOメモ（思い出したら追記）

- blog 用プロンプトの完全分離
- awscp 用 slug 生成ルールの微調整
- category / 分類の固定リスト化
- GAS の役割が肥大化したら分割検討

```

