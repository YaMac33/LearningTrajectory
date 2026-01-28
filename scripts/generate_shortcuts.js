/* scripts/generate_shortcuts.js */
const fs = require("fs");
const path = require("path");

// ====== slug マップ ======
const LV1 = {
  "ストラテジ系": "strategy",
  "マネジメント系": "management",
  "テクノロジ系": "technology",
};

const LV2 = {
  "企業と法務": "corporate-law",
  "経営戦略": "business-strategy",
  "マーケティング": "marketing",
  "財務": "finance",
  "事業継続": "business-continuity",

  "開発技術": "development",
  "プロジェクトマネジメント": "project-management",
  "サービスマネジメント": "service-management",

  "基礎理論": "fundamentals",
  "コンピュータシステム": "computer-systems",
  "ネットワーク": "network",
  "データベース": "database",
  "セキュリティ": "security",
  "新技術・先端技術": "emerging-tech",
};

// taxonomy が無い/不明なときの「固定スラッグ」（階層を揃えるため）
const FALLBACK_LV1 = "uncategorized";
const FALLBACK_LV2 = "misc";

// ====== 入出力パス ======
const NEW_ITEMS_DIR = path.join("docs", "data", "new_items");
const DOCS_DIR = "docs";

/**
 * docs/<category>/<lv1>/<lv2>/<id>/index.html から
 * docs/<category>/posts/<slug>/ へ飛ばす相対パスは
 * "../../../../" + post_path
 * （post_path は docs 配下相対: "itpassport/posts/xxx/" のような形）
 */
function makeRedirectHtml(targetRelativePath) {
  const escaped = escapeHtml(targetRelativePath);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0; url=${escaped}" />
  <link rel="canonical" href="${escaped}" />
  <meta name="robots" content="noindex" />
  <title>Redirecting...</title>
</head>
<body>
  <p>Redirecting to <a href="${escaped}">${escaped}</a></p>
</body>
</html>
`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizePostPath(p) {
  // docs配下の相対パスを想定: "itpassport/posts/xxx/"
  let s = String(p || "").trim();
  s = s.replace(/^\/+/, ""); // 先頭/除去
  if (s && !s.endsWith("/")) s += "/";
  return s;
}

function readJsonSafe(fullPath) {
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    return null;
  }
}

function getTaxonomyNames(metaObj) {
  // 新仕様: meta.meta.taxonomy = ["テクノロジ系","ネットワーク"] など
  const tax = metaObj?.meta?.taxonomy;
  if (Array.isArray(tax)) {
    const a = String(tax[0] || "").trim();
    const b = String(tax[1] || "").trim();
    return { lv1Name: a, lv2Name: b };
  }

  // 後方互換（旧仕様）
  const lv1Name = String(metaObj?.category_lv1 || "").trim();
  const lv2Name = String(metaObj?.category_lv2 || "").trim();
  return { lv1Name, lv2Name };
}

function main() {
  if (!fs.existsSync(NEW_ITEMS_DIR)) {
    console.log(`[skip] ${NEW_ITEMS_DIR} not found`);
    return;
  }

  const files = fs.readdirSync(NEW_ITEMS_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("[skip] no new_items json");
    return;
  }

  let generated = 0;

  for (const file of files) {
    const full = path.join(NEW_ITEMS_DIR, file);
    const meta = readJsonSafe(full);
    if (!meta) {
      console.log(`[warn] invalid json: ${full}`);
      continue;
    }

    const id = String(meta.id || "").trim();               // "itpassport-xxxx"
    const category = String(meta.category || "").trim();   // "itpassport"
    const postPath = normalizePostPath(meta.post_path);    // "itpassport/posts/xxx/"

    if (!id || !category || !postPath) {
      console.log(`[warn] missing fields (id/category/post_path) in ${file}`);
      continue;
    }

    const { lv1Name, lv2Name } = getTaxonomyNames(meta);

    // taxonomy が揃っていればマップからslug化、無ければ固定の fallback slug を使う
    let lv1Slug = lv1Name ? LV1[lv1Name] : "";
    let lv2Slug = lv2Name ? LV2[lv2Name] : "";

    if (!lv1Slug) lv1Slug = FALLBACK_LV1;
    if (!lv2Slug) lv2Slug = FALLBACK_LV2;

    // taxonomy はあるが辞書に無い → それも fallback に落とす（運用で手直ししやすい）
    if (lv1Name && !LV1[lv1Name]) lv1Slug = FALLBACK_LV1;
    if (lv2Name && !LV2[lv2Name]) lv2Slug = FALLBACK_LV2;

    // 出力先: docs/<category>/<lv1>/<lv2>/<id>/index.html
    // そこから docs/<post_path> へ: "../../../../" + postPath
    const target = `../../../../${postPath}`;

    const outDir = path.join(DOCS_DIR, category, lv1Slug, lv2Slug, id);
    ensureDir(outDir);

    const outPath = path.join(outDir, "index.html");
    fs.writeFileSync(outPath, makeRedirectHtml(target), "utf8");

    generated++;
  }

  console.log(`[ok] generated shortcuts: ${generated}`);
}

main();
