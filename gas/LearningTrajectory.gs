/**
 * LearningTrajectory.gs
 * --------------------------------
 * フル版（安全な行固定・単段トリガー / 新仕様対応）
 *
 * 新仕様の流れ:
 * 1) フォーム送信（onFormSubmitFromSheet）
 *    - 入力 html から OpenAI（Responses API + json_schema strict）で meta_json を生成
 *      - meta_json: title/summary/tags/taxonomy/dr/status/openai_id 等
 *    - category（固定リスト）はフォーム側で入力済み（AI分類しない）
 *    - id = `${category}-${openai_id}` を生成
 *    - slug = `${YYYY-MM-DD}-${id}` を生成
 *    - 同じ行に id/slug/meta_json を書き込み
 *    - 「この行」をキューに積み、1分後に GitHub へ push する時間トリガーを作成
 *
 * 2) 1分後（pushQueuedRowToGitHub）
 *    - キュー先頭の「同じ行」を処理（ズレない）
 *    - 記事HTMLを docs/<category>/posts/<slug>/index.html に push
 *    - 差分メタを docs/data/new_items/<id>.json に push
 *      （GitHub Actions 側で docs/data/index.json（横断）等を再生成する想定）
 *
 * 重要:
 * - lastRowは使わず、常に「イベントで確定した行番号(row)」を保持して処理するのでズレない
 *
 * 前提（Script Properties に保存）:
 * - OPENAI_API_KEY
 * - GITHUB_TOKEN
 * - GH_OWNER
 * - GH_REPO
 * - GH_BRANCH（任意、未設定なら main）
 *
 * 初回のみ実行:
 * - setupTriggers()
 * （任意）setupGitHubRepoConfig() で GH_OWNER/GH_REPO/GH_BRANCH を保存
 *
 * スプレッドシートのヘッダ（1行目）:
 * timestamp,category,html,id,slug,meta_json
 */

// =====================
// 設定
// =====================

// 対象シート（空ならアクティブシート。固定したいなら例: "フォームの回答 1"）
const SHEET_NAME = "";

// OpenAI
const OPENAI_MODEL = "gpt-4o-mini";

// 列名（ヘッダ行に必要）
const COL_TIMESTAMP = "timestamp";
const COL_CATEGORY  = "category";
const COL_HTML      = "html";
const COL_ID        = "id";
const COL_SLUG      = "slug";
const COL_META_JSON = "meta_json";

// GitHub 保存先
// 記事HTML: docs/<category>/posts/<slug>/index.html
const DOCS_BASE_PATH = "docs";

// 差分メタ置き場（Actions が index.json / トップ等の再生成に利用）
const NEW_ITEMS_DIR = "docs/data/new_items";

// キュー（Script Properties）
const PUSH_QUEUE_KEY = "PENDING_PUSH_QUEUE_JSON";

// meta_json のデフォルト
const DEFAULT_META = {
  title: "",
  summary: "",
  tags: [],
  taxonomy: [],
  dr: null,
  status: "public"
};

const ALLOWED_STATUS = new Set(["public", "draft", "private"]);

// =====================
// 初回のみ実行（任意）
// GitHub repo情報を Script Properties に保存
// =====================
function setupGitHubRepoConfig() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    GH_OWNER: "",
    GH_REPO: "",
    GH_BRANCH: "main"
  });
  Logger.log("GitHub repo config saved to Script Properties.");
}

// =====================
// 初回のみ実行
// インストール型 onFormSubmit トリガー作成
// =====================
function setupTriggers() {
  const ss = SpreadsheetApp.getActive();

  // 既存の同名トリガーが増殖しないように掃除
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "onFormSubmitFromSheet")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("onFormSubmitFromSheet")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log("Installed onFormSubmit trigger created.");
}

