#!/usr/bin/env node
/**
 * One-time import of the original Federalist Papers text.
 *
 * Source: Project Gutenberg EBook #1404 (public domain), as mirrored by
 * GITenberg: https://github.com/GITenberg/The-Federalist-Papers_1404
 *
 * Usage: node scripts/import-originals.js path/to/1404.txt
 *
 * Writes content/originals/NN.json with numbered paragraphs so the
 * plain-language versions can point back to the exact original passages.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/import-originals.js path/to/1404.txt');
  process.exit(1);
}

let text = fs.readFileSync(src, 'utf8').replace(/\r\n?/g, '\n');
const start = text.indexOf('FEDERALIST No. 1\n');
const end = text.indexOf('End of the Project Gutenberg');
text = text.slice(start, end > 0 ? end : undefined);

const chunks = text.split(/^FEDERALIST No\. (\d+)\s*$/m);
const outDir = path.join(__dirname, '..', 'content', 'originals');
fs.mkdirSync(outDir, { recursive: true });

const unwrap = (block) => block.split('\n').map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim();

let count = 0;
for (let i = 1; i < chunks.length; i += 2) {
  const number = Number(chunks[i]);
  const blocks = chunks[i + 1]
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  let title = unwrap(blocks.shift());
  let published = '';
  // A few headers in the source run the title and newspaper line together.
  const joined = title.match(/^(.*?)\s+((?:For|From) [Tt]he (?:New York Packet|Independent Journal|Daily Advertiser).*)$/);
  if (joined) {
    title = joined[1];
    published = joined[2];
  }
  if (!published && /^(Considered )?(For|From)\b/i.test(blocks[0])) {
    published = unwrap(blocks.shift());
    if (/^Considered /.test(published)) {
      title = title.replace(/\.$/, '') + ' Considered';
      published = published.replace(/^Considered /, '');
    }
  }
  published = published.replace(/\.$/, '');
  let byline = '';
  if (/^[A-Z][A-Za-z ,]+$/.test(blocks[0]) && blocks[0] === blocks[0].replace(/[a-z]+/g, (w) => (w === 'with' ? w : w.toUpperCase()))) byline = unwrap(blocks.shift());
  let salutation = '';
  if (/^To the People/i.test(blocks[0])) salutation = unwrap(blocks.shift());

  const paragraphs = [];
  const footnotes = [];
  let signed = false;
  for (const b of blocks) {
    const p = unwrap(b);
    if (/^PUBLIUS\.?$/.test(p)) {
      signed = true;
      continue;
    }
    if (/^\*\*\*/.test(p) || /^THE END/.test(p)) break;
    if (signed) {
      footnotes.push(p);
    } else {
      paragraphs.push(p);
    }
  }

  if (number === 26) published = published.replace('1788', '1787'); // typo in the source text
  const data = { number, title, published, byline, salutation, paragraphs, footnotes };
  fs.writeFileSync(path.join(outDir, String(number).padStart(2, '0') + '.json'), JSON.stringify(data, null, 2) + '\n');
  count++;
}
console.log(`Imported ${count} papers into ${outDir}`);
