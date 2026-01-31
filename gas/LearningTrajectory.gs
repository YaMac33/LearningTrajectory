/**
 * LearningTrajectory.gs
 * --------------------------------
 * フル版（行固定・単段トリガー / 責務整理後）
 *
 * 流れ:
 * 1) フォーム送信
 *   - category はフォーム入力を正とする
 *   - html から OpenAI で最小メタ生成
 *     - openai_id（意味のある英語スラッグ）
 *     - title / summary / tags
 *     - taxonomy（awscp の場合のみ / [lv1, lv2]）
 *   - id = `${category}-${openai_id}`
 *   - slug = `${YYYY-MM-DD}-${id}`
 *   - meta_json に OpenAI 由来情報のみ保存
 *
 * 2) GitHub push
 *   - 記事HTML: docs/<category>/posts/<slug>/index.html
 *   - 差分JSON: docs/data/new_items/<id>.json
 *
 * 前提:
 * - OPENAI_API_KEY / GITHUB_TOKEN 等は Script Properties
 *
 * シートヘッダ:
 * timestamp, category, html, id, slug, meta_json
 */

// =====================
// 設定
// =====================
const SHEET_NAME = "sheets";
const OPENAI_MODEL = "gpt-4o-mini";

// 列
const COL_TIMESTAMP = "timestamp";
const COL_CATEGORY  = "category";
const COL_HTML      = "html";
const COL_ID        = "id";
const COL_SLUG      = "slug";
const COL_META_JSON = "meta_json";

// GitHub
const DOCS_BASE_PATH = "docs";
const NEW_ITEMS_DIR  = "docs/data/new_items";

// キュー
const PUSH_QUEUE_KEY = "PENDING_PUSH_QUEUE_JSON";

// meta_json 初期
const DEFAULT_META = {
  title: "",
  summary: "",
  tags: [],
  taxonomy: [] // awscp のみ [lv1, lv2]
};

// =====================
// トリガーセットアップ
// =====================
function setupTriggers() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "onFormSubmitFromSheet")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("onFormSubmitFromSheet")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
}

// =====================
// 1) フォーム送信
// =====================
function onFormSubmitFromSheet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) throw new Error("Sheet not found");

    const row = e?.range?.getRow?.();
    if (!row || row <= 1) return;

    const idx = getColIndex_(sheet);
    for (const c of [COL_TIMESTAMP, COL_CATEGORY, COL_HTML, COL_ID, COL_SLUG, COL_META_JSON]) {
      if (!idx[c]) throw new Error(`Missing column: ${c}`);
    }

    const timestamp = sheet.getRange(row, idx[COL_TIMESTAMP]).getValue();
    const category  = String(sheet.getRange(row, idx[COL_CATEGORY]).getValue() || "").trim();
    const html      = String(sheet.getRange(row, idx[COL_HTML]).getValue() || "");

    if (!category) throw new Error("category empty");
    if (!html.trim()) return;

    const existingId = String(sheet.getRange(row, idx[COL_ID]).getValue() || "").trim();
    if (existingId) return;

    const dateStr = toDateYYYYMMDD_(timestamp);

    // OpenAI
    const ai = generateMetaFromHtml_(html, category, dateStr);

    const openaiId = normalizeOpenAiId_(ai.openai_id);
    if (!openaiId) throw new Error("invalid openai_id");

    const id = `${category}-${openaiId}`;
    const slug = `${dateStr}-${id}`;

    const meta = {
      title: (ai.title ?? "").toString().trim(),
      summary: (ai.summary ?? "").toString().trim(),
      tags: normalizeTags_(ai.tags),
      taxonomy: Array.isArray(ai.taxonomy) ? ai.taxonomy.slice(0, 2) : []
    };

    sheet.getRange(row, idx[COL_ID]).setValue(id);
    sheet.getRange(row, idx[COL_SLUG]).setValue(slug);
    sheet.getRange(row, idx[COL_META_JSON]).setValue(JSON.stringify(meta));

    enqueueJob_(PUSH_QUEUE_KEY, ss.getId(), sheet.getSheetId(), row);

    ScriptApp.newTrigger("pushQueuedRowToGitHub")
      .timeBased()
      .after(60 * 1000)
      .create();

  } finally {
    lock.releaseLock();
  }
}