// =====================
// 1) フォーム送信トリガー
// =====================
function onFormSubmitFromSheet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = getTargetSheet_(ss, SHEET_NAME);
    if (!sheet) throw new Error("Sheet not found");

    const row = e?.range?.getRow?.() || sheet.getLastRow();
    if (row <= 1) return; // header

    const colIndex = getColIndexFromSheet_(sheet);

    // 必須列
    for (const c of [COL_TIMESTAMP, COL_CATEGORY, COL_HTML, COL_ID, COL_SLUG, COL_META_JSON]) {
      if (!colIndex[c]) throw new Error(`Missing column header: ${c}`);
    }

    const timestamp = sheet.getRange(row, colIndex[COL_TIMESTAMP]).getValue();
    const category  = String(sheet.getRange(row, colIndex[COL_CATEGORY]).getValue() || "").trim();
    const html      = String(sheet.getRange(row, colIndex[COL_HTML]).getValue() || "");

    // category / html が空なら何もしない
    if (!category) throw new Error("category is empty");
    if (!html.trim()) return;

    // 二重実行ガード（id が埋まってたらスキップ）
    const existingId = String(sheet.getRange(row, colIndex[COL_ID]).getValue() || "").trim();
    if (existingId) {
      // 既にメタ生成済みでも push はしたい…なら、ここは消してOK
      return;
    }

    // OpenAIで meta_json を生成
    const out = generateMetaFromHtml_(html, timestamp);

    // id / slug を生成
    const dateStr = toDateYYYYMMDD_(timestamp) || Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
    const openaiId = normalizeOpenAiId_(out.openai_id);
    if (!openaiId) throw new Error("openai_id is empty (invalid)");

    const id = `${category}-${openaiId}`;
    const slug = `${dateStr}-${id}`;

    // meta_json を組み立て（スキーマ外のキーが返ってもここで正規化）
    const metaObj = {
      title: (out.title ?? "").toString().trim(),
      summary: (out.summary ?? "").toString().trim(),
      tags: normalizeTags_(out.tags),
      taxonomy: normalizeStringArray_(out.taxonomy),
      dr: out.dr ?? null,
      status: normalizeStatus_(out.status)
    };

    // 書き込み
    sheet.getRange(row, colIndex[COL_ID]).setValue(id);
    sheet.getRange(row, colIndex[COL_SLUG]).setValue(slug);
    sheet.getRange(row, colIndex[COL_META_JSON]).setValue(JSON.stringify(metaObj));

    // 1分後 push を予約（行固定）
    enqueueJob_(PUSH_QUEUE_KEY, ss.getId(), sheet.getSheetId(), row);

    // 1分後に実行（時間主導トリガー）
    ScriptApp.newTrigger("pushQueuedRowToGitHub")
      .timeBased()
      .after(60 * 1000)
      .create();

  } finally {
    lock.releaseLock();
  }
}

// =====================
// 2) 1分後：記事HTML + 差分メタをGitHubへpush
// =====================
function pushQueuedRowToGitHub() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    cleanupTimeTriggers_("pushQueuedRowToGitHub");

    const job = dequeueJob_(PUSH_QUEUE_KEY);
    if (!job) return;

    const ss = SpreadsheetApp.openById(job.ssId);
    const sheet = getSheetById_(ss, job.sheetId);
    if (!sheet) throw new Error("Target sheet not found");

    const colIndex = getColIndexFromSheet_(sheet);

    // 必須列
    for (const c of [COL_TIMESTAMP, COL_CATEGORY, COL_HTML, COL_ID, COL_SLUG, COL_META_JSON]) {
      if (!colIndex[c]) throw new Error(`Missing column header: ${c}`);
    }

    const timestamp = sheet.getRange(job.row, colIndex[COL_TIMESTAMP]).getValue();
    const category  = String(sheet.getRange(job.row, colIndex[COL_CATEGORY]).getValue() || "").trim();
    const html      = String(sheet.getRange(job.row, colIndex[COL_HTML]).getValue() || "");
    const id        = String(sheet.getRange(job.row, colIndex[COL_ID]).getValue() || "").trim();
    const slug      = String(sheet.getRange(job.row, colIndex[COL_SLUG]).getValue() || "").trim();
    const metaJson  = String(sheet.getRange(job.row, colIndex[COL_META_JSON]).getValue() || "").trim();

    if (!category) throw new Error("category is empty");
    if (!html.trim()) throw new Error("html is empty");
    if (!id) throw new Error("id is empty");
    if (!slug) throw new Error("slug is empty");

    // meta_json parse（壊れてても最低限は動かすなら try/catchでDEFAULTに落とす）
    let meta = { ...DEFAULT_META };
    if (metaJson) {
      try {
        const parsed = JSON.parse(metaJson);
        meta = { ...meta, ...parsed };
      } catch (e) {
        throw new Error(`meta_json parse error: ${e.message}`);
      }
    }

    // 1) 記事HTML push
    const articlePath = buildArticlePath_(category, slug);
    pushTextToGitHubPath_(articlePath, html);
    Logger.log(`Pushed article to GitHub: ${articlePath} (row=${job.row})`);

    // 2) 差分メタ push（Actionsが index/index.html を再生成）
    const newItem = {
      id,
      category,
      timestamp: normalizeTimestamp_(timestamp),
      post_path: `${category}/posts/${slug}/`,
      meta: {
        title: (meta.title ?? "").toString().trim(),
        summary: (meta.summary ?? "").toString().trim(),
        tags: normalizeTags_(meta.tags),
        taxonomy: normalizeStringArray_(meta.taxonomy),
        dr: meta.dr ?? null,
        status: normalizeStatus_(meta.status)
      }
    };

    const metaPath = `${NEW_ITEMS_DIR}/${id}.json`;
    pushTextToGitHubPath_(metaPath, JSON.stringify(newItem, null, 2));
    Logger.log(`Pushed new_item meta to GitHub: ${metaPath} (row=${job.row})`);

    // 残りがあれば、もう一度1分後に回す
    if (peekQueueLength_(PUSH_QUEUE_KEY) > 0) {
      ScriptApp.newTrigger("pushQueuedRowToGitHub")
        .timeBased()
        .after(60 * 1000)
        .create();
    }

  } finally {
    lock.releaseLock();
  }
}

