/**
 * スクリプトプロパティ一括設定用
 * --------------------------------
 * 【使い方】
 * 1. このファイルを同一GASプロジェクトに追加
 * 2. setAllScriptProperties() を手動実行
 * 3. 実行後、このファイルは残しても削除してもOK
 *
 * 【注意】
 * - 既存のプロパティは「上書き」されます
 * - 値が空文字("")のものは保存されません（事故防止）
 */

// =====================
// 一括設定（ここだけ編集）
// =====================
const SCRIPT_PROPERTIES = {
  // --- OpenAI ---
  OPENAI_API_KEY: "",

  // --- GitHub ---
  GITHUB_TOKEN: "",
  GH_OWNER: "",
  GH_REPO: "",
  GH_BRANCH: "main"

  // 必要になったらここに追加
  // EXAMPLE_KEY: "example_value"
};

// =====================
// 実行関数
// =====================
function setAllScriptProperties() {
  const props = PropertiesService.getScriptProperties();

  const entries = Object.entries(SCRIPT_PROPERTIES)
    .filter(([_, value]) => value !== "");

  if (entries.length === 0) {
    throw new Error("設定するプロパティがありません（すべて空文字です）");
  }

  const toSet = {};
  for (const [key, value] of entries) {
    toSet[key] = String(value);
  }

  props.setProperties(toSet, true); // true = 既存を上書き

  Logger.log("Script Properties set:");
  Object.keys(toSet).forEach(k => Logger.log(`- ${k}`));
}

// =====================
// 確認用（任意）
// =====================
function listScriptProperties() {
  const props = PropertiesService.getScriptProperties().getProperties();
  Logger.log("Current Script Properties:");
  Object.keys(props).forEach(k => Logger.log(`- ${k}`));
}
