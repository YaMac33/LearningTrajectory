# GAS scripts for Learning Trajectory

このディレクトリは、  
**Learning Trajectory サイトの自動投稿・メタ生成・GitHub連携**を行う  
Google Apps Script（GAS）の設計資産を保管するためのものです。

APIキーなどの秘匿情報は **一切コミットしません**。

---

## ディレクトリ構成

'''
gas/
├─ LearningTrajectory.gs
├─ SetUp.example.gs
└─ README.md
'''

### 各ファイルの役割

### `LearningTrajectory.gs`
- メインのGASロジック
- 主な役割：
  - Googleフォーム送信トリガー処理
  - OpenAI API による記事メタ生成
  - GitHub API を使った記事HTML・JSONのpush
- **APIキー・トークンは含めない**
- `PropertiesService.getScriptProperties()` 前提で動作

---

### `SetUp.example.gs`
- Script Properties 設定用のテンプレート
- **このファイルは GitHub に公開してOK**
- 実運用時は以下の手順で使用する：

#### セットアップ手順
1. `SetUp.example.gs` をコピーして `SetUp.gs` を作成
2. `SetUp.gs` に実際の値を入力
3. GASエディタで `setAllScriptProperties()` を手動実行
4. 実行後、`SetUp.gs` は GitHub にコミットしない

---

## 必要な Script Properties

以下のキーを Script Properties に設定します：

- `OPENAI_API_KEY`
- `GITHUB_TOKEN`
- `GH_OWNER`
- `GH_REPO`
- `GH_BRANCH`（例：`main`）

※ 実際の値は `SetUp.gs` にのみ記述してください。

---

## セキュリティ方針（重要）

- APIキー・アクセストークンは **絶対にコミットしない**
- GitHub上には
  - ロジック
  - 設計
  - テンプレート
  のみを残す
- 実キーは GAS の Script Properties に保存する

---

## 想定ユースケース

- サイト構成変更時のGAS修正
- 記事ID生成ルールの変更
- カテゴリ構造の拡張
- 将来的な `.clasp` 導入

---

## 補足

このディレクトリは「動くコード」だけでなく、  
**Learning Trajectory の自動化設計そのものを保存する場所**です。

半年後・1年後に見返しても  
「何をしているGASか」が分かる状態を保つことを目的としています。
