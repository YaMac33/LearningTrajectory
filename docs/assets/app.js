/* docs/assets/app.js */

const INDEX_URL = "./data/index.json";

// categoryページ用：<body data-category="itpassport" data-root-prefix="../">
const PAGE_CATEGORY = document.body.dataset.category || "";     // ""なら全体トップ
const ROOT_PREFIX   = document.body.dataset.rootPrefix || "./"; // 全体トップは "./", categoryトップは "../"

const treeRoot   = document.getElementById("categoryTree");
const postList   = document.getElementById("postList");
const searchInput = document.getElementById("searchInput");

const loadingState = document.getElementById("loadingState");
const noResults    = document.getElementById("noResults");
const loadError    = document.getElementById("loadError");
const loadErrorMsg = document.getElementById("loadErrorMsg");

let allPosts = [];
let currentFilter = null;

fetch(INDEX_URL)
  .then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  })
  .then((data) => {
    allPosts = Array.isArray(data) ? data : [];

    // categoryページなら、そのcategoryだけに絞る（同構造維持）
    if (PAGE_CATEGORY) {
      allPosts = allPosts.filter(p => (p.category || "") === PAGE_CATEGORY);
    }

    if (loadingState) loadingState.remove();

    buildCategoryTree(allPosts);
    renderPosts(allPosts);
  })
  .catch((err) => {
    if (loadingState) loadingState.remove();
    if (loadError) loadError.style.display = "block";
    if (loadErrorMsg) loadErrorMsg.textContent = err.message;
  });

/* =========================
   Tree builder
========================= */
function buildCategoryTree(posts) {
  const tree = {};

  for (const p of posts) {
    const category = p.category || "unknown";
    const taxonomy = Array.isArray(p.taxonomy) ? p.taxonomy : [];
    const lv1 = taxonomy[0] || "uncategorized";
    const lv2 = taxonomy[1] || "misc";

    tree[category] ??= {};
    tree[category][lv1] ??= {};
    tree[category][lv1][lv2] ??= 0;
    tree[category][lv1][lv2]++;
  }

  treeRoot.innerHTML = "";

  Object.entries(tree).forEach(([category, lv1Map]) => {
    const group = document.createElement("details");
    group.className = "category-group";
    group.open = true;

    const total = Object.values(lv1Map)
      .flatMap(v => Object.values(v))
      .reduce((a, b) => a + b, 0);

    // 全体トップは category見出しを出す / categoryトップは省略してもいいが、同構造のため残す
    group.innerHTML = `
      <summary>
        <span>${escapeHtml(category)}</span>
        <span class="category-group__meta">${total}</span>
      </summary>
    `;

    Object.entries(lv1Map).forEach(([lv1, lv2Map]) => {
      const pills = document.createElement("div");
      pills.className = "category-pills";

      Object.entries(lv2Map).forEach(([lv2, count]) => {
        const btn = document.createElement("button");
        btn.className = "category-pill";
        btn.innerHTML = `
          ${escapeHtml(lv1)} / ${escapeHtml(lv2)}
          <span class="category-pill__count">${count}</span>
        `;

        btn.onclick = () => {
          currentFilter = { category, lv1, lv2 };
          renderPosts(posts);
          setActive(btn);
        };

        pills.appendChild(btn);
      });

      group.appendChild(pills);
    });

    treeRoot.appendChild(group);
  });
}

/* =========================
   Post list
========================= */
function renderPosts(posts) {
  postList.innerHTML = "";

  let filtered = posts;

  if (currentFilter) {
    filtered = posts.filter(p => {
      const t = Array.isArray(p.taxonomy) ? p.taxonomy : [];
      return (
        (p.category || "unknown") === currentFilter.category &&
        (t[0] || "uncategorized") === currentFilter.lv1 &&
        (t[1] || "misc") === currentFilter.lv2
      );
    });
  }

  const q = (searchInput?.value || "").trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(p =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.summary || "").toLowerCase().includes(q) ||
      (Array.isArray(p.tags) && p.tags.join(" ").toLowerCase().includes(q))
    );
  }

  if (noResults) noResults.style.display = filtered.length ? "none" : "block";

  for (const p of filtered) {
    const li = document.createElement("li");
    li.className = "post-item";

    const date = p.timestamp ? new Date(p.timestamp).toLocaleDateString("ja-JP") : "";

    li.innerHTML = `
      <article>
        <time class="post-meta">${date}${PAGE_CATEGORY ? "" : " / " + escapeHtml(p.category || "")}</time>
        <h2 class="post-title">
          <a href="${ROOT_PREFIX}${p.post_path}">${escapeHtml(p.title)}</a>
        </h2>
        <p class="post-excerpt">${escapeHtml(p.summary)}</p>
      </article>
    `;
    postList.appendChild(li);
  }
}

if (searchInput) {
  searchInput.addEventListener("input", () => renderPosts(allPosts));
}

function setActive(activeBtn) {
  document.querySelectorAll(".category-pill").forEach(b => b.classList.remove("is-active"));
  activeBtn.classList.add("is-active");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();
