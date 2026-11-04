/**
 * Flesch-Kincaid grade level, used to keep the plain-language versions in
 * the grade 8-10 range. Syllable counting is a heuristic, so treat results
 * as approximate (about +/- 1 grade).
 */

function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '');
  w = w.replace(/^y/, '');
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

function stats(text) {
  const clean = text
    .replace(/\b(No|Nos|Mr|Mrs|Dr|St|vs|etc|i\.e|e\.g)\./gi, '$1')
    .replace(/(\d)\.(\d)/g, '$1$2');
  const sentences = clean.split(/[.!?]+(?=\s|$|["'”)])/).filter((s) => /[a-z]/i.test(s));
  const words = clean.match(/[A-Za-z][A-Za-z'\-]*/g) || [];
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  return { sentences: Math.max(1, sentences.length), words: words.length, syllables: syl };
}

function gradeLevel(text) {
  const s = stats(text);
  if (!s.words) return null;
  const grade = 0.39 * (s.words / s.sentences) + 11.8 * (s.syllables / s.words) - 15.59;
  return Math.round(grade * 10) / 10;
}

module.exports = { gradeLevel, stats, syllables };
