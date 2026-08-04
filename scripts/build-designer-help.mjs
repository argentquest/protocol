import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { marked, Renderer } from 'marked'

const projectRoot = resolve(import.meta.dirname, '..')
const sourcePath = resolve(
  projectRoot,
  'public',
  'docs',
  'theme-workshop-json-reference.md',
)
const outputPath = resolve(
  projectRoot,
  'public',
  'docs',
  'theme-workshop-json-reference.html',
)

/**
 * Converts heading text into a stable URL fragment.
 *
 * @pure
 * @param {string} value Markdown heading text.
 * @param {Map<string, number>} counts Prior slug counts.
 * @returns {string} Unique lowercase fragment identifier.
 */
function slugify(value, counts) {
  const base = value
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'section'
  const count = counts.get(base) ?? 0
  counts.set(base, count + 1)
  return count ? `${base}-${count + 1}` : base
}

/**
 * Escapes text for safe insertion into an HTML text node.
 *
 * @pure
 * @param {string} value Trusted documentation text requiring HTML escaping.
 * @returns {string} HTML-safe text.
 */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Builds the complete standalone designer reference page from Markdown.
 *
 * @param {string} markdown Source Markdown.
 * @returns {string} Deterministic semantic HTML document.
 */
function renderDesignerHelp(markdown) {
  const tokens = marked.lexer(markdown, { gfm: true })
  const counts = new Map()
  const headings = tokens
    .filter((token) => token.type === 'heading')
    .map((token) => ({
      depth: token.depth,
      text: token.text.replace(/<[^>]+>/g, ''),
      slug: slugify(token.text, counts),
    }))
  let headingIndex = 0
  const renderer = new Renderer()
  renderer.heading = function heading({ tokens: inlineTokens, depth }) {
    const headingEntry = headings[headingIndex]
    headingIndex += 1
    return `<h${depth} id="${headingEntry.slug}">${this.parser.parseInline(inlineTokens)}<a class="heading-link" href="#${headingEntry.slug}" aria-label="Link to this section">#</a></h${depth}>\n`
  }
  const content = marked.parse(markdown, { gfm: true, renderer })
  const title = headings[0]?.text ?? 'Theme Workshop Designer Reference'
  const navigation = headings
    .filter((heading) => heading.depth === 2 || heading.depth === 3)
    .map(
      (heading) =>
        `<a class="toc-depth-${heading.depth}" href="#${heading.slug}">${escapeHtml(heading.text)}</a>`,
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #040a13; color: #dff6ff; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: radial-gradient(circle at 80% 0%, rgba(32, 151, 190, .18), transparent 34rem), #040a13; }
    a { color: #72e9ff; }
    a:hover { color: #fff; }
    .help-shell { display: grid; min-height: 100vh; grid-template-columns: 290px minmax(0, 1fr); }
    .help-sidebar { position: sticky; top: 0; height: 100vh; overflow: auto; border-right: 1px solid rgba(114, 233, 255, .18); padding: 1.5rem 1.25rem; background: rgba(4, 10, 19, .92); }
    .help-sidebar strong { display: block; margin-bottom: .35rem; color: #fff; letter-spacing: .08em; text-transform: uppercase; }
    .help-sidebar p { margin: 0 0 1rem; color: #82a7b9; font-size: .82rem; }
    .help-sidebar nav { display: grid; gap: .15rem; }
    .help-sidebar nav a { border-left: 2px solid transparent; padding: .42rem .55rem; color: #9fc4d3; font-size: .84rem; text-decoration: none; }
    .help-sidebar nav a:hover, .help-sidebar nav a.is-active { border-left-color: #72e9ff; color: #fff; background: rgba(114, 233, 255, .08); }
    .help-sidebar .toc-depth-3 { padding-left: 1.25rem; font-size: .78rem; }
    main { width: min(100%, 1080px); padding: 3rem clamp(1.25rem, 5vw, 5rem) 6rem; }
    h1 { margin: 0 0 1.5rem; color: #fff; font-size: clamp(2.2rem, 5vw, 4.2rem); line-height: 1; letter-spacing: -.04em; }
    h2 { margin-top: 3.5rem; padding-bottom: .55rem; border-bottom: 1px solid rgba(114, 233, 255, .22); color: #fff; font-size: 1.8rem; }
    h3 { margin-top: 2.25rem; color: #a9f2ff; font-size: 1.25rem; }
    h4 { margin-top: 1.75rem; color: #dff6ff; }
    h1, h2, h3, h4 { scroll-margin-top: 1rem; }
    .heading-link { margin-left: .45rem; opacity: 0; color: #5a899a; font-size: .75em; text-decoration: none; }
    h1:hover .heading-link, h2:hover .heading-link, h3:hover .heading-link, h4:hover .heading-link, .heading-link:focus { opacity: 1; }
    p, li { color: #bad0d9; line-height: 1.7; }
    strong { color: #f4fcff; }
    code { border: 1px solid rgba(114, 233, 255, .12); border-radius: .3rem; padding: .12rem .3rem; color: #9ff1ff; background: rgba(0, 0, 0, .28); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .9em; }
    pre { overflow: auto; border: 1px solid rgba(114, 233, 255, .18); border-radius: .65rem; padding: 1rem 1.15rem; background: #02070d; box-shadow: inset 3px 0 #2ac8e5; }
    pre code { border: 0; padding: 0; color: #d8f7ff; background: transparent; line-height: 1.55; }
    table { width: 100%; margin: 1.25rem 0 2rem; border-collapse: collapse; border: 1px solid rgba(114, 233, 255, .2); font-size: .88rem; }
    th, td { padding: .7rem .8rem; border: 1px solid rgba(114, 233, 255, .14); text-align: left; vertical-align: top; }
    th { color: #fff; background: rgba(114, 233, 255, .1); }
    tr:nth-child(even) td { background: rgba(255, 255, 255, .018); }
    blockquote { margin: 1.5rem 0; border-left: 3px solid #72e9ff; padding: .25rem 1rem; background: rgba(114, 233, 255, .06); }
    hr { margin: 3rem 0; border: 0; border-top: 1px solid rgba(114, 233, 255, .18); }
    .back-to-top { position: fixed; right: 1.25rem; bottom: 1.25rem; border: 1px solid rgba(114, 233, 255, .35); border-radius: 999px; padding: .65rem .9rem; color: #dff6ff; background: #071522; text-decoration: none; }
    @media (max-width: 860px) { .help-shell { grid-template-columns: 1fr; } .help-sidebar { position: relative; height: auto; max-height: 320px; border-right: 0; border-bottom: 1px solid rgba(114, 233, 255, .18); } main { padding-top: 2rem; } }
    @media print { :root { color-scheme: light; background: #fff; color: #111; } body { background: #fff; } .help-shell { display: block; } .help-sidebar, .back-to-top, .heading-link { display: none; } main { width: 100%; padding: 0; } p, li, code { color: #222; } h1, h2, h3, h4, strong { color: #000; } pre, code { border-color: #bbb; background: #f5f5f5; } }
  </style>
</head>
<body>
  <div class="help-shell">
    <aside class="help-sidebar" aria-label="Designer reference navigation">
      <strong>Designer Reference</strong>
      <p>Path Protocol Theme Workshop</p>
      <nav>${navigation}</nav>
    </aside>
    <main id="top">${content}</main>
  </div>
  <a class="back-to-top" href="#top">Back to top</a>
  <script>
    const links = [...document.querySelectorAll('.help-sidebar nav a')]
    const byId = new Map(links.map((link) => [link.hash.slice(1), link]))
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        links.forEach((link) => link.classList.remove('is-active'))
        byId.get(entry.target.id)?.classList.add('is-active')
      }
    }, { rootMargin: '0px 0px -72% 0px' })
    document.querySelectorAll('main h2, main h3').forEach((heading) => observer.observe(heading))
  </script>
</body>
</html>
`
}

const markdown = await readFile(sourcePath, 'utf8')
const output = renderDesignerHelp(markdown)

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '')
  if (current !== output) {
    throw new Error(
      'Designer help HTML is stale. Run "npm run docs:build" and commit the result.',
    )
  }
  console.log('Designer help HTML matches its Markdown source.')
} else {
  await writeFile(outputPath, output, 'utf8')
  console.log('Generated formatted Theme Workshop designer help HTML.')
}
