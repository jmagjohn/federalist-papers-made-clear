#!/usr/bin/env node
// Reports the estimated reading level of every plain-language paper.
// Target: grade 8-10. Run: npm run check
const fs = require('fs');
const path = require('path');
const { parsePaper, plain } = require('./lib/markdown');
const { gradeLevel, joinBlocks } = require('./lib/readability');
const dir = path.join(__dirname, '..', 'content', 'papers');
let bad = 0;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
for (const f of files) {
  const p = parsePaper(fs.readFileSync(path.join(dir, f), 'utf8'));
  const blocks = p.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'p' || b.type === 'ul' || b.type === 'ol'));
  const text = joinBlocks(blocks.map((b) => plain(b.text || b.items.join('. '))));
  const all = [...p.front, ...p.sections.flatMap((s) => s.blocks), ...p.back]
    .filter((b) => b.type === 'box' && b.kind !== 'quote' && b.kind !== 'vocab')
    .flatMap((b) => b.blocks)
    .map((b) => plain(b.text || (b.items || []).join('. ')))
    .join(' ');
  const n = Number(p.meta.n || f.replace(/\.md$/, ''));
  const total = require(path.join(__dirname, '..', 'content', 'originals', String(n).padStart(2, '0') + '.json')).paragraphs.length;
  const seen = p.sections.flatMap((s) => s.orig);
  const missing = [];
  for (let i = 1; i <= total; i++) if (!seen.includes(i)) missing.push(i);
  const dupes = seen.filter((x, i) => seen.indexOf(x) !== i);
  const coverage = missing.length || dupes.length ? `  <-- paragraphs missing [${missing}] duplicated [${dupes}]` : '';
  if (coverage) bad++;
  const g = gradeLevel(text);
  const gc = gradeLevel(all);
  const flag = g < 7.5 || g > 10.5 ? '  <-- outside target' : '';
  if (flag) bad++;
  console.log(`${f}  text: grade ${g}  commentary: grade ${gc}  sections: ${p.sections.length}${flag}${coverage}`);
}
console.log(`\n${files.length} papers checked, ${bad} with problems (reading level outside grade 8-10, or original paragraphs not covered).`);
