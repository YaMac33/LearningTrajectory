/* scripts/generate_category_pages.js */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const GLOBAL_INDEX = path.join(ROOT, "docs", "data", "index.json");

// 共通テンプレ（カテゴリトップ用）
// - assets参照は ../assets/... に固定
// - index.json は ./data/index.json（カテゴリ配下の分類index）を読む
function renderCategoryIndexHtml(category) {
  const esc = escapeHtml(category);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-MQ9ZB4LYWP"></script>
  <script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-MQ9ZB4LYWP');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Learning Trajectory - ${esc}</title>
  <meta name="description" content="Category: ${esc}">
  <link rel="stylesheet" href="../assets/styles.css">
</head>

<body data-category="${esc}" data-root-prefix="../">
  <div class="container">
    <header class="site-header">
      <a href="../index.html" class="site-title">Learning Trajectory</a>
    </header>

    <main>
      <div class="search-wrap">
        <input
          type="text"
          id="searchInput"
          class="search-input"
          placeholder="Search posts (title / summary / tags)"
          aria-label="Search posts"
        />
      </div>

      <section class="category-tree">
        <div class="category-tree__header">
          <h2 class="category-tree__title">Category Map</h2>
          <span class="category-tree__hint">クリックして絞り込み</span>
        </div>
        <div id="categoryTree"></div>
      </section>

      <ul class="post-list" id="postList">
        <li id="loadingState" class="post-item">
          <article>
            <time class="post-meta">Loading...</time>
            <h2 class="post-title">Loading posts</h2>
            <p class="post-excerpt">Please wait.</p>
          </article>
        </li>
      </ul>

      <div id="noResults" style="display:none;">No posts found</div>

      <div id="loadError" style="display:none;">
        Failed to load index.json
        <div id="loadErrorMsg"></div>
      </div>
    </main>

    <footer class="site-footer">
      <p>&copy; <span id="year"></span> Learning Trajectory. All rights reserved.</p>
    </footer>
  </div>

  <script src="../assets/app.js"></script>
</body>
</html>
`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJson(filePath) {
  const txt = fs.readFileSync(filePath, "utf8").trim();
  return txt ? JSON.parse(txt) : [];
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function main() {
  if (!fs.existsSync(GLOBAL_INDEX)) {
    console.log(`[skip] ${GLOBAL_INDEX} not found`);
    return;
  }

  const index = readJson(GLOBAL_INDEX);
  if (!Array.isArray(index) || index.length === 0) {
    console.log("[skip] global index is empty");
    return;
  }

  const categories = Array.from(
    new Set(
      index
        .map((x) => (x && x.category ? String(x.category).trim() : ""))
        .filter(Boolean)
    )
  ).sort();

  let generated = 0;

  for (const cat of categories) {
    const outDir = path.join(ROOT, "docs", cat);
    ensureDir(outDir);

    const outPath = path.join(outDir, "index.html");
    fs.writeFileSync(outPath, renderCategoryIndexHtml(cat), "utf8");
    generated++;
  }

  console.log(`[ok] generated category index.html: ${generated}`);
}

main();
