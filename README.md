# The Federalist, Made Clear

The Federalist Papers rewritten in clear, modern English at a **grade 8–10 reading level**, with commentary, vocabulary, a glossary, full-text search, and the original 1787–88 text side by side.

**Live site: https://federalist-papers-made-clear.vercel.app**

The goal is simple: make the actual arguments behind the U.S. Constitution readable for everyone, without dumbing them down.

## Features

- **Plain-language versions** that follow the original argument section by section
- **Commentary, background, and "why it still matters" boxes**, kept clearly separate from the text
- **Side-by-side view**: every section links to the exact original paragraphs it covers
- **Search** across titles, summaries, plain text, commentary, and (optionally) the original text
- **Table of contents** grouped by the series' own structure, with filters
- **Categories**: 17 parts of the series, 13 topics (checks and balances, federalism, presidential power…), and authors
- **Glossary** built automatically from each paper's "Words to know" box
- **Reading tools**: text size, easy-read font (Atkinson Hyperlegible), parchment/aged/plain/night themes, read-aloud
- A summary and the full original text for **all 85 papers**, even before the plain version is written

## Deploying on Vercel

1. Import this repository in Vercel (**Add New → Project**).
2. Leave the defaults. `vercel.json` already sets the build command (`npm run build`) and output directory (`dist`). There are no dependencies to install.
3. Deploy.

The sitemap uses Vercel's production URL automatically. To set it yourself, add a `SITE_URL` environment variable (for example `https://federalist.example.com`).

## Running locally

Requires Node 18 or newer. No `npm install` needed.

```bash
npm run dev      # build and preview at http://localhost:3000
npm run build    # build into dist/
npm run check    # report reading level and paragraph coverage of every plain-language paper
```

## How the content works

```
content/
  catalog.json        # all 85 papers: plain title, author, topics, summary, importance rank
  taxonomy.json       # authors, the 17 parts of the series, and topics
  reading-path.json   # the "Start here" reading order
  originals/NN.json   # original text, one paragraph per array item (from Project Gutenberg #1404)
  papers/NN.md        # plain-language versions (see docs/ADAPTING.md for the style guide)
  pages/*.md          # other pages (About)
scripts/
  build.js            # static site generator (no dependencies)
  check.js            # reading-level report
  import-originals.js # one-time import of the original text
site/                 # CSS, JS, favicon copied as-is
```

### Writing a plain-language paper

Create `content/papers/NN.md` (for example `content/papers/51.md`). It appears on the site automatically.

```markdown
---
n: 51
---

:::summary
Two or three sentences on the whole paper.
:::

:::keypoints
- The main points, as a list.
:::

:::context Background
Optional historical background.
:::

## A section heading {orig=1-3}

The plain-language text for original paragraphs 1 through 3.

:::commentary
Explanation that is ours, not Publius's.
:::

:::vocab
Term: Definition in plain language.
:::

:::quote
A famous line in the original words.

Meaning: What it means in plain language.
:::

:::today
Why it still matters.
:::

:::questions
- Discussion questions.
:::
```

`{orig=1-3}` links the section to original paragraphs 1–3 (as numbered in `content/originals/NN.json`), which powers the side-by-side view. Boxes can be `summary`, `keypoints`, `context`, `commentary`, `vocab`, `quote`, `connection`, `note`, `today`, and `questions`. Inline formatting supports `**bold**`, `*italic*`, and `[links](/papers/10/)`.

### Style rules

- Aim for grade 8–10 (`npm run check`). Don't go lower: shorter sentences are fine, but don't cut the reasoning.
- Follow the original order and keep Publius's voice ("I", "we"). Don't skip hard arguments.
- Keep interpretation in boxes. The main text should say what Publius said, not what we think.
- Be honest about where the authors were wrong, controversial, or blind (for example, on slavery).

## Sources and license

Original text: *The Federalist Papers*, Project Gutenberg EBook #1404 (public domain), via the [GITenberg mirror](https://github.com/GITenberg/The-Federalist-Papers_1404).

Code: MIT License. Plain-language adaptations and commentary: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
