# Changelog

## 1.0.1 (2026-06-22)

### Fixes

- **Icon background transparency** — Marketplace details page was
  rendering the logo with broken corners because the generated
  `icon-256.png` was an RGBA PNG with transparent pixels outside the
  rounded-rect background. Switched the icon source SVG to a square
  background and re-rendered both `icon-256.png` and `icon-128.png`
  as fully opaque RGB over the galleryBanner colour.

## 1.0.0 (2026-06-22)

### Initial release

This is the first stable release of **MyBatis SQL Formatter** as a standalone
VSCode extension (previously developed as `sqf` and bundled with internal
tooling).

### Highlights

- Recognises the standard MyBatis JDBC log markers (`==>  Preparing:`,
  `==>  Parameters:`, `<==  Columns:`, `<==  Row:`, `<==  Total:`) and
  inserts the formatted SQL with parameters inlined as literals directly
  below each detected block.
- Three commands: **Format Document** / **Format Selection** /
  **Preview Document**.
- Five user-configurable settings: `autoFormat` / `indentSize` /
  `keywordCase` / `paramMode` (`inline` or `placeholder`) / `stringQuote`.
- Built-in keybindings: `Shift+Alt+F`, `Cmd+K Cmd+M`, `Shift+Alt+P`.
- 68 unit tests across parser, formatter, inserter, webview renderer, and
  format pipeline.
- Preview webview with Content-Security-Policy header and full XSS escaping
  for SQL preview.
- Robust error handling: `WorkspaceEdit` failures surface as a notification
  (not silent), parse warnings are exposed to the output channel, repeated
  warning modals are deduplicated.
- Plugin icon and three-panel workflow demo (before / action / after)
  embedded in the README.
- MIT licensed.