// =====================
// OpenAI メタ生成（Responses API + json_schema strict）
// =====================
function generateMetaFromHtml_(html, timestamp) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Script property OPENAI_API_KEY is not set");

  const dateStr = toDateYYYYMMDD_(timestamp) || Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      openai_id: { type: "string" },
      title:     { type: "string" },
      summary:   { type: "string" },
      tags:      { type: "array", items: { type: "string" } },
      taxonomy:  { type: "array", items: { type: "string" } },
      dr:        { type: ["number", "string", "null"] },
      status:    { type: "string" }
    },
    required: ["openai_id", "title", "summary", "tags", "taxonomy", "dr", "status"]
  };

  const userPrompt = [
  "次のHTMLから、title/summary/tags/dr/category_lv1/category_lv2 を作ってください。",
  "",
  "【必須ルール】",
  "- 出力は必ずJSONスキーマに厳密準拠（余計なキー禁止）",
  "- title: 内容を端的に（30文字目安・日本語）",
  "- summary: 1〜2文（日本語）",
  "- tags: 3〜8個。短い名詞。重複/曖昧語（例: その他/メモ/雑記）は避ける",
  "- 分類は本文中に出てくるAWSサービス名・キーワードを根拠に決める（推測でねじ曲げない）",
  "",
  "【AWS Certified Cloud Practitioner（AWS-CP）カテゴリ分類（必須）】",
  "- category_lv1 は次から必ず1つ選ぶ：",
  "  - クラウドの概念",
  "  - AWSのコアサービス",
  "  - セキュリティとコンプライアンス",
  "  - 料金とサポート",
  "  - アーキテクチャと設計原則",
  "",
  "- category_lv2 は、選んだ category_lv1 に対応する中から必ず1つ選ぶ：",
  "",
  "  ■ クラウドの概念:",
  "    クラウドの特徴, 責任共有モデル, グローバルインフラ概要, 可用性と耐障害性, 導入パターン(IaaS/PaaS/SaaS)",
  "",
  "  ■ AWSのコアサービス:",
  "    コンピューティング(EC2/Lambda), ストレージ(S3/EBS), データベース(RDS/DynamoDB),",
  "    ネットワーク(VPC/Route53), 管理と監視(CloudWatch/CloudTrail)",
  "",
  "  ■ セキュリティとコンプライアンス:",
  "    IAMと認証認可, 暗号化(KMS), ログと監査, セキュリティ設計の基本, コンプライアンス概要",
  "",
  "  ■ 料金とサポート:",
  "    料金モデル, コスト最適化, 請求と予算(Billing/Budgets), サポートプラン, Trusted Advisorの概要",
  "",
  "  ■ アーキテクチャと設計原則:",
  "    Well-Architected, スケーラビリティ, 高可用性設計, パフォーマンス効率, 信頼性と運用性",
  "",
  "【分類のコツ（迷ったときの判断基準）】",
  "- EC2 / Lambda / S3 / RDS / DynamoDB / VPC / Route53 など具体サービス中心 → AWSのコアサービス",
  "- IAM / KMS / 暗号化 / 監査 / CloudTrail / セキュリティ責任 → セキュリティとコンプライアンス",
  "- 料金 / 請求 / コスト最適化 / サポート / Trusted Advisor → 料金とサポート",
  "- クラウドのメリット / 責任共有 / リージョン / AZ → クラウドの概念",
  "- Well-Architected / 可用性設計 / スケール設計 / 運用設計 → アーキテクチャと設計原則",
  "",
  "【dr（ディレクトリ名）ルール：最重要】",
  `- dr は必ず "${dateStr}_" で始める（この日付部分は固定で変更禁止）`,
  "- dr の形式: YYYY-MM-DD_<slug>（返すのはフォルダ名のみ。'docs/' や末尾スラッシュは禁止）",
  "- <slug> は英小文字/数字/ハイフンのみ（[a-z0-9-]）",
  "- 2〜6語くらいをハイフンで連結し、意味が分かる短さにする",
  "- 禁止: 空白、アンダースコア、記号、絵文字、連続ハイフン、末尾ハイフン",
  "",
  "HTML:",
  html
].join("\n");

  const payload = {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: "You extract metadata from HTML. Output MUST follow the provided JSON schema." },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: { type: "json_schema", name: "meta", strict: true, schema }
    },
    store: false
  };

  const res = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: `Bearer ${apiKey}` },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) throw new Error(`OpenAI API error (${code}): ${body}`);

  const json = JSON.parse(body);
  const text = extractOutputText_(json);
  const parsed = JSON.parse(text);

  // 念のため軽く正規化（tagsが文字列で返った場合など）
  if (parsed.tags && typeof parsed.tags === "string") {
    parsed.tags = parsed.tags.split(",").map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(parsed.taxonomy)) {
    parsed.taxonomy = [];
  }

  return parsed;
}

