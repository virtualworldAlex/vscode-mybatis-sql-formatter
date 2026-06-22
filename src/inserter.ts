import { FormattedSegment } from "./types";

export interface InsertEdit {
  /** Zero-based line index to insert at (BEFORE this line). */
  line: number;
  /** Text to insert. Must end with a newline. */
  text: string;
}

export interface InsertOptions {
  /**
   * Offset added to each segment's relative endLine to convert it to
   * an absolute document line number. Use 0 for whole-document mode
   * (segment.endLine is already absolute) and the selection's start
   * line for selection mode (segment.endLine is relative to the
   * selected text).
   */
  lineOffset?: number;
}

/**
 * Number of blank lines inserted between a source block's last line
 * and the formatted SQL block that follows it. With 0-indexed line
 * numbers, the formatted block lands `endLine + BLANK_LINE_GAP`
 * positions down, leaving `BLANK_LINE_GAP - 1 = 1` empty line as a
 * visual separator.
 */
const BLANK_LINE_GAP = 2;

/**
 * Compute insert edits for a list of formatted segments. Returns
 * edits in bottom-up order so that applying them in sequence does not
 * invalidate the line numbers of earlier edits.
 *
 * Insertion point: `segment.endLine + lineOffset + BLANK_LINE_GAP`
 *   → the formatted SQL block lands one line below a blank separator
 *     that follows the source block.
 */
export function buildInsertEdits(
  _documentLineCount: number,
  segments: FormattedSegment[],
  options: InsertOptions = {},
): InsertEdit[] {
  const offset = options.lineOffset ?? 0;
  const sorted = [...segments].sort(
    (a, b) => b.segment.endLine - a.segment.endLine,
  );
  return sorted.map((s) => ({
    line: s.segment.endLine + offset + BLANK_LINE_GAP,
    text: s.text + "\n",
  }));
}
