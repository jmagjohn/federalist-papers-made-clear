/* The Federalist, Made Clear — client script (no dependencies) */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    }
  };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  };

  document.addEventListener('DOMContentLoaded', function () {
    initHeader();
    initSettings();
    initPaper();
    initContents();
    initGlossary();
    initSearch();
  });

  // ------------------------------------------------------------ header
  function initHeader() {
    var header = $('.site-header');
    var menuBtn = $('.menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', function () {
      var open = header.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // close the categories dropdown when clicking elsewhere
    document.addEventListener('click', function (e) {
      $$('details.browse[open]').forEach(function (d) { if (!d.contains(e.target)) d.removeAttribute('open'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') $$('details.browse[open]').forEach(function (d) { d.removeAttribute('open'); });
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        var q = $('#q') || $('#header-q');
        if (q) { e.preventDefault(); q.focus(); q.select(); }
      }
    });
  }

  // ------------------------------------------------------------ settings
  function initSettings() {
    var btn = $('.settings-btn');
    var panel = $('#settings');
    if (!btn || !panel) return;
    var settings = store.get('fmc-settings', {});
    var root = document.documentElement;
    function apply() {
      ['theme', 'size', 'font'].forEach(function (k) {
        if (settings[k]) root.setAttribute('data-' + k, settings[k]); else root.removeAttribute('data-' + k);
      });
      $$('button[data-set]', panel).forEach(function (b) {
        var k = b.getAttribute('data-set');
        var cur = settings[k] || (k === 'size' ? 'm' : k === 'font' ? 'serif' : '');
        b.setAttribute('aria-pressed', b.getAttribute('data-value') === cur ? 'true' : 'false');
      });
    }
    btn.addEventListener('click', function () {
      var open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-set]');
      if (!b) return;
      settings[b.getAttribute('data-set')] = b.getAttribute('data-value');
      store.set('fmc-settings', settings);
      apply();
    });
    apply();
  }

  // ------------------------------------------------------------ paper page
  function initPaper() {
    var paper = $('.paper');
    if (!paper) return;
    var wrap = $('.paper-wrap');
    var buttons = $$('.view-switch button[data-view]');
    function setView(v, save) {
      paper.setAttribute('data-view', v);
      wrap.classList.toggle('compare', v === 'compare');
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === v ? 'true' : 'false'); });
      $$('.psec-orig').forEach(function (d) {
        if (v === 'compare') { d.setAttribute('data-was-open', d.open ? '1' : ''); d.open = true; }
        else if (d.hasAttribute('data-was-open')) { d.open = !!d.getAttribute('data-was-open'); d.removeAttribute('data-was-open'); }
      });
      if (save) store.set('fmc-view', v);
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });
    if (buttons.length) {
      var saved = store.get('fmc-view', 'plain');
      if (location.hash && /^#(full-)?o\d+$/.test(location.hash)) saved = 'original';
      if (saved !== 'plain') setView(saved, false);
    }
    // links to the original text switch the view
    $$('a[href="#original"]').forEach(function (a) {
      a.addEventListener('click', function () { setView('original', true); });
    });

    // active section highlighting in "On this page"
    var links = $$('.sidebar .on-page a');
    if (links.length && 'IntersectionObserver' in window) {
      var map = {};
      links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            links.forEach(function (a) { a.classList.remove('active'); });
            var a = map[en.target.id];
            if (a) a.classList.add('active');
          }
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) obs.observe(el); });
    }

    initListen(paper, setView);
  }

  function initListen(paper, setView) {
    var btn = $('.listen-btn');
    if (!btn) return;
    if (!('speechSynthesis' in window)) { btn.style.display = 'none'; return; }
    var speaking = false;
    var queue = [];
    var idx = 0;
    function stop() {
      speaking = false;
      window.speechSynthesis.cancel();
      $$('.listening').forEach(function (el) { el.classList.remove('listening'); });
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = '<span aria-hidden="true">🔊</span> Listen';
    }
    function next() {
      $$('.listening').forEach(function (el) { el.classList.remove('listening'); });
      if (!speaking || idx >= queue.length) { stop(); return; }
      var el = queue[idx++];
      el.classList.add('listening');
      var r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var u = new SpeechSynthesisUtterance(el.innerText);
      u.rate = 0.95;
      u.onend = next;
      u.onerror = next;
      window.speechSynthesis.speak(u);
    }
    btn.addEventListener('click', function () {
      if (speaking) { stop(); return; }
      if (paper.getAttribute('data-view') === 'original') setView('plain', true);
      queue = $$('.plain-view h2, .psec-plain > p, .psec-plain > ul > li, .psec-plain > ol > li, .psec-plain > h3, .box-summary p');
      // start from the first visible block
      idx = 0;
      for (var i = 0; i < queue.length; i++) { if (queue[i].getBoundingClientRect().bottom > 100) { idx = i; break; } }
      speaking = true;
      btn.setAttribute('aria-pressed', 'true');
      btn.innerHTML = '<span aria-hidden="true">⏹</span> Stop';
      next();
    });
    window.addEventListener('beforeunload', stop);
  }

  // ------------------------------------------------------------ contents filters
  function initContents() {
    var filter = $('#toc-filter');
    if (!filter) return;
    var author = $('#toc-author');
    var ready = $('#toc-ready');
    var essential = $('#toc-essential');
    var count = $('.toc-count');
    var rows = $$('.toc-row');
    var params = new URLSearchParams(location.search);
    if (params.get('ready')) ready.checked = true;
    if (params.get('essential')) essential.checked = true;
    if (params.get('author')) author.value = params.get('author');
    if (params.get('q')) filter.value = params.get('q');
    function run() {
      var q = filter.value.trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (r) {
        var ok = (!q || r.getAttribute('data-text').indexOf(q) >= 0 || r.getAttribute('data-n') === q.replace(/^no\.?\s*/, '')) &&
          (!author.value || r.getAttribute('data-author') === author.value || (r.getAttribute('data-author') === 'madison-hamilton' && (author.value === 'madison' || author.value === 'hamilton'))) &&
          (!ready.checked || r.getAttribute('data-ready') === '1') &&
          (!essential.checked || r.getAttribute('data-essential') === '1');
        r.hidden = !ok;
        if (ok) shown++;
      });
      $$('.toc-part').forEach(function (s) {
        s.classList.toggle('empty', !$$('.toc-row', s).some(function (r) { return !r.hidden; }));
      });
      count.textContent = shown === rows.length ? rows.length + ' papers' : shown + ' of ' + rows.length + ' papers';
    }
    [filter, author, ready, essential].forEach(function (el) { el.addEventListener('input', run); el.addEventListener('change', run); });
    run();
  }

  // ------------------------------------------------------------ glossary filter
  function initGlossary() {
    var f = $('#gloss-filter');
    if (!f) return;
    f.addEventListener('input', function () {
      var q = f.value.trim().toLowerCase();
      $$('.gloss-item').forEach(function (it) { it.hidden = q && it.getAttribute('data-text').indexOf(q) < 0; });
      $$('.glossary section').forEach(function (s) { s.hidden = !$$('.gloss-item', s).some(function (i) { return !i.hidden; }); });
    });
  }

  // ------------------------------------------------------------ search
  function initSearch() {
    var input = $('#q');
    if (!input || !$('#search-results')) return;
    var status = $('#search-status');
    var results = $('#search-results');
    var suggest = $('#search-suggest');
    var origBox = $('#search-original');
    var index = null;
    var original = null;
    var timer = null;

    var params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    if (params.get('orig')) origBox.checked = true;

    function load(url) {
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }
    function ensure() {
      var jobs = [];
      if (!index) jobs.push(load('/search-index.json').then(function (d) { index = d; }));
      if (origBox.checked && !original) jobs.push(load('/search-original.json').then(function (d) { original = d; }));
      return Promise.all(jobs);
    }

    function parseQuery(q) {
      var phrases = [];
      q = q.replace(/[“”"]([^“”"]+)[“”"]/g, function (m, p) { phrases.push(p.toLowerCase().trim()); return ' '; });
      var stop = { the: 1, a: 1, an: 1, of: 1, and: 1, to: 1, in: 1, is: 1, it: 1, that: 1, on: 1, for: 1, by: 1, be: 1, are: 1 };
      var words = q.toLowerCase().split(/[^a-z0-9']+/).filter(function (w) { return w && !stop[w]; });
      return { phrases: phrases, words: words };
    }
    function stem(w) { return w.length > 4 ? w.replace(/(ies|es|s|ing|ed)$/, '') : w; }
    function matches(text, q) {
      var t = text.toLowerCase();
      for (var i = 0; i < q.phrases.length; i++) if (t.indexOf(q.phrases[i]) < 0) return false;
      for (var j = 0; j < q.words.length; j++) if (t.indexOf(stem(q.words[j])) < 0) return false;
      return true;
    }
    function countHits(text, q) {
      var t = text.toLowerCase(), n = 0;
      q.phrases.concat(q.words.map(stem)).forEach(function (w) {
        var i = -1; while ((i = t.indexOf(w, i + 1)) >= 0) n++;
      });
      return n;
    }
    function snippet(text, q) {
      var t = text.toLowerCase();
      var terms = q.phrases.concat(q.words.map(stem));
      var pos = -1;
      for (var i = 0; i < terms.length && pos < 0; i++) pos = t.indexOf(terms[i]);
      var start = Math.max(0, pos - 90);
      var end = Math.min(text.length, start + 260);
      var s = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
      s = esc(s);
      terms.sort(function (a, b) { return b.length - a.length; }).forEach(function (term) {
        if (!term) return;
        var re = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z]*)', 'gi');
        s = s.replace(re, '<mark>$1</mark>');
      });
      return s;
    }

    function run() {
      var raw = input.value.trim();
      var url = raw ? '?q=' + encodeURIComponent(raw) + (origBox.checked ? '&orig=1' : '') : location.pathname;
      history.replaceState(null, '', url);
      if (!raw) { results.innerHTML = ''; status.textContent = ''; suggest.hidden = false; return; }
      suggest.hidden = true;
      status.textContent = 'Searching…';
      ensure().then(function () { render(raw); }).catch(function () {
        status.textContent = 'Search could not load. Please check your connection and try again.';
      });
    }

    function render(raw) {
      var q = parseQuery(raw);
      var numMatch = raw.match(/^(?:no\.?|federalist|#)?\s*(\d{1,2})$/i);
      var out = [];
      if (!q.words.length && !q.phrases.length && !numMatch) { results.innerHTML = ''; status.textContent = ''; return; }
      index.forEach(function (p) {
        var score = 0, hits = [];
        if (numMatch && Number(numMatch[1]) === p.n) score += 1000;
        if (q.words.length || q.phrases.length) {
          var head = p.t + ' ' + p.ot;
          if (matches(head, q)) score += 60;
          if (matches(p.th.join(' ') + ' ' + p.pt, q)) score += 25;
          if (matches(p.s, q)) { score += 20; hits.push({ label: 'Summary', text: p.s, href: '/papers/' + p.n + '/' }); }
          p.sec.forEach(function (s) {
            if (matches(s.h + ' ' + s.x, q)) {
              score += 8 + Math.min(countHits(s.x, q), 10);
              hits.push({ label: s.h, text: s.x, href: '/papers/' + p.n + '/' + (s.id ? '#' + s.id : '') });
            }
          });
          if (original) {
            var paras = original[p.n - 1].p;
            for (var i = 0; i < paras.length; i++) {
              if (matches(paras[i], q)) {
                score += 3;
                hits.push({ label: 'Original text, ¶' + (i + 1), text: paras[i], href: '/papers/' + p.n + '/#full-o' + (i + 1) });
              }
            }
          }
        }
        if (score > 0) out.push({ p: p, score: score + (p.r ? 2 : 0), hits: hits });
      });
      out.sort(function (a, b) { return b.score - a.score || a.p.n - b.p.n; });
      var total = out.length;
      status.textContent = total ? total + (total === 1 ? ' paper matches' : ' papers match') + ' “' + raw + '”' : 'No matches for “' + raw + '”. Try fewer words' + (origBox.checked ? '.' : ', or include the original text.');
      results.innerHTML = out.slice(0, 40).map(function (r) {
        var p = r.p;
        var hitsHtml = r.hits.slice(0, 3).map(function (h) {
          return '<p class="result-hit"><a href="' + h.href + '"><span class="hit-label">' + esc(h.label) + '</span>' + snippet(h.text, q) + '</a></p>';
        }).join('');
        var more = r.hits.length > 3 ? '<p class="result-meta">+ ' + (r.hits.length - 3) + ' more matching passages</p>' : '';
        return '<li class="result"><div class="result-head"><span class="result-num">No. ' + p.n + '</span><a href="/papers/' + p.n + '/">' + esc(p.t) + '</a>' +
          (p.r ? ' <span class="badge badge-ready">Plain version</span>' : ' <span class="badge badge-summary">Summary</span>') +
          '</div><p class="result-meta">' + esc(p.a) + ' · ' + esc(p.pt) + '</p>' + (hitsHtml || '<p class="result-hit">' + esc(p.s) + '</p>') + more + '</li>';
      }).join('');
    }

    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 160); });
    origBox.addEventListener('change', run);
    if (input.value) run();
  }
})();