function extractOutputText_(responseJson) {
  const out = responseJson.output || [];
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") return c.text;
      }
    }
  }
  if (typeof responseJson.output_text === "string") return responseJson.output_text;
  throw new Error("No output_text found in response");
}

// =====================
// GitHub: 文章 push（任意パス）
// =====================
function pushTextToGitHubPath_(path, contentText) {
  const conf = getGitHubConfig_();
  const baseUrl =
    `https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/` +
    encodeURIComponent(path).replace(/%2F/g, "/");

  // 既存 sha 取得
  const getRes = UrlFetchApp.fetch(`${baseUrl}?ref=${encodeURIComponent(conf.branch)}`, {
    method: "get",
    headers: {
      Authorization: `Bearer ${conf.token}`,
      Accept: "application/vnd.github+json"
    },
    muteHttpExceptions: true
  });

  const getCode = getRes.getResponseCode();
  let sha = null;

  if (getCode === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  } else if (getCode !== 404) {
    throw new Error(`GitHub GET error (${getCode}): ${getRes.getContentText()}`);
  }

  const payload = {
    message: `Update ${path}`,
    content: Utilities.base64Encode(contentText, Utilities.Charset.UTF_8),
    branch: conf.branch
  };
  if (sha) payload.sha = sha;

  const putRes = UrlFetchApp.fetch(baseUrl, {
    method: "put",
    contentType: "application/json",
    headers: {
      Authorization: `Bearer ${conf.token}`,
      Accept: "application/vnd.github+json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const putCode = putRes.getResponseCode();
  if (putCode < 200 || putCode >= 300) {
    throw new Error(`GitHub PUT error (${putCode}): ${putRes.getContentText()}`);
  }
}

function getGitHubConfig_() {
  const props = PropertiesService.getScriptProperties();
  const owner  = props.getProperty("GH_OWNER");
  const repo   = props.getProperty("GH_REPO");
  const branch = props.getProperty("GH_BRANCH") || "main";
  const token  = props.getProperty("GITHUB_TOKEN");

  if (!owner || !repo) throw new Error("GitHub repo config not set (GH_OWNER/GH_REPO)");
  if (!token) throw new Error("GITHUB_TOKEN is not set");

  return { owner, repo, branch, token };
}

// =====================
// パス生成
// =====================
function buildArticlePath_(category, slug) {
  // docs/<category>/posts/<slug>/index.html
  return `${DOCS_BASE_PATH}/${category}/posts/${slug}/index.html`;
}

// =====================
// キュー（Script Propertiesに配列JSONで保持）
// =====================
function enqueueJob_(key, ssId, sheetId, row) {
  const props = PropertiesService.getScriptProperties();
  const json = props.getProperty(key);

  let queue = [];
  if (json) {
    try { queue = JSON.parse(json) || []; } catch (e) { queue = []; }
  }

  queue.push({ ssId, sheetId, row, queuedAt: new Date().toISOString() });
  props.setProperty(key, JSON.stringify(queue));
}

function dequeueJob_(key) {
  const props = PropertiesService.getScriptProperties();
  const json = props.getProperty(key);
  if (!json) return null;

  let queue = [];
  try { queue = JSON.parse(json) || []; } catch (e) {
    props.deleteProperty(key);
    return null;
  }
  if (queue.length === 0) {
    props.deleteProperty(key);
    return null;
  }

  const job = queue.shift();
  if (queue.length > 0) props.setProperty(key, JSON.stringify(queue));
  else props.deleteProperty(key);

  return job;
}

function peekQueueLength_(key) {
  const props = PropertiesService.getScriptProperties();
  const json = props.getProperty(key);
  if (!json) return 0;
  try {
    const q = JSON.parse(json) || [];
    return Array.isArray(q) ? q.length : 0;
  } catch (e) {
    return 0;
  }
}

// =====================
// トリガー掃除（増殖防止）
// =====================
function cleanupTimeTriggers_(handlerName) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === handlerName && t.getEventType() === ScriptApp.EventType.CLOCK)
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// =====================
// シート/列ユーティリティ
// =====================
function getTargetSheet_(ss, sheetName) {
  return sheetName ? ss.getSheetByName(sheetName) : ss.getActiveSheet();
}

function getSheetById_(ss, sheetId) {
  return ss.getSheets().find(s => s.getSheetId() === sheetId) || null;
}

function getColIndexFromSheet_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  header.forEach((name, i) => {
    const key = String(name || "").trim();
    if (key) idx[key] = i + 1; // 1-based
  });
  return idx;
}

// =====================
// 正規化ユーティリティ
// =====================

function normalizeStatus_(status) {
  const s = (status ?? "public").toString().trim().toLowerCase();
  return ALLOWED_STATUS.has(s) ? s : "public";
}

function normalizeTags_(tags) {
  // tags が "a,b,c" の文字列で来ても対応
  if (Array.isArray(tags)) return normalizeStringArray_(tags);
  if (typeof tags === "string") return splitTags_(tags);
  return [];
}

function normalizeStringArray_(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => (x ?? "").toString().trim()).filter(Boolean);
}

