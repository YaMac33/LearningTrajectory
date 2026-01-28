// scripts/build_index.js
// new_items (docs/data/new_items/*.json) を取り込み、
// docs/data/index.json（横断）と docs/<category>/data/index.json（分類別）を再生成する。

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const NEW_ITEMS_DIR = path.join(ROOT, "docs", "data", "new_items");
const GLOBAL_INDEX_PATH = path.join(ROOT, "docs", "data", "index.json");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonOrDefault(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const txt = fs.readFileSync(filePath, "utf8").trim();
    if (!txt) return defaultValue;
    return JSON.parse(txt);
  } catch (e) {
    console.error(`Failed to read JSON: ${filePath}`, e);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));
}

function normalizeRecord(newItem) {
  // LearningTrajectory.gs が出力する new_items の想定:
  // {
  //   id, category, timestamp, post_path,
  //   meta: { title, summary, tags, taxonomy, dr, status }
  // }
  const id = String(newItem?.id || "").trim();
  const category = String(newItem?.category || "").trim();
  const timestamp = String(newItem?.timestamp || "").trim();
  const post_path = String(newItem?.post_path || "").trim();

  const meta = newItem?.meta || {};
  const title = String(meta?.title || "").trim();
  const summary = String(meta?.summary || "").trim();
  const status = String(meta?.status || "public").trim().toLowerCase();

  const tags = Array.isArray(meta?.tags)
    ? meta.tags.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  const taxonomy = Array.isArray(meta?.taxonomy)
    ? meta.taxonomy.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  const dr = meta?.dr ?? null;

  if (!id || !category || !timestamp || !post_path) return null;

  return {
    id,
    category,
    timestamp,
    title,
    summary,
    tags,
    taxonomy,
    dr,
    status,
    post_path, // "itpassport/posts/....../"
  };
}

function parseTime(t) {
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : 0;
}

function main() {
  // 既存の横断 index を読む（無ければ空配列）
  const globalIndex = readJsonOrDefault(GLOBAL_INDEX_PATH, []);
  const byId = new Map();

  if (Array.isArray(globalIndex)) {
    for (const r of globalIndex) {
      if (r && r.id) byId.set(String(r.id), r);
    }
  }

  // new_items を全部読む
  const files = listJsonFiles(NEW_ITEMS_DIR);
  if (files.length === 0) {
    console.log("No new_items found. Nothing to do.");
  }

  let imported = 0;
  for (const fp of files) {
    const obj = readJsonOrDefault(fp, null);
    if (!obj) continue;

    const rec = normalizeRecord(obj);
    if (!rec) {
      console.warn(`Skip invalid new_item: ${fp}`);
      continue;
    }

    // upsert
    const prev = byId.get(rec.id) || {};
    byId.set(rec.id, { ...prev, ...rec });
    imported++;
  }

  // 配列化して timestamp desc
  const merged = Array.from(byId.values()).sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp));

  // 横断 index.json を書く
  writeJson(GLOBAL_INDEX_PATH, merged);
  console.log(`Updated global index: ${GLOBAL_INDEX_PATH}`);
  console.log(`Imported new_items: ${imported}, total records: ${merged.length}`);

  // 分類別 index.json を再生成
  const byCategory = new Map();
  for (const r of merged) {
    const cat = r.category;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(r);
  }

  for (const [cat, arr] of byCategory.entries()) {
    const outPath = path.join(ROOT, "docs", cat, "data", "index.json");
    writeJson(outPath, arr);
    console.log(`Updated category index: ${outPath} (${arr.length})`);
  }
}

main();