// =====================
// 2) GitHub push
// =====================
function pushQueuedRowToGitHub() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    cleanupTimeTriggers_("pushQueuedRowToGitHub");

    const job = dequeueJob_(PUSH_QUEUE_KEY);
    if (!job) return;

    const ss = SpreadsheetApp.openById(job.ssId);
    const sheet = ss.getSheets().find(s => s.getSheetId() === job.sheetId);
    if (!sheet) throw new Error("Sheet not found");

    const idx = getColIndex_(sheet);
    for (const c of [COL_TIMESTAMP, COL_CATEGORY, COL_HTML, COL_ID, COL_SLUG, COL_META_JSON]) {
      if (!idx[c]) throw new Error(`Missing column: ${c}`);
    }

    const timestamp = sheet.getRange(job.row, idx[COL_TIMESTAMP]).getValue();
    const category  = String(sheet.getRange(job.row, idx[COL_CATEGORY]).getValue() || "").trim();
    const html      = String(sheet.getRange(job.row, idx[COL_HTML]).getValue() || "");
    const id        = String(sheet.getRange(job.row, idx[COL_ID]).getValue() || "").trim();
    const slug      = String(sheet.getRange(job.row, idx[COL_SLUG]).getValue() || "").trim();
    const metaJson  = String(sheet.getRange(job.row, idx[COL_META_JSON]).getValue() || "").trim();

    if (!category) throw new Error("category empty");
    if (!html.trim()) throw new Error("html empty");
    if (!id) throw new Error("id empty");
    if (!slug) throw new Error("slug empty");

    let meta = { ...DEFAULT_META };
    if (metaJson) {
      try {
        meta = { ...meta, ...JSON.parse(metaJson) };
      } catch (e) {
        throw new Error(`meta_json parse error: ${e.message}`);
      }
    }

    const articlePath = `${DOCS_BASE_PATH}/${category}/posts/${slug}/index.html`;
    pushTextToGitHubPath_(articlePath, html);

    const newItem = {
      id,
      category,
      timestamp: normalizeTimestamp_(timestamp),
      post_path: `${category}/posts/${slug}/`,
      meta: {
        title: (meta.title ?? "").toString().trim(),
        summary: (meta.summary ?? "").toString().trim(),
        tags: normalizeTags_(meta.tags),
        taxonomy: Array.isArray(meta.taxonomy) ? meta.taxonomy.slice(0, 2) : []
      }
    };

    pushTextToGitHubPath_(
      `${NEW_ITEMS_DIR}/${id}.json`,
      JSON.stringify(newItem, null, 2)
    );

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
// OpenAI プロンプト定義
// =====================
function getPromptAwscp_(html, dateStr) {
  return [
    "あなたは AWS Certified Cloud Practitioner（AWS-CP）対策記事の",
    "メタデータを生成する専門AIです。",
    "",
    "以下の HTML 本文を読み、指定された JSON スキーマに",
    "厳密に一致する JSON のみを出力してください。",
    "",
    "────────────────────",
    "■ 絶対ルール",
    "────────────────────",
    "- 出力は JSON のみ（説明文禁止）",
    "- JSON スキーマ外のキーは禁止",
    "- required フィールドはすべて必須",
    "- 推測で分類しない（本文根拠ベース）",
    "",
    "────────────────────",
    "■ フィールド定義",
    "────────────────────",
    "",
    "【openai_id】",
    "- 英小文字・数字・ハイフンのみ",
    "- 記事テーマを要約した英語スラッグ",
    "- 2〜6語程度、意味が分かる短さ",
    "",
    "【title】",
    "- 日本語",
    "- AWS-CP 学習用として端的に",
    "- 30文字前後",
    "",
    "【summary】",
    "- 日本語",
    "- 1〜2文",
    "- 試験観点で何が理解できるかを書く",
    "",
    "【tags】",
    "- 3〜8個",
    "- AWSサービス名 / 試験用語を優先",
    "- 短い名詞のみ",
    "",
    "【taxonomy】",
    "- 次の固定リストから必ず lv1 / lv2 を1つずつ選ぶ",
    "",
    "■ category_lv1",
    "- クラウドの概念",
    "- AWSのコアサービス",
    "- セキュリティとコンプライアンス",
    "- 料金とサポート",
    "- アーキテクチャと設計原則",
    "",
    "■ category_lv2",
    "（lv1 に対応するもののみ選択）",
    "",
    "クラウドの概念:",
    "  クラウドの特徴, 責任共有モデル, グローバルインフラ概要,",
    "  可用性と耐障害性, IaaS/PaaS/SaaS",
    "",
    "AWSのコアサービス:",
    "  コンピューティング(EC2/Lambda),",
    "  ストレージ(S3/EBS),",
    "  データベース(RDS/DynamoDB),",
    "  ネットワーク(VPC/Route53),",
    "  管理と監視(CloudWatch/CloudTrail)",
    "",
    "セキュリティとコンプライアンス:",
    "  IAMと認証認可, 暗号化(KMS), ログと監査,",
    "  セキュリティ設計の基本, コンプライアンス概要",
    "",
    "料金とサポート:",
    "  料金モデル, コスト最適化, 請求と予算,",
    "  サポートプラン, Trusted Advisor",
    "",
    "アーキテクチャと設計原則:",
    "  Well-Architected, スケーラビリティ, 高可用性設計,",
    "  パフォーマンス効率, 信頼性と運用性",
    "",
    "【dr】",
    `- 必ず "${dateStr}_" で始める`,
    "- 形式: YYYY-MM-DD_<slug>",
    "- slug は openai_id と同じルール",
    "",
    "【status】",
    "- 原則 public",
    "",
    "────────────────────",
    "■ 入力HTML",
    "────────────────────",
    html
  ].join("\n");
}

