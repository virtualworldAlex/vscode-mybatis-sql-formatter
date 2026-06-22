/**
 * Escape characters that have special meaning in HTML so a string can
 * be safely embedded inside element text or double-quoted attribute
 * values. Escapes the five characters that can break out of an HTML
 * text or attribute context:
 *
 * - `&` → `&amp;`  (must run first to avoid double-escaping)
 * - `<` → `&lt;`
 * - `>` → `&gt;`
 * - `"` → `&quot;`
 * - `'` → `&#39;`  (covers single-quoted attributes and JS string
 *                   contexts in inline event handlers)
 *
 * Intentionally does NOT escape characters that have no HTML-meaning
 * (e.g. spaces, slashes, parentheses) so SQL formatting is preserved
 * verbatim in `<pre>` blocks.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
