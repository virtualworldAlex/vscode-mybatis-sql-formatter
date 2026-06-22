import * as assert from "assert";
import { formatSegment } from "../src/formatter";
import { FormatOptions, SqlSegment } from "../src/types";

const opts: FormatOptions = {
  indentSize: 2,
  keywordCase: "upper",
  paramMode: "placeholder",
  stringQuote: "single",
};

function makeSeg(
  sql: string,
  params: { value: string; type: string }[],
): SqlSegment {
  return {
    startLine: 0,
    endLine: 0,
    sqlText: sql,
    params: params.map((p, i) => ({
      index: i + 1,
      value: p.value,
      type: p.type,
    })),
  };
}

suite("formatSegment (placeholder mode — extended coverage)", () => {
  test("no params → no param comment block", () => {
    const seg = makeSeg("SELECT 1", []);
    const out = formatSegment(seg, opts).text;
    assert.ok(!out.includes("param["), "no params means no comment block");
    assert.ok(out.includes("-- === Formatted SQL ==="));
    assert.ok(out.includes("-- === End ==="));
  });

  test("multiple params → one comment per param, in index order", () => {
    const seg = makeSeg("SELECT ?, ?, ?", [
      { value: "alpha", type: "String" },
      { value: "2", type: "Integer" },
      { value: "true", type: "Boolean" },
    ]);
    const out = formatSegment(seg, opts).text;
    assert.ok(out.includes("param[1] = 'alpha' (String)"));
    assert.ok(out.includes("param[2] = 2 (Integer)"));
    assert.ok(out.includes("param[3] = TRUE (Boolean)"));
    const i1 = out.indexOf("param[1]");
    const i2 = out.indexOf("param[2]");
    const i3 = out.indexOf("param[3]");
    assert.ok(i1 >= 0 && i2 > i1 && i3 > i2);
  });

  test("param with empty type is labelled (unknown)", () => {
    const seg = makeSeg("SELECT ?", [{ value: "x", type: "" }]);
    const out = formatSegment(seg, opts).text;
    assert.ok(out.includes("(unknown)"));
  });

  test("special characters in param value are SQL-escaped", () => {
    const seg = makeSeg("SELECT ?", [{ value: "foo'bar", type: "String" }]);
    const out = formatSegment(seg, opts).text;
    assert.ok(
      out.includes("'foo''bar'"),
      `expected SQL-standard quote-doubling, got: ${out}`,
    );
  });

  test("param block sits between HEADER and body, body keeps ? placeholders", () => {
    const seg = makeSeg("SELECT ?", [{ value: "1", type: "Integer" }]);
    const out = formatSegment(seg, opts).text;
    const headerIdx = out.indexOf("-- === Formatted SQL ===");
    const paramIdx = out.indexOf("param[1]");
    // sql-formatter may split the body across lines (e.g. "SELECT\n  ?;"),
    // so look for the keyword and the placeholder separately.
    const selectIdx = out.indexOf("SELECT");
    const placeholderIdx = out.indexOf("?");
    assert.ok(headerIdx >= 0, "header present");
    assert.ok(paramIdx > headerIdx, "params appear after header");
    assert.ok(selectIdx > paramIdx, "SELECT keyword appears after params");
    assert.ok(
      placeholderIdx > paramIdx,
      "? placeholder preserved after params",
    );
  });
});
