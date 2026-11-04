# How to adapt a Federalist paper

This guide is for anyone (human or AI) writing a plain-language version of a paper. Read it fully before starting. Look at `content/papers/10.md`, `51.md`, and `15.md` as models of the finished product.

## Workflow

1. Print the original with paragraph numbers:
   `node scripts/show.js 33`
2. Read the whole original carefully. Check the paper's entry in `content/catalog.json` (title, summary, themes) so your version matches it.
3. Write `content/papers/NN.md` (two-digit number, e.g. `06.md`, `33.md`).
4. Build and check:
   `node scripts/build.js && node scripts/check.js | grep NN`
   The build will fail if an `{orig=...}` paragraph number doesn't exist, and `check.js` flags any original paragraph that is missing or covered twice.
5. If the text grade is above 10.5 or below 7.5, run `node scripts/hard.js NN 12` to see the hardest sentences and simplify them. Re-check until the **text** grade is between 8.0 and 10.5. Aim for about 9–10.

## File format

```markdown
---
n: 33
---

:::summary
4–6 sentences on the whole paper.
:::

:::keypoints
- 5–9 bullet points: the main claims.
:::

:::context Background
1–2 short paragraphs: the historical situation, who Publius is answering, where this paper fits in the series.
:::

## A plain section heading {orig=1-3}

The plain-language text of original paragraphs 1–3...

:::commentary
Our explanation...
:::

## Next section {orig=4-6}
...

:::today
Why it still matters (one paragraph).
:::

:::questions
- 3–4 discussion questions.
:::
```

Box types: `summary`, `keypoints`, `context`, `commentary`, `vocab`, `quote`, `connection`, `note`, `today`, `questions`.

- `vocab` lines are `Term: Definition.` One term per line. Only define words a 9th grader might not know, or words whose 1787 meaning differs from today's (e.g. "federal," "democracy," "energy"). Terms feed the site-wide glossary, so reuse the same spelling as other papers for the same term.
- `quote` boxes hold a famous line **in the original wording**, followed by a paragraph starting `Meaning:` that explains it. Use them for 2–5 of the paper's best-known or most important lines. Quote exactly from the original.
- `connection` boxes link related papers: `[No. 51](/papers/51/)`.
- Inline: `**bold**`, `*italic*`, `[link](/papers/10/)`. Use `--` sparingly.

## Sections and `{orig=...}`

- Split the paper into 4–11 sections that follow the original's argument. Each heading should be a plain, descriptive phrase ("Why the states would still be strong"), not "Section 2."
- Every original paragraph must be covered by exactly one section, in order. `{orig=1-3}`, `{orig=4}`, `{orig=5-9}`... The ranges together should cover 1 through the last paragraph.
- Footnotes from the original can be mentioned in a `note` box if they matter.

## The main text: rules

- **Follow the original step by step.** Same order, same arguments, same examples, same qualifications. Do not skip a hard argument or a list of examples. You may compress truly repetitive passages, but don't drop ideas.
- **Keep Publius's voice.** First person ("I," "we," "you"), addressing the people of New York. The main text says what *he* said, not what we think. Never insert modern opinions or facts into the main text.
- **Grade 8–10, not lower.** Break long sentences into two or three. Replace 1700s words with modern ones ("countenance" → "support"). Explain references inline briefly when needed ("the Achaean League, an alliance of ancient Greek cities"). Keep key terms like *faction*, *republic*, *confederacy*, *sovereignty* and define them in `vocab`. Don't cut reasoning to hit a lower grade.
- Short lists in the original (e.g. a list of powers or examples) can become bullet lists.
- Long direct quotations Publius makes of other authors may stay word for word in a `>` blockquote; they're excluded from the grade count.
- Accuracy matters more than style. If unsure what a sentence means, reread the original paragraph and the surrounding ones.

## Commentary: rules

- Clearly ours, in boxes. 1–3 short paragraphs each. About one commentary box per section on average; not every section needs one.
- Explain background, references, and why the argument mattered. Point out where Publius was persuading rather than proving, where his predictions came true or failed, and where the argument was controversial then or now.
- Be **historically accurate**. Only state facts you are confident of. Prefer well-known facts (amendments, major court cases, famous events) over obscure details. Don't invent quotes. If you're not sure of a date or number, leave it out.
- Be **fair and nonpartisan**. When a modern debate comes up, present the main sides without picking one. Use phrases like "Supporters say... Critics say..."
- Be **honest about the blind spots**: slavery, the exclusion of women and the poor from voting, treatment of Native nations. State these plainly and without lecturing.
- Commentary should also read at about grade 8–10.

## What not to do

- Don't change any file other than your own `content/papers/NN.md`.
- Don't commit to git (the maintainer commits).
- Don't add HTML.
- Don't summarize instead of adapting. The main text should usually be 70–100% of the original's length in words.
