/**
 * A small Markdown dialect for the plain-language papers.
 *
 *   ---                      front matter (key: value)
 *   ## Heading {orig=1-4}    a section; orig = original paragraph numbers it covers
 *   ### Subheading
 *   :::commentary [Title]    a labeled box (commentary, context, vocab, quote,
 *   ...                       summary, keypoints, today, questions, note)
 *   :::
 *   - list item / 1. list item / > blockquote
 *   **bold**, *italic*, [link](/papers/51/)
 */

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => `<a href="${href.replace(/^\/papers\/0+(\d)/, '/papers/$1')}">${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/ -- /g, ' &mdash; ');
  return s;
}

/** Strip inline markup to get plain text (for search and reading level). */
function plain(text) {
  return String(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/ -- /g, ' - ');
}

const slugify = (s) =>
  plain(s)
    .toLowerCase()
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** Parse a run of lines (no containers or sections) into simple blocks. */
function parseBlocks(lines) {
  const blocks = [];
  let para = [];
  let list = null;
  let quote = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: 'bq', text: quote.join(' ') });
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushAll();
      continue;
    }
    let m;
    if ((m = line.match(/^###\s+(.*)$/))) {
      flushAll();
      blocks.push({ type: 'h3', text: m[1] });
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(m[1]);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ' ' + line.trim();
    } else {
      flushList();
      flushQuote();
      para.push(line.trim());
    }
  }
  flushAll();
  return blocks;
}

function parseOrig(spec) {
  if (!spec) return [];
  const nums = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-').map((x) => parseInt(x, 10));
    if (Number.isNaN(a)) continue;
    for (let i = a; i <= (Number.isNaN(b) || b === undefined ? a : b); i++) nums.push(i);
  }
  return nums;
}

/**
 * Parse a paper file into { meta, front, sections, back }.
 * front/back hold container boxes that appear before the first section
 * or are of the "closing" kinds (today, questions).
 */
function parsePaper(src) {
  const text = src.replace(/\r\n?/g, '\n');
  const meta = {};
  let body = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
    body = text.slice(fm[0].length);
  }

  const front = [];
  const back = [];
  const sections = [];
  let current = null;
  let buffer = [];
  let box = null;

  const flushBuffer = () => {
    if (!buffer.length) return;
    const blocks = parseBlocks(buffer);
    buffer = [];
    if (current) current.blocks.push(...blocks);
    else front.push(...blocks);
  };

  const usedIds = new Set();
  for (const line of body.split('\n')) {
    if (box) {
      if (/^:::\s*$/.test(line)) {
        const kind = box.kind;
        const item = { type: 'box', kind, title: box.title, blocks: kind === 'vocab' ? [] : parseBlocks(box.lines) };
        if (kind === 'vocab') {
          item.terms = box.lines
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => {
              const i = l.indexOf(':');
              return { term: l.slice(0, i).replace(/\*\*/g, '').trim(), def: l.slice(i + 1).trim() };
            });
        }
        if (kind === 'today' || kind === 'questions') back.push(item);
        else if (current) current.blocks.push(item);
        else front.push(item);
        box = null;
      } else {
        box.lines.push(line);
      }
      continue;
    }
    let m;
    if ((m = line.match(/^:::(\w+)\s*(.*)$/))) {
      flushBuffer();
      box = { kind: m[1], title: m[2].trim(), lines: [] };
      continue;
    }
    if ((m = line.match(/^##\s+(.*?)\s*(?:\{(?:orig=([\d,\- ]+)|#([\w-]+))\})?\s*$/)) && !line.startsWith('###')) {
      flushBuffer();
      let id = m[3] || slugify(m[1]) || 'section';
      while (usedIds.has(id)) id += '-2';
      usedIds.add(id);
      current = { id, title: m[1], orig: parseOrig(m[2]), blocks: [] };
      sections.push(current);
      continue;
    }
    buffer.push(line);
  }
  flushBuffer();
  if (box) throw new Error(`Unclosed :::${box.kind} block`);
  return { meta, front, sections, back };
}

module.exports = { parsePaper, parseBlocks, inline, plain, escapeHtml, slugify };
