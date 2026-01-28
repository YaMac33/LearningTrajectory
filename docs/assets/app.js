/* docs/assets/app.js */
/* Top page: Category / Taxonomy Tree */

const INDEX_URL = "./data/index.json";

const treeRoot = document.getElementById("categoryTree");
const postList = document.getElementById("postList");
const searchInput = document.getElementById("searchInput");

let allPosts = [];
let currentFilter = null;

fetch(INDEX_URL)
  .then(res => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  })
  .then(data => {
    allPosts = Array.isArray(data) ? data : [];
    buildCategoryTree(allPosts);
    renderPosts(allPosts);
  })
  .catch(err => {
    console.error(err);
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
          renderPosts(allPosts);
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
        p.category === currentFilter.category &&
        (t[0] || "uncategorized") === currentFilter.lv1 &&
        (t[1] || "misc") === currentFilter.lv2
      );
    });
  }

  filtered.forEach(p => {
    const li = document.createElement("li");
    li.className = "post-item";
    li.innerHTML = `
      <time class="post-meta">${new Date(p.timestamp).toLocaleDateString("ja-JP")}</time>
      <h2 class="post-title">
        <a href="./${p.post_path}">${escapeHtml(p.title)}</a>
      </h2>
      <p class="post-excerpt">${escapeHtml(p.summary)}</p>
    `;
    postList.appendChild(li);
  });
}

/* =========================
   Helpers
========================= */
function setActive(activeBtn) {
  document
    .querySelectorAll(".category-pill")
    .forEach(b => b.classList.remove("is-active"));
  activeBtn.classList.add("is-active");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

document.getElementById("year").textContent = new Date().getFullYear();