function getPromptBlog_(html, dateStr) {
  return [
    "あなたは「Learning Trajectory」の blog / journal 用",
    "メタデータ生成AIです。",
    "",
    "このカテゴリは学習・試験対策ではありません。",
    "思考メモ・雑記・アイデアログを扱います。",
    "",
    "以下の HTML 本文を読み、",
    "指定された JSON スキーマに厳密一致する JSON のみを出力してください。",
    "",
    "────────────────────",
    "■ 絶対ルール",
    "────────────────────",
    "- 出力は JSON のみ（説明禁止）",
    "- スキーマ外キー禁止",
    "- required フィールド必須",
    "- 専門分野に寄せない",
    "",
    "────────────────────",
    "■ フィールド定義",
    "────────────────────",
    "",
    "【openai_id】",
    "- 英小文字・数字・ハイフンのみ",
    "- 1〜4語の短い英語",
    "- 雰囲気が分かれば十分",
    "",
    "【title】",
    "- 日本語",
    "- 日記・メモとして自然",
    "- 20〜30文字",
    "",
    "【summary】",
    "- 日本語",
    "- 1文のみ",
    "",
    "【tags】",
    "- 0〜5個まで",
    "- 思いつかなければ空配列でよい",
    "",
    "【taxonomy】",
    "- 必ず次の固定値のみを返す",
    '["journal","note"]',
    "",
    "【dr】",
    `- 必ず "${dateStr}_" で始める`,
    "- 形式: YYYY-MM-DD_<slug>",
    "- slug は openai_id と同じルール",
    "",
    "【status】",
    "- 原則 public",
    "",
    "────────────────────",
    "■ 入力HTML",
    "────────────────────",
    html
  ].join("\n");
}

