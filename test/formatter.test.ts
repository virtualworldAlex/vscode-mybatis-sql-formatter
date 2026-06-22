import * as assert from "assert";
import { formatSegment, formatSegments } from "../src/formatter";
import { FormatOptions, SqlSegment } from "../src/types";

const baseOptions: FormatOptions = {
  indentSize: 4,
  keywordCase: "upper",
  paramMode: "inline",
  stringQuote: "single",
};

function makeSegment(
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

suite("formatSegment (inline mode)", () => {
  test("replaces String param with single-quoted literal", () => {
    const seg = makeSegment("SELECT * FROM t WHERE a = ?", [
      { value: "foo", type: "String" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("'foo'"), `expected 'foo' in: ${out.text}`);
    assert.ok(!out.text.includes("?"), `? should be replaced in: ${out.text}`);
  });

  test("replaces Integer param with bare number", () => {
    const seg = makeSegment("SELECT * FROM t WHERE id = ?", [
      { value: "42", type: "Integer" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("42"), `expected 42 in: ${out.text}`);
    assert.ok(!out.text.includes("'42'"), `should not be quoted: ${out.text}`);
  });

  test("replaces Long/Double param with bare number", () => {
    const seg = makeSegment("SELECT ?", [{ value: "12345", type: "Long" }]);
    assert.ok(formatSegment(seg, baseOptions).text.includes("12345"));
  });

  test("replaces Boolean param with TRUE/FALSE uppercase", () => {
    const seg = makeSegment("SELECT ?", [{ value: "true", type: "Boolean" }]);
    assert.ok(formatSegment(seg, baseOptions).text.includes("TRUE"));
  });

  test("replaces null param with NULL keyword", () => {
    const seg = makeSegment("SELECT ?", [{ value: "null", type: "null" }]);
    assert.ok(formatSegment(seg, baseOptions).text.includes("NULL"));
  });

  test("replaces Date/Timestamp with single-quoted literal", () => {
    const seg = makeSegment("SELECT ?", [
      { value: "2026-05-19 13:28:31", type: "Timestamp" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("'2026-05-19 13:28:31'"), `got: ${out.text}`);
  });

  test("respects stringQuote: double", () => {
    const seg = makeSegment("SELECT ?", [{ value: "foo", type: "String" }]);
    const opts: FormatOptions = { ...baseOptions, stringQuote: "double" };
    const out = formatSegment(seg, opts);
    assert.ok(out.text.includes('"foo"'), `got: ${out.text}`);
  });

  test("heuristic: pure digits become number when type is empty", () => {
    const seg = makeSegment("SELECT ?", [{ value: "7", type: "" }]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(/\b7\b/.test(out.text), `got: ${out.text}`);
  });

  test("heuristic: true/false become boolean when type is empty", () => {
    const seg = makeSegment("SELECT ?", [{ value: "false", type: "" }]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("FALSE"), `got: ${out.text}`);
  });

  test("output contains SQL with SELECT keyword uppercased", () => {
    const seg = makeSegment("select id from t where a = ?", [
      { value: "1", type: "String" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("SELECT"), `got: ${out.text}`);
  });

  test("output starts with -- === Formatted SQL === marker and ends with -- === End ===", () => {
    const seg = makeSegment("SELECT 1", []);
    const out = formatSegment(seg, baseOptions);
    assert.ok(
      out.text.startsWith("-- === Formatted SQL ==="),
      `got: ${out.text}`,
    );
    assert.ok(
      out.text.trimEnd().endsWith("-- === End ==="),
      `got: ${out.text}`,
    );
  });
});

suite("formatSegment (placeholder mode)", () => {
  test("keeps ? in SQL and adds comment block of params", () => {
    const seg = makeSegment("SELECT ? AND ?", [
      { value: "a", type: "String" },
      { value: "1", type: "Integer" },
    ]);
    const opts: FormatOptions = { ...baseOptions, paramMode: "placeholder" };
    const out = formatSegment(seg, opts);
    assert.ok(out.text.includes("?"), `expected ? kept: ${out.text}`);
    assert.ok(
      out.text.includes("-- param[1] = 'a' (String)"),
      `got: ${out.text}`,
    );
    assert.ok(
      out.text.includes("-- param[2] = 1 (Integer)"),
      `got: ${out.text}`,
    );
  });
});

suite("formatSegments", () => {
  test("returns one FormattedSegment per input segment", () => {
    const segs = [
      makeSegment("SELECT 1", []),
      makeSegment("SELECT ?", [{ value: "x", type: "String" }]),
    ];
    const out = formatSegments(segs, baseOptions);
    assert.strictEqual(out.length, 2);
  });
});

suite("formatSegment (branch coverage)", () => {
  test("renders BigDecimal / Double / Float / Short / Number as bare numeric", () => {
    // Each non-Integer numeric type shares the bare-number branch.
    const types = ["BigDecimal", "Double", "Float", "Short", "Number"];
    for (const t of types) {
      const seg = makeSegment("SELECT ?", [{ value: "3.14", type: t }]);
      const out = formatSegment(seg, baseOptions).text;
      assert.ok(/\b3\.14\b/.test(out), `${t}: expected bare 3.14, got ${out}`);
      assert.ok(!out.includes("'3.14'"), `${t}: should not be quoted`);
    }
  });

  test("renders Date / Time types as quoted strings", () => {
    const dateSeg = makeSegment("SELECT ?", [
      { value: "2026-05-19", type: "Date" },
    ]);
    const timeSeg = makeSegment("SELECT ?", [
      { value: "13:28:31", type: "Time" },
    ]);
    assert.ok(
      formatSegment(dateSeg, baseOptions).text.includes("'2026-05-19'"),
    );
    assert.ok(formatSegment(timeSeg, baseOptions).text.includes("'13:28:31'"));
  });

  test("falls back to quoted string for unknown type", () => {
    const seg = makeSegment("SELECT ?", [
      { value: "abc", type: "UUID" }, // not in any known branch
    ]);
    const out = formatSegment(seg, baseOptions).text;
    assert.ok(out.includes("'abc'"), `expected 'abc', got ${out}`);
  });

  test("escapes single quotes inside String param (single-quote mode)", () => {
    const seg = makeSegment("SELECT ?", [{ value: "foo'bar", type: "String" }]);
    const out = formatSegment(seg, baseOptions).text;
    // SQL standard: double the quote -> 'foo''bar'
    assert.ok(out.includes("'foo''bar'"), `expected 'foo''bar', got ${out}`);
  });

  test("escapes double quotes inside String param (double-quote mode)", () => {
    const seg = makeSegment("SELECT ?", [{ value: 'foo"bar', type: "String" }]);
    const opts: FormatOptions = { ...baseOptions, stringQuote: "double" };
    const out = formatSegment(seg, opts).text;
    assert.ok(out.includes('"foo""bar"'), `expected "foo""bar", got ${out}`);
  });

  test("heuristic: empty type + null value renders as NULL", () => {
    const seg = makeSegment("SELECT ?", [{ value: "null", type: "" }]);
    const out = formatSegment(seg, baseOptions).text;
    assert.ok(out.includes("NULL"), `expected NULL, got ${out}`);
  });

  test("heuristic: empty type + plain string renders as quoted string", () => {
    const seg = makeSegment("SELECT ?", [{ value: "hello", type: "" }]);
    const out = formatSegment(seg, baseOptions).text;
    assert.ok(out.includes("'hello'"), `expected 'hello', got ${out}`);
  });

  test("appends trailing semicolon when SQL body lacks one", () => {
    const seg = makeSegment("SELECT 1", []);
    const out = formatSegment(seg, baseOptions).text;
    // Body (between HEADER and FOOTER) should end with ';' before FOOTER.
    assert.ok(
      /\;[\s\n]*-- === End ===/.test(out),
      `expected ; before FOOTER, got ${out}`,
    );
  });

  test("does not double the trailing semicolon when SQL already ends with one", () => {
    const seg = makeSegment("SELECT 1;", []);
    const out = formatSegment(seg, baseOptions).text;
    // Should have exactly one ';' before FOOTER, not ';;'.
    assert.ok(
      !/;;[\s\n]*-- === End ===/.test(out),
      `unexpected ';;' in ${out}`,
    );
  });
});
