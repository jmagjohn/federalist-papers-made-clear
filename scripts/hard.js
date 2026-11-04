#!/usr/bin/env node
// List the hardest sentences in a paper's main text: node scripts/hard.js 45 [count]
const fs = require('fs');
const path = require('path');
const { parsePaper, plain } = require('./lib/markdown');
const { syllables, stripQuotes, joinBlocks } = require('./lib/readability');
const n = String(process.argv[2]).padStart(2, '0');
const count = Number(process.argv[3] || 12);
const p = parsePaper(fs.readFileSync(path.join(__dirname, '..', 'content', 'papers', n + '.md'), 'utf8'));
const text = joinBlocks(p.sections.flatMap((s) => s.blocks.filter((b) => ['p', 'ul', 'ol'].includes(b.type))).map((b) => plain(b.text || b.items.join('. '))));
const sents = stripQuotes(text).split(/(?<=[.!?])\s+(?=[A-Z"])/);
const scored = sents.map((s) => {
  const w = s.match(/[A-Za-z][A-Za-z'\-]*/g) || [];
  const syl = w.reduce((a, x) => a + syllables(x), 0);
  return { s, words: w.length, score: 0.39 * w.length + 11.8 * (syl / Math.max(1, w.length)) };
});
scored.sort((a, b) => b.score - a.score).slice(0, count).forEach((x) => console.log(`[${x.words}w] ${x.s}\n`));