function normalizeOpenAiId_(s) {
  const v = (s ?? "").toString().trim().toLowerCase();
  // [a-z0-9-] のみ、連続ハイフン禁止、末尾ハイフン禁止
  if (!v) return "";
  if (!/^[a-z0-9-]+$/.test(v)) return "";
  if (/--/.test(v)) return "";
  if (/-$/.test(v)) return "";
  return v;
}

// tags は「カンマ区切り」想定だが、スペース/改行混じりでも最低限拾う
function splitTags_(s) {
  if (!s) return [];
  const normalized = String(s)
    .replace(/\u3000/g, " ")      // 全角スペース→半角
    .replace(/[\r\n]+/g, " ")
    .replace(/[、]/g, ",")
    .trim();

  // まずカンマ優先
  let parts = normalized.split(",").map(x => x.trim()).filter(Boolean);

  // カンマが無さそうなら空白分割も許容
  if (parts.length <= 1 && /\s/.test(normalized)) {
    parts = normalized.split(/\s+/).map(x => x.trim()).filter(Boolean);
  }

  // 重複除去（小文字キー）
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function toDateYYYYMMDD_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, "Asia/Tokyo", "yyyy-MM-dd");
  }
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

// timestamp を ISOっぽく揃える（Dateでも文字列でもOK）
function normalizeTimestamp_(v) {
  const tz = "Asia/Tokyo";
  if (v instanceof Date && !isNaN(v.getTime())) {
    const ymd = Utilities.formatDate(v, tz, "yyyy-MM-dd");
    const hms = Utilities.formatDate(v, tz, "HH:mm:ss");
    return `${ymd}T${hms}+09:00`;
  }
  const s = String(v || "").trim();

  // 例: 2026/01/18 15:36:22 → 2026-01-18T15:36:22+09:00
  const m = s.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const sec = m[6] ? m[6] : "00";
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${sec}+09:00`;
  }

  // 既に ISO っぽいならそのまま
  return s;
}
