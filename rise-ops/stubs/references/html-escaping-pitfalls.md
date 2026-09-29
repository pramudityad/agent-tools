# RISE HTML-escaping pitfalls

Two fields silently mangle markdown/HTML on write. Both are field-tested, not theoretical.

## Tugas `description`

Verified on Tugas Sesi 5 WAD:

- `<https://…>` angle-bracket autolinks are **silently deleted** — the row keeps "Referensi
  kode:" and drops the URL, no error.
- `>` blockquote markers are stored as a literal `&gt;` (7 of them in one task), so the
  blockquote renders as junk text instead of a quote.
- Bare `https://…` on its own line **does** survive.

Prefer plain-text labels and bare URLs in a tugas `description`; keep `[text](url)` for
discussion posts (`description_html`, where `<a href>` works).

## `discussion post`

Escapes HTML too — for formatted announcements, use the API directly. Verified 2026-09-26
(SDLC UTS announcement): `descriptionHtml()` escapes `<`/`>`, so a payload of ready-made HTML
is stored as literal text (`&lt;h3&gt;…`) and renders as source, not formatting.

Fix that worked: `DELETE` the mangled post (`/v1/class-discussion/posts/{id}`), then `POST`
the same payload straight to the API with `description_html` = clean HTML and the session
cookie, and write the audit entry by hand. Verify with two GETs ~20s apart asserting
`not desc.includes('&lt;')`.
