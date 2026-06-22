import * as assert from "assert";
import { runFormatPipeline } from "../src/formatPipeline";
import { FormatOptions } from "../src/types";

const opts: FormatOptions = {
  indentSize: 2,
  keywordCase: "upper",
  paramMode: "inline",
  stringQuote: "single",
};

suite("runFormatPipeline", () => {
  test("returns empty when text has no Preparing: marker", () => {
    const result = runFormatPipeline({
      text: "nothing here\njust plain log lines\n",
      options: opts,
      lineOffset: 0,
    });
    assert.strictEqual(result.kind, "empty");
  });

  test("returns empty for empty input", () => {
    const result = runFormatPipeline({
      text: "",
      options: opts,
      lineOffset: 0,
    });
    assert.strictEqual(result.kind, "empty");
  });

  test("returns ready with one formatted block when one SQL block is present", () => {
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE a = ?",
      "==> Parameters: foo(String)",
      "<==      Total: 0",
    ].join("\n");
    const result = runFormatPipeline({
      text,
      options: opts,
      lineOffset: 0,
    });
    assert.strictEqual(result.kind, "ready");
    if (result.kind !== "ready") return;
    assert.strictEqual(result.formatted.length, 1);
    assert.ok(result.formatted[0].text.includes("SELECT"));
    assert.ok(result.formatted[0].text.includes("'foo'"));
  });

  test("propagates lineOffset to the ready result", () => {
    const text = [
      "==>  Preparing: SELECT 1",
      "==> Parameters:",
      "<==      Total: 0",
    ].join("\n");
    const result = runFormatPipeline({
      text,
      options: opts,
      lineOffset: 42,
    });
    assert.strictEqual(result.kind, "ready");
    if (result.kind !== "ready") return;
    assert.strictEqual(result.lineOffset, 42);
  });

  test("returns multiple formatted blocks when input has multiple SQL blocks", () => {
    const text = [
      "==>  Preparing: SELECT 1",
      "==> Parameters:",
      "<==      Total: 0",
      "",
      "==>  Preparing: SELECT 2",
      "==> Parameters:",
      "<==      Total: 0",
    ].join("\n");
    const result = runFormatPipeline({
      text,
      options: opts,
      lineOffset: 0,
    });
    assert.strictEqual(result.kind, "ready");
    if (result.kind !== "ready") return;
    assert.strictEqual(result.formatted.length, 2);
  });

  test("placeholder mode keeps ? and emits comment block", () => {
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE a = ?",
      "==> Parameters: foo(String)",
      "<==      Total: 0",
    ].join("\n");
    const placeholderOpts: FormatOptions = {
      ...opts,
      paramMode: "placeholder",
    };
    const result = runFormatPipeline({
      text,
      options: placeholderOpts,
      lineOffset: 0,
    });
    assert.strictEqual(result.kind, "ready");
    if (result.kind !== "ready") return;
    assert.ok(
      result.formatted[0].text.includes("?"),
      "placeholder mode should keep ? in SQL",
    );
    assert.ok(
      result.formatted[0].text.includes("param[1]"),
      "placeholder mode should emit param comments",
    );
  });
});
