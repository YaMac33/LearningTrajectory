/* docs/assets/app.js
 * - カテゴリツリー生成
 * - 検索 + カテゴリ絞り込み
 * - iPadでも原因が分かるように、エラーは画面に表示
 */

(() => {
  // ===============================
  // Config
  // ===============================
  const DATA_URL = "./data/index.json";

  // ===============================
  // DOM helpers (null-safe)
  // ===============================
  const $ = (id) => document.getElementById(id);

  const yearEl = $("year");
  const list = $("postList");
  const searchInput = $("searchInput");
  const noResults = $("noResults");
  const loadingState = $("loadingState");
  const loadError = $("loadError");
  const loadErrorMsg = $("loadErrorMsg");

  // categoryTree は無くても動く（必要ならJSで作る）
  let categoryTreeEl = $("categoryTree");

  // ===============================
  // State
  // ===============================
  let allPosts = [];
  let currentFilter = { lv1: "", lv2: "" };

  // ===============================
  // Category slug maps (Actionsと同じ)
  // ===============================
  const LV1_SLUG = {
    "ストラテジ系": "strategy",
    "マネジメント系": "management",
    "テクノロジ系": "technology",
  };

  const LV2_SLUG = {
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

  // ===============================
  // Utils
  // ===============================
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeTags(tags) {
    if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
    if (typeof tags === "string") return tags.split(",").map((t) => t.trim()).filter(Boolean);
    return [];
  }

  function formatDateJa(timestamp) {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
  }

  function toDatetimeAttr(timestamp) {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function normalizePostPath(p) {
    // "posts/xxx/" を想定。先頭スラッシュは剥がす。末尾は / に揃える
    let s = String(p || "").trim().replace(/^\/+/, "");
    if (s && !s.endsWith("/")) s += "/";
    return s;
  }

  function makeArticleUrl(p) {
    // まず post_path を最優先（Project Pagesでも壊れない相対）
    const postPath = normalizePostPath(p.post_path);
    if (postPath) return `./${postPath}`;

    // 次に repo_path（例: "/docs/posts/xxx/index.html" などが来た場合に雑に正規化）
    const repoPath = String(p.repo_path || "").trim();
    if (repoPath) return repoPath.replace(/^\/+/, "./");

    // 最後に public_url（外部URL）
    const publicUrl = String(p.public_url || "").trim();
    if (publicUrl) return publicUrl;

    return "#";
  }

  function ensureCategoryTreeMount() {
    if (categoryTreeEl) return categoryTreeEl;

    const main = document.querySelector("main");
    if (!main) return null;

    categoryTreeEl = document.createElement("section");
    categoryTreeEl.id = "categoryTree";
    categoryTreeEl.style.margin = "0 0 18px 0";

    const searchWrap = document.querySelector(".search-wrap");
    if (searchWrap && searchWrap.parentNode === main) {
      main.insertBefore(categoryTreeEl, searchWrap);
    } else {
      main.insertBefore(categoryTreeEl, main.firstChild);
    }
    return categoryTreeEl;
  }

  // ===============================
  // Error display (iPad friendly)
  // ===============================
  function showError(err) {
    if (loadError) loadError.style.display = "block";
    if (loadErrorMsg) {
      loadErrorMsg.textContent =
        (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err);
    }
  }

  // 予期せぬ例外も画面に出す
  window.addEventListener("error", (e) => {
    try { showError(e.error || e.message || e); } catch (_) {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try { showError(e.reason || e); } catch (_) {}
  });

  // ===============================
  // Tree building
  // ===============================
  function buildCategoryTree(posts) {
    // { lv1: { lv2: [post, ...] } }
    const tree = {};
    for (const p of posts) {
      const lv1 = String(p.category_lv1 || "").trim();
      const lv2 = String(p.category_lv2 || "").trim();
      if (!lv1 || !lv2) continue;
      tree[lv1] ||= {};
      tree[lv1][lv2] ||= [];
      tree[lv1][lv2].push(p);
    }

    // 各カテゴリ内は新しい順
    for (const lv1 of Object.keys(tree)) {
      for (const lv2 of Object.keys(tree[lv1])) {
        tree[lv1][lv2].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      }
    }
    return tree;
  }

  function applyFiltersAndRender() {
    const q = (searchInput?.value || "").toLowerCase();
    const lv1 = currentFilter.lv1;
    const lv2 = currentFilter.lv2;

    const filtered = allPosts.filter((p) => {
      const matchText =
        String(p.title || "").toLowerCase().includes(q) ||
        String(p.summary || "").toLowerCase().includes(q) ||
        (Array.isArray(p.tags) ? p.tags.join(" ").toLowerCase() : "").includes(q);

      const matchLv1 = !lv1 || p.category_lv1 === lv1;
      const matchLv2 = !lv2 || p.category_lv2 === lv2;

      return matchText && matchLv1 && matchLv2;
    });

    renderPosts(filtered);
  }

  function setCategoryFilter(lv1, lv2) {
    currentFilter = { lv1: lv1 || "", lv2: lv2 || "" };
    applyFiltersAndRender();
    renderCategoryTree(allPosts);
    list?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function clearCategoryFilter() {
    currentFilter = { lv1: "", lv2: "" };
    applyFiltersAndRender();
    renderCategoryTree(allPosts);
  }

  function renderCategoryTree(posts) {
  const mount = ensureCategoryTreeMount();
  if (!mount) return;

  const tree = buildCategoryTree(posts);
  const lv1Order = ["ストラテジ系", "マネジメント系", "テクノロジ系"];

  const activeLv1 = currentFilter.lv1;
  const activeLv2 = currentFilter.lv2;

  const parts = [];
  parts.push(`
    <div class="category-tree">
      <div class="category-tree__header">
        <div>
          <div class="category-tree__title">カテゴリ</div>
          <div class="category-tree__hint">クリックで絞り込み（検索とも併用できます）</div>
        </div>
        <button type="button" id="clearCategoryBtn" class="category-tree__clear">フィルタ解除</button>
      </div>
  `);

  for (const lv1 of lv1Order.filter((x) => tree[x])) {
    const lv2Map = tree[lv1];
    const lv2Names = Object.keys(lv2Map);

    lv2Names.sort((a, b) => (lv2Map[b].length - lv2Map[a].length) || a.localeCompare(b, "ja"));

    const total = lv2Names.reduce((n, k) => n + lv2Map[k].length, 0);

    parts.push(`
      <details class="category-group" ${activeLv1 === lv1 ? "open" : ""}>
        <summary>
          <span>${escapeHtml(lv1)}</span>
          <span class="category-group__meta">${total}件</span>
        </summary>

        <div class="category-pills">
          <button type="button"
            class="category-pill ${activeLv1 === lv1 && !activeLv2 ? "is-active" : ""}"
            data-lv1="${escapeHtml(lv1)}"
            data-lv2="">
            ${escapeHtml(lv1)}（全て）
            <span class="category-pill__count">${total}</span>
          </button>
    `);

    for (const lv2 of lv2Names) {
      const count = lv2Map[lv2].length;
      parts.push(`
        <button type="button"
          class="category-pill ${activeLv1 === lv1 && activeLv2 === lv2 ? "is-active" : ""}"
          data-lv1="${escapeHtml(lv1)}"
          data-lv2="${escapeHtml(lv2)}">
          ${escapeHtml(lv2)}
          <span class="category-pill__count">${count}</span>
        </button>
      `);
    }

    parts.push(`
        </div>
      </details>
    `);
  }

  parts.push(`</div>`);
  mount.innerHTML = parts.join("");

  const clearBtn = document.getElementById("clearCategoryBtn");
  if (clearBtn) clearBtn.onclick = () => clearCategoryFilter();

  mount.querySelectorAll("button.category-pill[data-lv1]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lv1 = btn.getAttribute("data-lv1") || "";
      const lv2 = btn.getAttribute("data-lv2") || "";
      setCategoryFilter(lv1, lv2);
    });
  });
 }

  // ===============================
  // Render (List)
  // ===============================
  function renderPosts(posts) {
    if (!list) return;

    list.innerHTML = "";

    if (!posts || posts.length === 0) {
      if (noResults) noResults.style.display = "block";
      return;
    }
    if (noResults) noResults.style.display = "none";

    posts.forEach((post) => {
      const dateLabel = formatDateJa(post.timestamp);
      const datetime = toDatetimeAttr(post.timestamp);

      const safeTitle = escapeHtml(post.title);
      const safeSummary = escapeHtml(post.summary);
      const url = escapeHtml(post.url || "#");

      const catLabel =
        post.category_lv1 && post.category_lv2
          ? `<div class="post-meta" style="margin-top:6px;">${escapeHtml(post.category_lv1)} / ${escapeHtml(post.category_lv2)}</div>`
          : "";

      const li = document.createElement("li");
      li.className = "post-item";
      li.innerHTML = `
        <article>
          <time class="post-meta" datetime="${escapeHtml(datetime)}">${escapeHtml(dateLabel)}</time>
          ${catLabel}
          <h2 class="post-title">
            <a href="${url}">${safeTitle}</a>
          </h2>
          <p class="post-excerpt">${safeSummary}</p>
          <a href="${url}" class="read-more">Read Article →</a>
        </article>
      `;
      list.appendChild(li);
    });
  }

  // ===============================
  // Fetch
  // ===============================
  async function loadPosts() {
    try {
      if (yearEl) yearEl.textContent = String(new Date().getFullYear());

      // まず読み込み中表示（既にHTMLにあるので基本はそのままでOK）
      if (loadError) loadError.style.display = "none";
      if (loadErrorMsg) loadErrorMsg.textContent = "";

      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch ${DATA_URL} (HTTP ${res.status})`);

      const raw = await res.json();
      const json = Array.isArray(raw) ? raw : (Array.isArray(raw.articles) ? raw.articles : []);

      allPosts = (json || []).map((p) => ({
        id: p.id || p.dir || p.dr || "",
        title: p.title || "",
        summary: p.summary || "",
        tags: normalizeTags(p.tags),
        timestamp: p.timestamp || "",
        category_lv1: p.category_lv1 || "",
        category_lv2: p.category_lv2 || "",
        post_path: p.post_path || "",
        url: makeArticleUrl(p),
      }));

      allPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // ツリー描画 → 一覧描画
      renderCategoryTree(allPosts);
      renderPosts(allPosts);
    } catch (e) {
      showError(e);
    } finally {
      // Loading は必ず消す
      try { loadingState?.remove?.(); } catch (_) {}
    }
  }

  // ===============================
  // Events
  // ===============================
  if (searchInput) {
    searchInput.addEventListener("input", () => applyFiltersAndRender());
  }

  // Init
  loadPosts();
})();
