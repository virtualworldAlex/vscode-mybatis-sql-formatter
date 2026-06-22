import * as assert from "assert";
import { parseSqlLog } from "../src/parser";

suite("parseSqlLog", () => {
  test("returns empty array for empty text", () => {
    assert.deepStrictEqual(parseSqlLog(""), []);
  });

  test("parses a single block with String and Integer params", () => {
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE a = ? AND b = ?",
      "==> Parameters: foo(String), 3(String)",
      "<==    Columns: a, b",
      "<==        Row: 1, 2",
      "<==      Total: 1",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(
      segs[0].sqlText,
      "SELECT * FROM t WHERE a = ? AND b = ?",
    );
    assert.strictEqual(segs[0].params.length, 2);
    assert.deepStrictEqual(segs[0].params[0], {
      index: 1,
      value: "foo",
      type: "String",
    });
    assert.deepStrictEqual(segs[0].params[1], {
      index: 2,
      value: "3",
      type: "String",
    });
    assert.deepStrictEqual(segs[0].result?.columns, ["a", "b"]);
    assert.deepStrictEqual(segs[0].result?.rows, [["1", "2"]]);
    assert.strictEqual(segs[0].result?.total, 1);
  });

  test("parses a block with trace line carrying SQL in brackets", () => {
    const text = [
      "==>  Preparing: SELECT id FROM users WHERE id = ?",
      "[10.0.9.137][app][traceId:abc][ INFO][2026-05-19 13:28:31] --[msg:... SQL [SELECT id FROM users WHERE id = ?]] --[...]-- SQLExecutionTraceInterceptor",
      "==> Parameters: 42(Integer)",
      "<==      Total: 0",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0].sqlText, "SELECT id FROM users WHERE id = ?");
    assert.strictEqual(segs[0].params[0].value, "42");
    assert.strictEqual(segs[0].params[0].type, "Integer");
  });

  test("parses multiple blocks in one text", () => {
    const text = [
      "==>  Preparing: SELECT 1 FROM dual WHERE a = ?",
      "==> Parameters: 1(String)",
      "<==      Total: 1",
      "",
      "==>  Preparing: SELECT 2 FROM dual WHERE b = ?",
      "==> Parameters: two(String)",
      "<==      Total: 1",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 2);
    assert.strictEqual(segs[0].sqlText, "SELECT 1 FROM dual WHERE a = ?");
    assert.strictEqual(segs[1].sqlText, "SELECT 2 FROM dual WHERE b = ?");
    assert.strictEqual(segs[0].startLine, 0);
    assert.strictEqual(segs[0].endLine, 2);
    assert.strictEqual(segs[1].startLine, 4);
    assert.strictEqual(segs[1].endLine, 6);
  });

  test("handles null parameter", () => {
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE x = ?",
      "==> Parameters: null",
      "<==      Total: 0",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.deepStrictEqual(segs[0].params[0], {
      index: 1,
      value: "null",
      type: "null",
    });
  });

  test("returns empty when no Preparing: found", () => {
    const text = "==>  Parameters: foo(String)\n<==      Total: 0";
    assert.deepStrictEqual(parseSqlLog(text), []);
  });

  test("handles missing result section", () => {
    const text = ["==>  Preparing: UPDATE t SET x = 1", "==> Parameters:"].join(
      "\n",
    );
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0].result, undefined);
  });

  test("skips many blank lines between blocks (large-input shape)", () => {
    // Real MyBatis logs frequently have many empty lines between blocks
    // when they come from different requests. Parser must remain correct.
    const blocks = [
      "==>  Preparing: SELECT 1 FROM dual WHERE a = ?",
      "==> Parameters: 1(String)",
      "<==      Total: 1",
    ];
    const text = [
      blocks.join("\n"),
      "",
      "",
      "",
      "",
      "",
      blocks.join("\n"),
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 2);
    assert.strictEqual(segs[0].sqlText, "SELECT 1 FROM dual WHERE a = ?");
    assert.strictEqual(segs[1].sqlText, "SELECT 1 FROM dual WHERE a = ?");
  });

  test("handles 1000 sequential blocks in O(n) not O(n^2)", () => {
    // Soft performance regression test: parse 1000 blocks. The old
    // implementation showed O(n^2) growth (~12ms at 1000); after
    // optimization we expect this to stay well under 5ms.
    const block = [
      "==>  Preparing: SELECT id FROM users WHERE status = ?",
      "==> Parameters: 1(Integer)",
      "<==      Total: 0",
    ].join("\n");
    const text = Array(1000).fill(block).join("\n");
    // Use Date.now() (no @types/node dependency) - 1ms precision is
    // enough for a soft threshold. Min of 5 trials to reduce noise.
    let minMs = Infinity;
    let segsLen = 0;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const segs = parseSqlLog(text);
      const ms = Date.now() - t0;
      if (ms < minMs) minMs = ms;
      segsLen = segs.length;
    }
    assert.strictEqual(segsLen, 1000);
    // Soft target: under 5ms for 1000 blocks. Will tighten later.
    assert.ok(minMs < 5, `parse 1000 blocks took ${minMs}ms (expected <5ms)`);
  });

  test("handles parameters with parens inside values (no premature split)", () => {
    // e.g. literal function calls in value: foo(bar)
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE x = ?",
      "==> Parameters: foo(bar)(String)",
      "<==      Total: 0",
    ].join("\n");
    const segs = parseSqlLog(text);
    // Current behavior: only first ( ... ) is taken as type hint.
    // This test pins the existing behavior so optimization doesn't
    // accidentally change the value-vs-type split rule.
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0].params[0].value, "foo(bar)");
    assert.strictEqual(segs[0].params[0].type, "String");
  });
});
