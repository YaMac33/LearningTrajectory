document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('article-list');
  const countLabel = document.getElementById('article-count');

  if (!listContainer || !countLabel) {
    console.error('Missing DOM nodes:', { listContainer, countLabel });
    return;
  }

  const DATA_URL = './data/index.json';

  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('ja-JP', options);
  };

  const init = async () => {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      console.log('fetch', DATA_URL, response.status);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const articles = await response.json();
      console.log('articles[0]', articles?.[0]);

      articles.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      countLabel.textContent = `${articles.length} posts`;

      if (!Array.isArray(articles) || articles.length === 0) {
        listContainer.innerHTML = '<p style="color:#888;">記事はまだありません。</p>';
        return;
      }

      const html = articles.map((article, index) => {
        const delayStyle = `animation-delay: ${index * 0.05}s`;

        const tags = Array.isArray(article.tags) ? article.tags : [];
        const tagsHtml = tags.map(tag => `<span class="tag">#${tag}</span>`).join('');

        // ✅ トップ(/repo/) → 記事(/repo/name/) なので ./name/
        const linkPath = `./${article.dir}/`;

        return `
          <article class="article-card fade-in" style="${delayStyle}" onclick="location.href='${linkPath}'">
            <div class="card-header">
              <h3 class="card-title">
                <a href="${linkPath}">${article.title ?? '(no title)'}</a>
              </h3>
              <time class="card-date" datetime="${article.date ?? ''}">
                ${article.date ? formatDate(article.date) : ''}
              </time>
            </div>

            <p class="card-summary">
              ${article.summary ?? ''}
            </p>

            <div class="card-footer">
              <div class="tags">
                ${tagsHtml}
              </div>
              <span class="read-more">Read more &rarr;</span>
            </div>
          </article>
        `;
      }).join('');

      listContainer.innerHTML = html;

    } catch (error) {
      console.error('記事データの取得に失敗しました:', error);
      listContainer.innerHTML = '<p style="color:red;">記事データの読み込みに失敗しました。</p>';
      countLabel.textContent = 'Error';
    }
  };

  init();
});
