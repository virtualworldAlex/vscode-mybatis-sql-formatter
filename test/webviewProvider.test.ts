import * as assert from "assert";
import { renderHtml } from "../src/previewHtml";
import { FormattedSegment, SqlSegment } from "../src/types";

function makeFmt(
  sql: string,
  startLine: number,
  endLine: number,
): FormattedSegment {
  const seg: SqlSegment = { startLine, endLine, sqlText: sql, params: [] };
  return { segment: seg, text: `-- ${sql}\nSELECT 1;` };
}

suite("renderHtml", () => {
  test("contains a Content-Security-Policy meta tag", () => {
    const html = renderHtml([makeFmt("SELECT 1", 0, 2)]);
    assert.ok(
      html.includes("Content-Security-Policy"),
      "webview must declare a CSP meta tag",
    );
    assert.ok(html.includes("default-src 'none'"), "CSP must lock default-src");
    assert.ok(
      html.includes("script-src 'unsafe-inline'"),
      "CSP must allow inline script",
    );
  });

  test("contains exactly one card per formatted segment", () => {
    const segs = [
      makeFmt("SELECT 1", 0, 2),
      makeFmt("SELECT 2", 5, 7),
      makeFmt("SELECT 3", 10, 12),
    ];
    const html = renderHtml(segs);
    const matches = html.match(/class="card"/g) ?? [];
    assert.strictEqual(matches.length, segs.length);
  });

  test("escapes SQL inside <pre> so a payload cannot inject markup", () => {
    const evil: FormattedSegment = {
      segment: { startLine: 0, endLine: 0, sqlText: "x", params: [] },
      text: "<script>alert(1)</script>",
    };
    const html = renderHtml([evil]);
    assert.ok(!html.includes("<script>alert"), "raw <script> must not survive");
    assert.ok(html.includes("&lt;script&gt;"));
  });

  test("shows segment index and 1-based line range in the card header", () => {
    const seg = makeFmt("SELECT 1", 0, 2);
    const html = renderHtml([seg]);
    assert.ok(html.includes("段 1"));
    assert.ok(html.includes("行 1–3"));
  });

  test("contains both toolbar buttons (insertAll + cancel)", () => {
    const html = renderHtml([makeFmt("SELECT 1", 0, 0)]);
    assert.ok(html.includes("send('insertAll')"));
    assert.ok(html.includes("send('cancel')"));
    assert.ok(html.includes("插入全部到文件"));
    assert.ok(html.includes("取消"));
  });

  test("uses acquireVsCodeApi so messages reach the extension", () => {
    const html = renderHtml([makeFmt("SELECT 1", 0, 0)]);
    assert.ok(html.includes("acquireVsCodeApi()"));
    assert.ok(html.includes("vscode.postMessage"));
  });

  test("escapes both single and double quotes in formatted text", () => {
    const seg: FormattedSegment = {
      segment: { startLine: 0, endLine: 0, sqlText: "x", params: [] },
      text: `SELECT "a", 'b'`,
    };
    const html = renderHtml([seg]);
    assert.ok(html.includes("&quot;a&quot;"));
    assert.ok(html.includes("&#39;b&#39;"));
  });
});
