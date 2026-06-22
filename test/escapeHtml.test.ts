import * as assert from "assert";
import { escapeHtml } from "../src/escapeHtml";

suite("escapeHtml", () => {
  test("escapes < and > (HTML element boundary)", () => {
    assert.strictEqual(escapeHtml("<script>"), "&lt;script&gt;");
  });

  test('escapes " (double-quoted attribute boundary)', () => {
    assert.strictEqual(escapeHtml('a"b'), "a&quot;b");
  });

  test("escapes ' (single-quoted attribute and JS string boundary)", () => {
    assert.strictEqual(escapeHtml("a'b"), "a&#39;b");
  });

  test("escapes & (entity boundary)", () => {
    assert.strictEqual(escapeHtml("a&b"), "a&amp;b");
  });

  test("& escape runs first (no double-escaping of &amp;)", () => {
    // Regression: if & was escaped after amp/lt/..., an input that
    // already contains an entity would have its leading & rewritten.
    assert.strictEqual(escapeHtml("&amp;"), "&amp;amp;");
    assert.strictEqual(escapeHtml("&lt;"), "&amp;lt;");
  });

  test("escapes all five characters in a mixed payload", () => {
    const input = `<a href="x" onclick='y'>&</a>`;
    const expected =
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;";
    assert.strictEqual(escapeHtml(input), expected);
  });

  test("preserves SQL text unchanged (no over-escaping)", () => {
    const sql = "SELECT a, b FROM t WHERE x = 1 AND y = 'foo'";
    // Single quotes inside SQL still get escaped (that is the fix);
    // all other characters pass through verbatim.
    const out = escapeHtml(sql);
    assert.ok(out.includes("SELECT a, b FROM t WHERE x = 1 AND y = "));
    assert.ok(out.includes("&#39;foo&#39;"));
  });

  test("empty string stays empty", () => {
    assert.strictEqual(escapeHtml(""), "");
  });

  test("string with no special characters is unchanged", () => {
    assert.strictEqual(
      escapeHtml("plain ascii 123 !?()"),
      "plain ascii 123 !?()",
    );
  });
});
