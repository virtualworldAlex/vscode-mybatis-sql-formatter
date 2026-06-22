import * as assert from "assert";
import { parseSqlLog, takeParseWarnings } from "../src/parser";

suite("parseSqlLog warnings", () => {
  test("malformed Total line is skipped with a warning, not thrown", () => {
    const text = [
      "==>  Preparing: SELECT 1",
      "==> Parameters:",
      "<==      Total: not-a-number",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0].result?.total, undefined);
    const warnings = takeParseWarnings();
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].reason.includes("Total"));
  });

  test("valid Total line produces no warnings", () => {
    const text = [
      "==>  Preparing: SELECT 1",
      "==> Parameters:",
      "<==      Total: 7",
    ].join("\n");
    parseSqlLog(text);
    assert.deepStrictEqual(takeParseWarnings(), []);
  });

  test("warnings are cleared between parses", () => {
    parseSqlLog(
      "==>  Preparing: SELECT 1\n==> Parameters:\n<==      Total: bad",
    );
    const first = takeParseWarnings();
    assert.ok(first.length > 0);
    parseSqlLog("==>  Preparing: SELECT 2\n==> Parameters:\n<==      Total: 1");
    assert.deepStrictEqual(takeParseWarnings(), []);
  });
});
