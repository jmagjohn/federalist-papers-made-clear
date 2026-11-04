#!/usr/bin/env node
// Print an original paper with paragraph numbers: node scripts/show.js 51
const n = process.argv[2];
const d = require('../content/originals/' + String(n).padStart(2, '0') + '.json');
console.log(`No. ${d.number}: ${d.title} (${d.paragraphs.length} paragraphs)\n`);
d.paragraphs.forEach((p, i) => console.log(`¶${i + 1} ${p}\n`));
if (d.footnotes.length) console.log('FOOTNOTES: ' + d.footnotes.join(' | '));