// =====================
// OpenAI メタ生成
// =====================
function generateMetaFromHtml_(html, category, dateStr) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  let userPrompt;
  if (category === "awscp") {
    userPrompt = getPromptAwscp_(html, dateStr);
  } else if (category === "blog") {
    userPrompt = getPromptBlog_(html, dateStr);
  } else {
    throw new Error(`Unsupported category: ${category}`);
  }

  // schema は「両カテゴリ共通の最大集合」
  // 重要: required は properties の全キーを含める必要がある（Responses API json_schema strict の仕様）
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      openai_id: { type: "string" },
      title:     { type: "string" },
      summary:   { type: "string" },
      tags:      { type: "array", items: { type: "string" } },
      taxonomy:  { type: "array", items: { type: "string" } },
      dr:        { type: "string" },
      status:    { type: "string" }
    },
    required: ["openai_id", "title", "summary", "tags", "taxonomy", "dr", "status"]
  };

  const payload = {
    model: OPENAI_MODEL,
    input: [
      { role: "system", content: "You must output JSON strictly following the schema." },
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
  if (code < 200 || code >= 300) {
    throw new Error(body);
  }

  const json = JSON.parse(body);
  const text = extractOutputText_(json);
  const parsed = JSON.parse(text);

  // 念のため正規化（壊れても落とさない）
  parsed.openai_id = (parsed.openai_id ?? "").toString();
  parsed.title     = (parsed.title ?? "").toString();
  parsed.summary   = (parsed.summary ?? "").toString();
  parsed.tags      = normalizeTags_(parsed.tags);
  parsed.taxonomy  = Array.isArray(parsed.taxonomy) ? parsed.taxonomy.map(x => (x ?? "").toString().trim()).filter(Boolean) : [];
  parsed.dr        = (parsed.dr ?? "").toString();
  parsed.status    = (parsed.status ?? "public").toString();

  return parsed;
}

// =====================
// Responses API の output_text 抽出
// =====================
function extractOutputText_(responseJson) {
  const out = responseJson.output || [];
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") {
          return c.text;
        }
      }
    }
  }
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text;
  }
  throw new Error("No output_text found in OpenAI response");
}

// =====================
// ユーティリティ
// =====================
function getColIndex_(sheet) {
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx = {};
  header.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) idx[key] = i + 1; // 1-based
  });
  return idx;
}

function normalizeOpenAiId_(s) {
  const v = String(s || "").toLowerCase().trim();
  if (!/^[a-z0-9-]{1,40}$/.test(v)) return "";
  if (/--/.test(v) || v.endsWith("-")) return "";
  return v;
}

function normalizeTags_(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  const seen = new Set();
  for (const t of tags) {
    const v = String(t || "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function toDateYYYYMMDD_(v) {
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  return Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd");
}

function normalizeTimestamp_(v) {
  const d = (v instanceof Date) ? v : new Date(v);
  if (isNaN(d.getTime())) return String(v || "");
  // Apps Script の XXX は環境によって出ないことがあるので +09:00 固定で整形
  const ymd = Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd");
  const hms = Utilities.formatDate(d, "Asia/Tokyo", "HH:mm:ss");
  return `${ymd}T${hms}+09:00`;
}

// =====================
// キュー管理（Script Properties）
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

  let queue;
  try { queue = JSON.parse(json) || []; }
  catch (e) {
    props.deleteProperty(key);
    return null;
  }

  if (!Array.isArray(queue) || queue.length === 0) {
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
// 時間トリガー掃除（増殖防止）
// =====================
function cleanupTimeTriggers_(handlerName) {
  ScriptApp.getProjectTriggers()
    .filter(t =>
      t.getHandlerFunction() === handlerName &&
      t.getEventType() === ScriptApp.EventType.CLOCK
    )
    .forEach(t => ScriptApp.deleteTrigger(t));
}

// =====================
// GitHub 設定取得
// =====================
function getGitHubConfig_() {
  const props = PropertiesService.getScriptProperties();
  const owner  = props.getProperty("GH_OWNER");
  const repo   = props.getProperty("GH_REPO");
  const branch = props.getProperty("GH_BRANCH") || "main";
  const token  = props.getProperty("GITHUB_TOKEN");

  if (!owner || !repo) throw new Error("GitHub repo config missing (GH_OWNER / GH_REPO)");
  if (!token) throw new Error("GITHUB_TOKEN missing");

  return { owner, repo, branch, token };
}

// =====================
// GitHub: 任意パスにテキストを push
// =====================
function pushTextToGitHubPath_(path, contentText) {
  const conf = getGitHubConfig_();
  const baseUrl =
    `https://api.github.com/repos/${conf.owner}/${conf.repo}/contents/` +
    encodeURIComponent(path).replace(/%2F/g, "/");

  // 既存 sha を取得（なければ新規作成）
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
