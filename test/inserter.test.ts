import * as assert from "assert";
import { buildInsertEdits } from "../src/inserter";
import { FormattedSegment, SqlSegment } from "../src/types";

function makeFmt(
  sql: string,
  startLine: number,
  endLine: number,
): FormattedSegment {
  const seg: SqlSegment = { startLine, endLine, sqlText: sql, params: [] };
  return { segment: seg, text: `-- ${sql}` };
}

suite("buildInsertEdits", () => {
  test("inserts after endLine + 2 (one blank line gap)", () => {
    const edits = buildInsertEdits(10, [makeFmt("SELECT 1", 0, 2)]);
    assert.strictEqual(edits.length, 1);
    assert.strictEqual(edits[0].line, 4);
    assert.strictEqual(edits[0].text, "-- SELECT 1\n");
  });

  test("orders multiple inserts bottom-up (higher line first)", () => {
    const edits = buildInsertEdits(20, [
      makeFmt("A", 0, 1),
      makeFmt("B", 5, 6),
      makeFmt("C", 10, 11),
    ]);
    assert.deepStrictEqual(
      edits.map((e) => e.line),
      [13, 8, 3],
    );
  });

  test("text ends with newline so insertion does not concatenate with next line", () => {
    const edits = buildInsertEdits(5, [makeFmt("X", 0, 0)]);
    assert.ok(edits[0].text.endsWith("\n"));
  });

  test("selection mode: applies lineOffset to map relative line numbers to absolute", () => {
    // Selection starts at document line 50; within selection, the segment
    // occupies lines 0..1 (relative). Absolute endLine = 50 + 1 = 51.
    // Insertion point = 51 + 2 = 53.
    const edits = buildInsertEdits(100, [makeFmt("SELECT 1", 0, 1)], {
      lineOffset: 50,
    });
    assert.strictEqual(edits.length, 1);
    assert.strictEqual(edits[0].line, 53);
    assert.strictEqual(edits[0].text, "-- SELECT 1\n");
  });

  test("selection mode: each block is inserted independently below its own end", () => {
    // Selection starts at document line 10; within selection three
    // segments at relative lines (0,1), (5,6), (10,11). Absolute endLines
    // = 11, 16, 21. Insertion points = +2 -> 13, 18, 23. Order
    // bottom-up so the early edits do not shift later ones.
    const edits = buildInsertEdits(
      50,
      [makeFmt("A", 0, 1), makeFmt("B", 5, 6), makeFmt("C", 10, 11)],
      { lineOffset: 10 },
    );
    assert.deepStrictEqual(
      edits.map((e) => e.line),
      [23, 18, 13],
    );
  });

  test("selection mode: empty lineOffset behaves like whole-document mode", () => {
    // Passing 0 offset must produce the same result as the default call.
    const withDefault = buildInsertEdits(10, [makeFmt("SELECT 1", 0, 2)]);
    const withZeroOffset = buildInsertEdits(10, [makeFmt("SELECT 1", 0, 2)], {
      lineOffset: 0,
    });
    assert.deepStrictEqual(withDefault, withZeroOffset);
  });
});
