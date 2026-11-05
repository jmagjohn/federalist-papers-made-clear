#!/usr/bin/env node
/**
 * Builds the static site into dist/. No dependencies.
 *   node scripts/build.js
 */
const fs = require('fs');
const path = require('path');
const { parsePaper, parseBlocks, inline, plain, escapeHtml: esc, slugify } = require('./lib/markdown');
const { gradeLevel, joinBlocks } = require('./lib/readability');

const ROOT = path.join(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');
const SITE_NAME = 'The Federalist, Made Clear';
const REPO_URL = 'https://github.com/jmagjohn/federalist-papers-made-clear';
const SITE_URL = (process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')).replace(/\/$/, '');
const BUILD_ID = Date.now().toString(36);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const paperUrl = (n) => `/papers/${n}/`;
const wordCount = (s) => (s.match(/[A-Za-z][A-Za-z'\-]*/g) || []).length;
const minutes = (words) => Math.max(1, Math.round(words / 200));

// ---------------------------------------------------------------- load data
const taxonomy = readJson(path.join(CONTENT, 'taxonomy.json'));
const catalog = readJson(path.join(CONTENT, 'catalog.json'));
const readingPath = readJson(path.join(CONTENT, 'reading-path.json'));
const themeBySlug = Object.fromEntries(taxonomy.themes.map((t) => [t.slug, t]));
const partFor = (n) => taxonomy.parts.find((p) => n >= p.range[0] && n <= p.range[1]);

const papers = catalog.map((c) => {
  const original = readJson(path.join(CONTENT, 'originals', pad(c.n) + '.json'));
  const mdPath = path.join(CONTENT, 'papers', pad(c.n) + '.md');
  let adapted = null;
  if (fs.existsSync(mdPath)) {
    try {
      adapted = parsePaper(fs.readFileSync(mdPath, 'utf8'));
    } catch (e) {
      throw new Error(`content/papers/${pad(c.n)}.md: ${e.message}`);
    }
  }
  for (const t of c.themes) if (!themeBySlug[t]) throw new Error(`Paper ${c.n}: unknown theme ${t}`);
  const dateMatch = original.published.match(/([A-Z][a-z]+day),?\s+([A-Z][a-z]+ \d{1,2}, \d{4})/);
  const outletMatch = original.published.match(/(?:For|From) (?:the |The )?(.*?)\.?\s+[A-Z][a-z]+day/i);
  const p = {
    ...c,
    part: partFor(c.n),
    authorInfo: taxonomy.authors[c.author],
    disputed: (c.n >= 49 && c.n <= 58) || c.n === 62 || c.n === 63,
    original,
    date: dateMatch ? dateMatch[2] : '',
    outlet: outletMatch ? outletMatch[1].replace(/^the /i, '') : '',
    adapted,
  };
  const origText = original.paragraphs.join(' ');
  p.origWords = wordCount(origText);
  p.origGrade = gradeLevel(origText);
  if (adapted) {
    const mainText = joinBlocks(
      adapted.sections
        .flatMap((s) => s.blocks.filter((b) => b.type !== 'box' && b.type !== 'h3' && b.type !== 'bq'))
        .map((b) => plain(b.text || b.items.join('. ')))
    );
    p.plainGrade = gradeLevel(mainText);
    p.plainWords = wordCount(mainText);
    const allText = [
      ...adapted.front,
      ...adapted.sections.flatMap((s) => s.blocks),
      ...adapted.back,
    ];
    p.totalWords = wordCount(allText.map(blockText).join(' '));
    // check orig refs
    for (const s of adapted.sections)
      for (const i of s.orig)
        if (i < 1 || i > original.paragraphs.length)
          throw new Error(`Paper ${c.n}, section "${s.title}": original paragraph ${i} does not exist (has ${original.paragraphs.length})`);
  }
  return p;
});
const byN = Object.fromEntries(papers.map((p) => [p.n, p]));
const adaptedCount = papers.filter((p) => p.adapted).length;

function blockText(b) {
  if (b.type === 'box') {
    if (b.terms) return b.terms.map((t) => `${t.term}: ${plain(t.def)}`).join(' ');
    return [b.title || '', ...b.blocks.map(blockText)].join(' ');
  }
  if (b.items) return b.items.map(plain).join(' ');
  return plain(b.text || '');
}

// ---------------------------------------------------------------- html helpers
const BOX_LABELS = {
  summary: 'In a nutshell',
  keypoints: 'Key points',
  context: 'Background',
  commentary: 'Commentary',
  vocab: 'Words to know',
  quote: 'In the original words',
  today: 'Why it still matters',
  questions: 'Think about it',
  note: 'Note',
  connection: 'Connections',
};
const BOX_ICONS = {
  summary: '◆', keypoints: '✓', context: '⌛', commentary: '✎', vocab: 'Aa', quote: '❝', today: '⟳', questions: '?', note: 'ℹ', connection: '↔',
};

function renderBlocks(blocks, opts = {}) {
  return blocks.map((b) => renderBlock(b, opts)).join('\n');
}

function renderBlock(b, opts) {
  switch (b.type) {
    case 'p':
      if (opts.quote && /^Meaning:/i.test(b.text))
        return `<p class="quote-meaning"><span>What it means:</span> ${inline(b.text.replace(/^Meaning:\s*/i, ''))}</p>`;
      return `<p>${inline(b.text)}</p>`;
    case 'h3':
      return `<h3>${inline(b.text)}</h3>`;
    case 'ul':
      return `<ul>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
    case 'ol':
      return `<ol>${b.items.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`;
    case 'bq':
      return `<blockquote><p>${inline(b.text)}</p></blockquote>`;
    case 'box':
      return renderBox(b);
    default:
      return '';
  }
}

function renderBox(b) {
  const label = b.title || BOX_LABELS[b.kind] || b.kind;
  const icon = BOX_ICONS[b.kind] || '•';
  let inner;
  if (b.kind === 'vocab') {
    inner = `<dl>${b.terms
      .map((t) => `<div><dt id="term-${slugify(t.term)}">${esc(t.term)}</dt><dd>${inline(t.def)}</dd></div>`)
      .join('')}</dl>`;
  } else if (b.kind === 'quote') {
    inner = renderBlocks(b.blocks, { quote: true });
  } else {
    inner = renderBlocks(b.blocks);
  }
  const tag = b.kind === 'quote' ? 'figure' : 'aside';
  return `<${tag} class="box box-${esc(b.kind)}" aria-label="${esc(label)}"><div class="box-label"><span class="box-icon" aria-hidden="true">${icon}</span>${esc(label)}</div><div class="box-body">${inner}</div></${tag}>`;
}

const authorLink = (p) =>
  p.author === 'madison-hamilton'
    ? `<a href="/authors/madison/">James Madison</a>, with <a href="/authors/hamilton/">Alexander Hamilton</a>`
    : `<a href="/authors/${p.author}/">${esc(p.authorInfo.name)}</a>`;

function chips(p) {
  return `<ul class="chips" aria-label="Categories">
    <li><a class="chip chip-part" href="/parts/${p.part.slug}/">${esc(p.part.name)}</a></li>
    ${p.themes.map((t) => `<li><a class="chip" href="/topics/${t}/">${esc(themeBySlug[t].name)}</a></li>`).join('')}
  </ul>`;
}

function statusBadge(p) {
  return p.adapted
    ? `<span class="badge badge-ready" title="Full plain-language version available">Plain version</span>`
    : `<span class="badge badge-summary" title="Summary and original text available; full plain-language version coming">Summary</span>`;
}

function paperCard(p, extra = '') {
  return `<li class="card paper-card">
    <a class="card-link" href="${paperUrl(p.n)}">
      <span class="card-num">No. ${p.n}</span>
      <span class="card-title">${esc(p.title)}</span>
    </a>
    <p class="card-meta">${esc(p.authorInfo.short)}${p.date ? ' · ' + esc(p.date.replace(/, \d{4}$/, (y) => y)) : ''} ${statusBadge(p)}</p>
    ${extra ? `<p class="card-why">${extra}</p>` : `<p class="card-summary">${esc(truncate(p.summary, 180))}</p>`}
  </li>`;
}

function truncate(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.]$/, '') + '…';
}

function paperRow(p) {
  return `<li class="toc-row" data-n="${p.n}" data-author="${p.author}" data-ready="${p.adapted ? 1 : 0}" data-essential="${p.rank && p.rank <= 20 ? 1 : 0}" data-text="${esc(
    (p.title + ' ' + p.original.title + ' ' + p.summary).toLowerCase()
  )}">
    <a href="${paperUrl(p.n)}" class="toc-link">
      <span class="toc-num">${p.n}</span>
      <span class="toc-main">
        <span class="toc-title">${esc(p.title)}${p.rank && p.rank <= 20 ? ' <span class="star" title="Essential reading" aria-label="Essential reading">★</span>' : ''}</span>
        <span class="toc-orig">${esc(p.original.title)}</span>
      </span>
      <span class="toc-side">
        <span class="toc-author">${esc(p.authorInfo.short)}</span>
        ${statusBadge(p)}
      </span>
    </a>
  </li>`;
}

// ---------------------------------------------------------------- layout
function layout({ title, description, body, pagePath, bodyClass = '' }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const desc = description || 'The Federalist Papers rewritten at a grade 8-10 reading level, with commentary, summaries, a glossary, and the original text side by side.';
  const canonical = SITE_URL ? `<link rel="canonical" href="${SITE_URL}${pagePath}">` : '';
  const browseParts = taxonomy.parts
    .map((p) => `<li><a href="/parts/${p.slug}/"><span class="nav-range">${p.range[0] === p.range[1] ? p.range[0] : p.range[0] + '–' + p.range[1]}</span> ${esc(p.name)}</a></li>`)
    .join('');
  const browseThemes = taxonomy.themes.map((t) => `<li><a href="/topics/${t.slug}/">${esc(t.name)}</a></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${canonical}
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#0a3161">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Federalist">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/styles.css?v=${BUILD_ID}">
<script>
(function(){try{var s=JSON.parse(localStorage.getItem('fmc-settings')||'{}');var d=document.documentElement;if(s.theme)d.setAttribute('data-theme',s.theme);if(s.size)d.setAttribute('data-size',s.size);if(s.font)d.setAttribute('data-font',s.font);}catch(e){}})();
</script>
<script src="/app.js?v=${BUILD_ID}" defer></script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="flag-stripe" aria-hidden="true"></div>
  <div class="header-inner">
    <a class="brand" href="/" aria-label="${SITE_NAME} home">
      <span class="brand-mark" aria-hidden="true">★</span>
      <span class="brand-text"><span class="brand-top">The Federalist</span><span class="brand-bottom">Made Clear</span></span>
    </a>
    <button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      <ul class="nav-list">
        <li><a href="/start/">Start Here</a></li>
        <li><a href="/contents/">Contents</a></li>
        <li class="nav-browse">
          <details class="browse">
            <summary>Categories</summary>
            <div class="browse-panel">
              <div>
                <p class="browse-head">Parts of the series</p>
                <ul>${browseParts}</ul>
              </div>
              <div>
                <p class="browse-head">Topics</p>
                <ul>${browseThemes}</ul>
                <p class="browse-head">Authors</p>
                <ul>
                  <li><a href="/authors/hamilton/">Alexander Hamilton</a></li>
                  <li><a href="/authors/madison/">James Madison</a></li>
                  <li><a href="/authors/jay/">John Jay</a></li>
                </ul>
              </div>
            </div>
          </details>
        </li>
        <li><a href="/glossary/">Glossary</a></li>
        <li><a href="/about/">About</a></li>
      </ul>
    </nav>
    <form class="header-search" action="/search/" method="get" role="search">
      <label class="sr-only" for="header-q">Search the papers</label>
      <input id="header-q" name="q" type="search" placeholder="Search…  ( / )" autocomplete="off">
    </form>
    <button class="icon-btn settings-btn" type="button" aria-expanded="false" aria-controls="settings" aria-label="Reading settings" title="Reading settings">
      <span aria-hidden="true" class="aa">Aa</span>
    </button>
  </div>
  <div id="settings" class="settings" hidden>
    <div class="settings-inner">
      <fieldset><legend>Text size</legend>
        <button type="button" data-set="size" data-value="s">A−</button>
        <button type="button" data-set="size" data-value="m">A</button>
        <button type="button" data-set="size" data-value="l">A+</button>
        <button type="button" data-set="size" data-value="xl">A++</button>
      </fieldset>
      <fieldset><legend>Font</legend>
        <button type="button" data-set="font" data-value="serif">Serif</button>
        <button type="button" data-set="font" data-value="sans">Sans</button>
        <button type="button" data-set="font" data-value="easy">Easy-read</button>
      </fieldset>
      <fieldset><legend>Theme</legend>
        <button type="button" data-set="theme" data-value="">Parchment</button>
        <button type="button" data-set="theme" data-value="sepia">Aged</button>
        <button type="button" data-set="theme" data-value="light">Plain</button>
        <button type="button" data-set="theme" data-value="dark">Night</button>
      </fieldset>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="footer-inner">
    <div>
      <p class="footer-brand">${SITE_NAME}</p>
      <p>The Federalist Papers in modern English at a grade 8–10 reading level, with commentary and the original text side by side. ${adaptedCount} of 85 papers fully adapted so far; every paper has a summary and the complete original.</p>
    </div>
    <div>
      <p class="footer-head">Explore</p>
      <ul><li><a href="/start/">Start Here</a></li><li><a href="/contents/">Table of Contents</a></li><li><a href="/topics/">Topics</a></li><li><a href="/glossary/">Glossary</a></li><li><a href="/search/">Search</a></li></ul>
    </div>
    <div>
      <p class="footer-head">About</p>
      <ul><li><a href="/about/">About this project</a></li><li><a href="/about/#how-we-adapted">How we adapted the text</a></li><li><a href="${REPO_URL}">Source on GitHub</a></li></ul>
    </div>
  </div>
  <p class="footer-stars" aria-hidden="true">★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★ ★</p>
  <p class="footer-note">Original text: public domain, from Project Gutenberg. Plain-language versions and commentary are an interpretation, not a replacement. When it matters, check the original.</p>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- pages
function renderPaper(p) {
  const prev = byN[p.n - 1];
  const next = byN[p.n + 1];
  const o = p.original;
  const metaBits = [authorLink(p), p.outlet ? esc(p.outlet) : '', p.date ? esc(p.date) : ''].filter(Boolean).join(' · ');
  const readMins = minutes(p.adapted ? p.totalWords : p.origWords);
  const levels = p.adapted
    ? `<p class="levels"><span class="level level-plain" title="Estimated Flesch-Kincaid grade level of the plain-language text">This version: grade ${Math.round(p.plainGrade)}</span><span class="level level-orig" title="Estimated Flesch-Kincaid grade level of the 1787-88 text">Original: grade ${Math.round(p.origGrade)}</span><span class="level">${readMins} min read</span></p>`
    : `<p class="levels"><span class="level level-orig">Original: grade ${Math.round(p.origGrade)}</span><span class="level">${minutes(p.origWords)} min read (original)</span></p>`;

  const disputedNote = p.disputed
    ? `<p class="disputed">Authorship note: both Hamilton and Madison later claimed this essay. Most historians, backed by statistical studies of word use, credit Madison.</p>`
    : '';

  const origParas = (nums) =>
    nums.map((i) => `<p class="orig-p" id="o${i}"><a class="pnum" href="#o${i}" aria-label="Original paragraph ${i}">¶${i}</a> ${esc(o.paragraphs[i - 1])}</p>`).join('\n');
  const allOrig = origParas(o.paragraphs.map((_, i) => i + 1));
  const footnotes = o.footnotes.length
    ? `<div class="orig-footnotes"><p class="fn-head">Publius's footnotes</p>${o.footnotes.map((f) => `<p>${esc(f)}</p>`).join('')}</div>`
    : '';
  const fullOriginal = `<section class="original-full" id="original" aria-labelledby="original-h">
      <h2 id="original-h">The original text</h2>
      <p class="orig-head">${esc(o.title)}<br><span>${esc(o.published)}</span><br><span>${esc(o.salutation || 'To the People of the State of New York:')}</span></p>
      ${allOrig.replace(/id="o(\d+)"/g, 'id="full-o$1"').replace(/href="#o(\d+)"/g, 'href="#full-o$1"')}
      <p class="orig-sign">PUBLIUS</p>
      ${footnotes}
    </section>`;

  let main;
  let toc = '';
  if (p.adapted) {
    const a = p.adapted;
    const sectionsHtml = a.sections
      .map((s, i) => {
        const range = s.orig.length ? (s.orig.length === 1 ? `¶${s.orig[0]}` : `¶${s.orig[0]}–${s.orig[s.orig.length - 1]}`) : '';
        const orig = s.orig.length
          ? `<details class="psec-orig"><summary><span>Compare with the original</span> <span class="range">${range}</span></summary><div class="orig-body">${origParas(s.orig).replace(/id="o(\d+)"/g, `id="s${i}-o$1"`).replace(/href="#o(\d+)"/g, `href="#s${i}-o$1"`)}</div></details>`
          : '';
        return `<section class="psec" id="${s.id}" aria-labelledby="${s.id}-h">
          <h2 id="${s.id}-h"><a class="anchor" href="#${s.id}" aria-hidden="true">#</a>${inline(s.title)}</h2>
          <div class="psec-grid">
            <div class="psec-plain">${renderBlocks(s.blocks)}</div>
            ${orig}
          </div>
        </section>`;
      })
      .join('\n');
    toc = `<nav class="on-page" aria-label="On this page">
        <p class="on-page-head">On this page</p>
        <ol>${a.sections.map((s) => `<li><a href="#${s.id}">${inline(s.title)}</a></li>`).join('')}${a.back.length ? `<li><a href="#wrap-up">Wrap-up</a></li>` : ''}<li><a href="#original">Original text</a></li></ol>
      </nav>`;
    main = `
      <div class="view-switch" role="group" aria-label="Choose a view">
        <button type="button" data-view="plain" aria-pressed="true">Plain version</button>
        <button type="button" data-view="compare" aria-pressed="false">Side by side</button>
        <button type="button" data-view="original" aria-pressed="false">Original only</button>
        <button type="button" class="listen-btn" aria-pressed="false" title="Read the plain version aloud"><span aria-hidden="true">🔊</span> Listen</button>
      </div>
      <div class="plain-view">
        <div class="front">${renderBlocks(a.front)}</div>
        <details class="on-page-mobile"><summary>On this page</summary>${toc}</details>
        ${sectionsHtml}
        ${a.back.length ? `<section class="wrap-up" id="wrap-up" aria-label="Wrap-up">${renderBlocks(a.back)}</section>` : ''}
      </div>
      ${fullOriginal}`;
  } else {
    main = `
      <aside class="box box-summary" aria-label="In a nutshell"><div class="box-label"><span class="box-icon" aria-hidden="true">◆</span>In a nutshell</div><div class="box-body"><p>${esc(p.summary)}</p></div></aside>
      <aside class="box box-note coming"><div class="box-label"><span class="box-icon" aria-hidden="true">ℹ</span>Plain-language version in progress</div><div class="box-body"><p>The full grade 8–10 version of this paper hasn't been written yet. For now, use the summary above as a guide to the original text below. Browse the <a href="/contents/?ready=1">papers that are finished</a>, or <a href="${REPO_URL}">help write this one</a>.</p></div></aside>
      ${fullOriginal}`;
    toc = '';
  }

  const samePart = papers.filter((x) => x.part === p.part && x.n !== p.n);
  const related = samePart.length
    ? `<section class="related"><h2>More in “${esc(p.part.name)}”</h2><ul class="card-grid">${samePart.slice(0, 6).map((x) => paperCard(x)).join('')}</ul></section>`
    : '';

  const body = `
  <div class="paper-wrap${p.adapted ? ' has-toc' : ''}">
    <article class="paper" data-view="plain" data-n="${p.n}">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/contents/">Contents</a> <span aria-hidden="true">›</span> <a href="/parts/${p.part.slug}/">${esc(p.part.name)}</a></nav>
      <header class="paper-head">
        <p class="kicker">Federalist No. ${p.n}</p>
        <h1>${esc(p.title)}</h1>
        <p class="orig-title">Original title: <em>${esc(o.title)}</em></p>
        <p class="meta">${metaBits}</p>
        ${levels}
        ${chips(p)}
        ${disputedNote}
      </header>
      ${main}
      <nav class="pager" aria-label="Previous and next papers">
        ${prev ? `<a class="pager-prev" href="${paperUrl(prev.n)}"><span>← No. ${prev.n}</span>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="pager-next" href="${paperUrl(next.n)}"><span>No. ${next.n} →</span>${esc(next.title)}</a>` : '<span></span>'}
      </nav>
    </article>
    ${p.adapted ? `<div class="sidebar">${toc}</div>` : ''}
  </div>
  ${related}`;

  return layout({
    title: `Federalist No. ${p.n}: ${p.title}`,
    description: truncate(p.summary, 200),
    body,
    pagePath: paperUrl(p.n),
    bodyClass: 'page-paper',
  });
}

function renderHome() {
  const essentials = readingPath.essentials.map((e) => byN[e.n]);
  const pct = Math.round((adaptedCount / 85) * 100);
  const body = `
  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">85 essays · 1787–1788 · Hamilton, Madison &amp; Jay</p>
      <h1>The Federalist Papers, <span>made clear.</span></h1>
      <p class="ornament" aria-hidden="true">★★★</p>
      <p class="lede">In 1787 and 1788, three men writing as “Publius” made the case for the new U.S. Constitution. Their essays are still some of the best explanations of how American government is supposed to work. They are also hard to read. This site rewrites them in clear, modern English, without losing the argument.</p>
      <form class="hero-search" action="/search/" method="get" role="search">
        <label class="sr-only" for="hero-q">Search the Federalist Papers</label>
        <input id="hero-q" name="q" type="search" placeholder="Try “faction”, “impeachment”, or “bill of rights”" autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <p class="hero-links"><a class="btn" href="/start/">Start with the essentials</a> <a class="btn btn-ghost" href="/contents/">See all 85 papers</a></p>
    </div>
  </section>

  <section class="band">
    <div class="band-inner">
      <h2>Start here: the essential seven</h2>
      <p class="section-lede">If you only read a few, read these, in this order.</p>
      <ol class="card-grid numbered">${readingPath.essentials.map((e) => paperCard(byN[e.n], esc(e.why))).join('')}</ol>
    </div>
  </section>

  <section class="band band-alt">
    <div class="band-inner two-col">
      <div>
        <h2>What you get on every paper</h2>
        <ul class="features">
          <li><strong>A plain-language version</strong> at a grade 8–10 reading level. It follows the original argument step by step instead of dumbing it down.</li>
          <li><strong>Commentary</strong> boxes that explain background, connect ideas, and point out where the authors were wrong or controversial.</li>
          <li><strong>Words to know</strong>, collected into a <a href="/glossary/">glossary</a>.</li>
          <li><strong>Side-by-side view</strong>, so you can check any passage against the 1787 original.</li>
          <li><strong>Reading tools</strong>: adjustable text size, an easy-read font, parchment and night themes, and read-aloud.</li>
        </ul>
      </div>
      <div class="progress-card">
        <h2>Progress</h2>
        <p class="big-num">${adaptedCount}<span>/85</span></p>
        <div class="progress" role="progressbar" aria-valuenow="${adaptedCount}" aria-valuemin="0" aria-valuemax="85" aria-label="Papers adapted"><div style="width:${pct}%"></div></div>
        <p>${adaptedCount === 85 ? 'All 85 papers have a full plain-language version, a summary, commentary, and the complete original text side by side.' : 'papers have a full plain-language version. The most important papers come first. Every paper already has a summary and the complete original text.'}</p>
        <p><a href="/contents/">Browse all papers →</a></p>
      </div>
    </div>
  </section>

  <section class="band">
    <div class="band-inner">
      <h2>Browse by topic</h2>
      <ul class="topic-grid">${taxonomy.themes
        .map((t) => {
          const count = papers.filter((p) => p.themes.includes(t.slug)).length;
          return `<li><a href="/topics/${t.slug}/"><span class="topic-name">${esc(t.name)}</span><span class="topic-blurb">${esc(t.blurb)}</span><span class="topic-count">${count} papers</span></a></li>`;
        })
        .join('')}</ul>
    </div>
  </section>

  <section class="band band-alt">
    <div class="band-inner">
      <h2>Follow the argument</h2>
      <p class="section-lede">The series moves in a planned order, from “why we need a union” to “how each part of the new government works.”</p>
      <ol class="part-list">${taxonomy.parts
        .map(
          (pt) => `<li><a href="/parts/${pt.slug}/"><span class="part-range">No. ${pt.range[0] === pt.range[1] ? pt.range[0] : pt.range[0] + '–' + pt.range[1]}</span><span class="part-name">${esc(pt.name)}</span><span class="part-blurb">${esc(pt.blurb)}</span></a></li>`
        )
        .join('')}</ol>
    </div>
  </section>

  <section class="band">
    <div class="band-inner prose">
      <h2>What are the Federalist Papers?</h2>
      <p>In the summer of 1787, delegates met in Philadelphia and wrote a new Constitution to replace the Articles of Confederation, the country's first, weak national government. Before it could take effect, nine of the thirteen states had to ratify (approve) it. The fight was especially close in New York.</p>
      <p>To win over New York voters, Alexander Hamilton, James Madison, and John Jay wrote 85 essays for New York newspapers under the shared pen name “Publius,” after a hero of the ancient Roman Republic. They explained what was wrong with the old government, how the new one would work, and why it would protect liberty instead of threatening it.</p>
      <p>The essays didn't settle the debate on their own, but they became the most famous explanation of the Constitution ever written. Judges, including Supreme Court justices, still cite them to understand what the Constitution means. <a href="/about/">Read more about the project →</a></p>
    </div>
  </section>`;
  return layout({ title: '', body, pagePath: '/', bodyClass: 'page-home' });
}

function renderStart() {
  const card = (e, i) => paperCard(byN[e.n], esc(e.why));
  const body = `
  <div class="page">
    <header class="page-head">
      <p class="kicker">Reading path</p>
      <h1>Start here</h1>
      <p class="lede">You don't have to read all 85 essays in order. Most people start with a handful of famous ones. Here is a suggested path.</p>
    </header>
    <section>
      <h2>Step 1: The essential seven</h2>
      <p>These are the papers most often quoted by judges, taught in classes, and argued about today. Together, they take about two hours in the plain versions.</p>
      <ol class="card-grid numbered">${readingPath.essentials.map(card).join('')}</ol>
    </section>
    <section>
      <h2>Step 2: Go deeper</h2>
      <p>These fill in the big picture: what was broken, how power is divided, and how each branch works.</p>
      <ol class="card-grid numbered">${readingPath.next.map(card).join('')}</ol>
    </section>
    <section class="prose">
      <h2>Step 3: Follow a topic</h2>
      <p>Pick a question you care about and follow it across the series: <a href="/topics/checks-and-balances/">checks and balances</a>, <a href="/topics/executive-power/">presidential power</a>, <a href="/topics/rights-and-liberty/">rights and liberty</a>, <a href="/topics/federalism/">states versus national government</a>, or <a href="/topics/">any other topic</a>.</p>
      <h2>Tips for reading</h2>
      <ul>
        <li><strong>Remember the goal.</strong> These essays are persuasive writing. Publius is trying to win a vote, so he puts his side's case in the best light. Read like a juror, not a fan.</li>
        <li><strong>Remember the audience.</strong> Each essay answers critics of the Constitution, called Anti-Federalists. Asking “what objection is he answering?” makes most essays easier to follow.</li>
        <li><strong>Use the side-by-side view.</strong> When a sentence matters, check it against the original. Our version is an interpretation, and you should feel free to disagree with it.</li>
        <li><strong>Watch for famous lines.</strong> Boxes marked “In the original words” quote the lines people still cite today.</li>
      </ul>
    </section>
  </div>`;
  return layout({ title: 'Start Here', description: 'A suggested reading path through the Federalist Papers, starting with the seven essential essays.', body, pagePath: '/start/' });
}

function renderContents() {
  const authorsOpts = ['hamilton', 'madison', 'jay', 'madison-hamilton']
    .map((a) => `<option value="${a}">${esc(taxonomy.authors[a].name)}</option>`)
    .join('');
  const body = `
  <div class="page">
    <header class="page-head">
      <p class="kicker">All 85 papers</p>
      <h1>Table of contents</h1>
      <p class="lede">The papers are grouped the way Publius organized his argument. <span class="star">★</span> marks essential reading. <span class="badge badge-ready">Plain version</span> means the full grade 8–10 version is ready. <span class="badge badge-summary">Summary</span> means a summary and the original text are available.</p>
    </header>
    <div class="toc-filters" role="search">
      <label class="sr-only" for="toc-filter">Filter papers</label>
      <input id="toc-filter" type="search" placeholder="Filter by title or topic…" autocomplete="off">
      <label class="sr-only" for="toc-author">Author</label>
      <select id="toc-author"><option value="">All authors</option>${authorsOpts}</select>
      <label class="check"><input type="checkbox" id="toc-ready"> Plain version ready</label>
      <label class="check"><input type="checkbox" id="toc-essential"> Essential only</label>
      <p class="toc-count" aria-live="polite"></p>
    </div>
    <div class="toc">
    ${taxonomy.parts
      .map((pt) => {
        const ps = papers.filter((p) => p.part === pt);
        return `<section class="toc-part" id="${pt.slug}">
          <h2><a href="/parts/${pt.slug}/">${esc(pt.name)}</a> <span class="toc-range">No. ${pt.range[0] === pt.range[1] ? pt.range[0] : pt.range[0] + '–' + pt.range[1]}</span></h2>
          <p class="toc-blurb">${esc(pt.blurb)}</p>
          <ol class="toc-list">${ps.map(paperRow).join('')}</ol>
        </section>`;
      })
      .join('')}
    </div>
  </div>`;
  return layout({ title: 'Table of Contents', description: 'All 85 Federalist Papers, grouped by topic, with plain-language titles.', body, pagePath: '/contents/' });
}

function renderListPage({ kicker, title, lede, list, pagePath, extra = '' }) {
  const body = `
  <div class="page">
    <header class="page-head">
      <p class="kicker">${kicker}</p>
      <h1>${esc(title)}</h1>
      <p class="lede">${lede}</p>
    </header>
    ${extra}
    <ul class="card-grid">${list.map((p) => paperCard(p)).join('')}</ul>
  </div>`;
  return layout({ title, description: plain(lede).slice(0, 200), body, pagePath });
}

function renderTopicsIndex() {
  const body = `
  <div class="page">
    <header class="page-head">
      <p class="kicker">Categories</p>
      <h1>Topics and parts</h1>
      <p class="lede">Browse the papers by the big questions they deal with, or by the part of the series they belong to.</p>
    </header>
    <h2>Topics</h2>
    <ul class="topic-grid">${taxonomy.themes
      .map((t) => `<li><a href="/topics/${t.slug}/"><span class="topic-name">${esc(t.name)}</span><span class="topic-blurb">${esc(t.blurb)}</span><span class="topic-count">${papers.filter((p) => p.themes.includes(t.slug)).length} papers</span></a></li>`)
      .join('')}</ul>
    <h2>Parts of the series</h2>
    <ol class="part-list">${taxonomy.parts
      .map((pt) => `<li><a href="/parts/${pt.slug}/"><span class="part-range">No. ${pt.range[0] === pt.range[1] ? pt.range[0] : pt.range[0] + '–' + pt.range[1]}</span><span class="part-name">${esc(pt.name)}</span><span class="part-blurb">${esc(pt.blurb)}</span></a></li>`)
      .join('')}</ol>
    <h2>Authors</h2>
    <ul class="topic-grid">${['hamilton', 'madison', 'jay']
      .map((a) => `<li><a href="/authors/${a}/"><span class="topic-name">${esc(taxonomy.authors[a].name)}</span><span class="topic-blurb">${esc(truncate(taxonomy.authors[a].bio, 150))}</span></a></li>`)
      .join('')}</ul>
  </div>`;
  return layout({ title: 'Topics', body, pagePath: '/topics/' });
}

function collectGlossary() {
  const map = new Map();
  for (const p of papers) {
    if (!p.adapted) continue;
    const boxes = [...p.adapted.front, ...p.adapted.sections.flatMap((s) => s.blocks), ...p.adapted.back].filter((b) => b.type === 'box' && b.kind === 'vocab');
    for (const b of boxes)
      for (const t of b.terms) {
        // Merge simple variants: case, plurals, "the", and a trailing "(...)" qualifier.
        const key = t.term
          .toLowerCase()
          .replace(/\s*\(.*?\)\s*/g, ' ')
          .replace(/^the /, '')
          .trim()
          .replace(/ies$/, 'y')
          .replace(/s$/, '');
        if (!map.has(key)) map.set(key, { term: t.term, def: t.def, papers: [] });
        const e = map.get(key);
        // Prefer the singular, unqualified spelling as the headword.
        if (t.term.length < e.term.length && !/\(/.test(t.term)) {
          e.term = t.term;
          e.def = t.def;
        }
        if (!e.papers.some((x) => x.n === p.n)) e.papers.push({ n: p.n, term: t.term });
      }
  }
  return [...map.values()].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
}

function renderGlossary(terms) {
  const letters = [...new Set(terms.map((t) => t.term[0].toUpperCase()))];
  const body = `
  <div class="page">
    <header class="page-head">
      <p class="kicker">${terms.length} terms</p>
      <h1>Glossary</h1>
      <p class="lede">Words and ideas from the Federalist Papers, explained in plain language. Terms are collected from the “Words to know” boxes in each paper, so the list grows as more papers are adapted.</p>
    </header>
    <div class="toc-filters"><label class="sr-only" for="gloss-filter">Filter terms</label><input id="gloss-filter" type="search" placeholder="Filter terms…" autocomplete="off"></div>
    <nav class="letters" aria-label="Jump to letter">${letters.map((l) => `<a href="#letter-${l}">${l}</a>`).join('')}</nav>
    <div class="glossary">
    ${letters
      .map(
        (l) => `<section id="letter-${l}"><h2>${l}</h2><dl>${terms
          .filter((t) => t.term[0].toUpperCase() === l)
          .map(
            (t) => `<div class="gloss-item" id="${slugify(t.term)}" data-text="${esc((t.term + ' ' + plain(t.def)).toLowerCase())}"><dt>${esc(t.term)}</dt><dd>${inline(t.def)}<span class="gloss-papers">See: ${t.papers
              .sort((a, b) => a.n - b.n)
              .map((x) => `<a href="${paperUrl(x.n)}#term-${slugify(x.term)}">No. ${x.n}</a>`)
              .join(', ')}</span></dd></div>`
          )
          .join('')}</dl></section>`
      )
      .join('')}
    </div>
  </div>`;
  return layout({ title: 'Glossary', description: 'Key words and ideas from the Federalist Papers, explained in plain language.', body, pagePath: '/glossary/' });
}

function renderSearch() {
  const body = `
  <div class="page">
    <header class="page-head">
      <p class="kicker">Search</p>
      <h1>Search the papers</h1>
    </header>
    <form class="search-form" action="/search/" method="get" role="search" onsubmit="return false">
      <label class="sr-only" for="q">Search</label>
      <input id="q" name="q" type="search" placeholder="Search titles, summaries, plain text, and commentary…" autocomplete="off" autofocus>
      <div class="search-options">
        <label class="check"><input type="checkbox" id="search-original"> Also search the original 1787 text</label>
        <span class="search-tip">Tip: put words in “quotes” to find an exact phrase. Type a number to jump to that paper.</span>
      </div>
    </form>
    <div id="search-status" class="search-status" aria-live="polite"></div>
    <ol id="search-results" class="search-results"></ol>
    <noscript><p>Search needs JavaScript. You can still browse the <a href="/contents/">table of contents</a>.</p></noscript>
    <section class="search-suggest" id="search-suggest">
      <h2>Popular searches</h2>
      <p class="suggest-links">${['faction', 'checks and balances', 'if men were angels', 'impeachment', 'standing army', 'bill of rights', 'judicial review', 'electoral college', 'taxes', 'tyranny', 'militia', 'Articles of Confederation']
        .map((s) => `<a href="/search/?q=${encodeURIComponent(s)}">${esc(s)}</a>`)
        .join(' ')}</p>
    </section>
  </div>`;
  return layout({ title: 'Search', body, pagePath: '/search/', bodyClass: 'page-search' });
}

function renderPage(file, pagePath) {
  const parsed = parsePaper(fs.readFileSync(file, 'utf8'));
  const body = `
  <div class="page prose">
    <header class="page-head">
      ${parsed.meta.kicker ? `<p class="kicker">${esc(parsed.meta.kicker)}</p>` : ''}
      <h1>${esc(parsed.meta.title)}</h1>
      ${parsed.meta.lede ? `<p class="lede">${inline(parsed.meta.lede)}</p>` : ''}
    </header>
    ${renderBlocks(parsed.front)}
    ${parsed.sections.map((s) => `<section id="${s.id}"><h2>${inline(s.title)}</h2>${renderBlocks(s.blocks)}</section>`).join('')}
    ${renderBlocks(parsed.back)}
  </div>`;
  return layout({ title: parsed.meta.title, description: parsed.meta.description, body, pagePath });
}

function renderOffline() {
  const titles = Object.fromEntries(papers.map((p) => [p.n, p.title]));
  const body = `<div class="page">
    <header class="page-head">
      <p class="kicker">No connection</p>
      <h1>You're offline</h1>
      <p class="lede">This page isn't saved on your device yet. Papers you have already opened stay available without a connection.</p>
    </header>
    <p><button type="button" class="btn" onclick="location.reload()">Try again</button></p>
    <section id="saved" hidden>
      <h2>Saved on this device</h2>
      <ul class="saved-list" id="saved-list"></ul>
    </section>
    <script>
    (function () {
      var titles = ${JSON.stringify(titles)};
      if (!('caches' in window)) return;
      caches.keys().then(function (keys) {
        var found = {};
        return Promise.all(keys.map(function (k) {
          return caches.open(k).then(function (c) {
            return c.keys().then(function (reqs) {
              reqs.forEach(function (r) {
                var m = new URL(r.url).pathname.match(/^\\/papers\\/(\\d+)\\/$/);
                if (m) found[m[1]] = true;
              });
            });
          });
        })).then(function () {
          var nums = Object.keys(found).map(Number).sort(function (a, b) { return a - b; });
          if (!nums.length) return;
          var list = document.getElementById('saved-list');
          nums.forEach(function (n) {
            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = '/papers/' + n + '/';
            a.textContent = 'No. ' + n + ': ' + titles[n];
            li.appendChild(a);
            list.appendChild(li);
          });
          document.getElementById('saved').hidden = false;
        });
      }).catch(function () {});
    })();
    </script>
  </div>`;
  return layout({ title: 'Offline', body, pagePath: '/offline/' }).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">');
}

function render404() {
  const body = `<div class="page"><header class="page-head"><p class="kicker">404</p><h1>Page not found</h1><p class="lede">That page doesn't exist. Try the <a href="/contents/">table of contents</a> or <a href="/search/">search</a>.</p></header></div>`;
  return layout({ title: 'Not found', body, pagePath: '/404' });
}

// ---------------------------------------------------------------- search index
function buildSearchIndex() {
  const index = papers.map((p) => {
    const entry = {
      n: p.n,
      t: p.title,
      ot: p.original.title,
      a: p.authorInfo.short,
      pt: p.part.name,
      th: p.themes.map((t) => themeBySlug[t].name),
      s: p.summary,
      r: p.adapted ? 1 : 0,
      sec: [],
    };
    if (p.adapted) {
      const front = p.adapted.front.map(blockText).join(' ');
      if (front.trim()) entry.sec.push({ id: '', h: 'Overview', x: front });
      for (const s of p.adapted.sections) entry.sec.push({ id: s.id, h: plain(s.title), x: s.blocks.map(blockText).join(' ') });
      const back = p.adapted.back.map(blockText).join(' ');
      if (back.trim()) entry.sec.push({ id: 'wrap-up', h: 'Wrap-up', x: back });
    }
    return entry;
  });
  const original = papers.map((p) => ({ n: p.n, p: p.original.paragraphs }));
  return { index, original };
}

// ---------------------------------------------------------------- write
function write(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else fs.copyFileSync(s, d);
  }
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(path.join(ROOT, 'site'), DIST);

  const urls = ['/'];
  write('index.html', renderHome());
  for (const p of papers) {
    write(`papers/${p.n}/index.html`, renderPaper(p));
    urls.push(paperUrl(p.n));
  }
  write('start/index.html', renderStart());
  write('contents/index.html', renderContents());
  write('topics/index.html', renderTopicsIndex());
  write('search/index.html', renderSearch());
  write('404.html', render404());
  write('offline/index.html', renderOffline());

  // Service worker: stamp it with this build's id and the list of files to save at install.
  const precache = [
    '/', '/start/', '/contents/', '/search/', '/glossary/', '/topics/', '/about/', '/offline/',
    `/styles.css?v=${BUILD_ID}`, `/app.js?v=${BUILD_ID}`,
    '/favicon.svg', '/manifest.webmanifest', '/apple-touch-icon.png', '/icons/icon-192.png',
  ];
  write(
    'sw.js',
    fs.readFileSync(path.join(ROOT, 'site', 'sw.js'), 'utf8').replace(/__BUILD_ID__/g, BUILD_ID).replace(/__PRECACHE__/g, JSON.stringify(precache, null, 2))
  );
  urls.push('/start/', '/contents/', '/topics/', '/search/', '/glossary/');

  for (const t of taxonomy.themes) {
    const list = papers.filter((p) => p.themes.includes(t.slug)).sort((a, b) => (a.rank || 999) - (b.rank || 999) || a.n - b.n);
    write(
      `topics/${t.slug}/index.html`,
      renderListPage({ kicker: 'Topic', title: t.name, lede: `${esc(t.blurb)} Most important papers are listed first.`, list, pagePath: `/topics/${t.slug}/` })
    );
    urls.push(`/topics/${t.slug}/`);
  }
  for (const pt of taxonomy.parts) {
    const list = papers.filter((p) => p.part === pt);
    const idx = taxonomy.parts.indexOf(pt);
    const prev = taxonomy.parts[idx - 1];
    const next = taxonomy.parts[idx + 1];
    const extra = `<nav class="pager part-pager">${prev ? `<a class="pager-prev" href="/parts/${prev.slug}/"><span>← Previous part</span>${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a class="pager-next" href="/parts/${next.slug}/"><span>Next part →</span>${esc(next.name)}</a>` : '<span></span>'}</nav>`;
    write(
      `parts/${pt.slug}/index.html`,
      renderListPage({
        kicker: `Part ${idx + 1} of ${taxonomy.parts.length} · No. ${pt.range[0] === pt.range[1] ? pt.range[0] : pt.range[0] + '–' + pt.range[1]}`,
        title: pt.name,
        lede: esc(pt.blurb),
        list,
        pagePath: `/parts/${pt.slug}/`,
        extra,
      })
    );
    urls.push(`/parts/${pt.slug}/`);
  }
  for (const a of ['hamilton', 'madison', 'jay']) {
    const info = taxonomy.authors[a];
    const list = papers.filter((p) => p.author === a || (a === 'madison' && p.author === 'madison-hamilton') || (a === 'hamilton' && p.author === 'madison-hamilton'));
    write(
      `authors/${a}/index.html`,
      renderListPage({ kicker: `Author · ${list.length} papers`, title: info.name, lede: esc(info.bio), list, pagePath: `/authors/${a}/` })
    );
    urls.push(`/authors/${a}/`);
  }

  const terms = collectGlossary();
  write('glossary/index.html', renderGlossary(terms));

  const pagesDir = path.join(CONTENT, 'pages');
  if (fs.existsSync(pagesDir))
    for (const f of fs.readdirSync(pagesDir).filter((f) => f.endsWith('.md'))) {
      const slug = f.replace(/\.md$/, '');
      write(`${slug}/index.html`, renderPage(path.join(pagesDir, f), `/${slug}/`));
      urls.push(`/${slug}/`);
    }

  const { index, original } = buildSearchIndex();
  write('search-index.json', JSON.stringify(index));
  write('search-original.json', JSON.stringify(original));

  write('robots.txt', `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : ''}`);
  if (SITE_URL)
    write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}\n</urlset>\n`);

  // Check internal links in every generated page.
  const known = new Set(urls.map((u) => u.split('#')[0]));
  const broken = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.endsWith('.html'))
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/href="(\/[^"#?]*)/g)) {
          const href = m[1];
          if (/\.(css|js|svg|json|xml|txt|png|webmanifest)$/.test(href) || known.has(href)) continue;
          broken.set(href, path.relative(DIST, f));
        }
    }
  };
  walk(DIST);
  for (const [href, from] of broken) console.warn(`Warning: broken link ${href} (e.g. in ${from})`);

  console.log(`Built ${urls.length} pages into dist/ — ${adaptedCount}/85 papers adapted, ${terms.length} glossary terms.`);
}

main();
