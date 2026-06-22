/**
 * A single parameter extracted from a MyBatis Parameters: line.
 * `type` follows MyBatis JDBC type names (String, Integer, Long, etc.).
 * When `value` is the literal "null", `type` is "null".
 */
export interface Param {
  /** 1-based positional index matching the ? in SQL. */
  index: number;
  /** Raw value as captured from log (untrimmed of outer quotes). */
  value: string;
  /** JDBC type name; "null" when value is SQL NULL. */
  type: string;
}

/**
 * A SQL log block: the Preparing: line, any [trace] line carrying a
 * duplicated SQL inside [ ... ] brackets, the Parameters: line, and
 * the optional result section (Columns / Row / Total).
 */
export interface SqlSegment {
  /** Zero-based line index where the block starts (Preparing: line). */
  startLine: number;
  /** Zero-based line index where the block ends (last Row/Total or Parameters line). */
  endLine: number;
  /** SQL text with ? placeholders. */
  sqlText: string;
  /** Parameters in ? order. */
  params: Param[];
  /** Optional result section. */
  result?: {
    columns?: string[];
    rows?: string[][];
    total?: number;
  };
}

/** User-configurable formatting options. */
export interface FormatOptions {
  indentSize: 2 | 4;
  keywordCase: "upper" | "lower" | "preserve";
  paramMode: "inline" | "placeholder";
  stringQuote: "single" | "double";
}

/** Result of formatting a single segment. */
export interface FormattedSegment {
  segment: SqlSegment;
  /** Rendered SQL block, including comment markers. */
  text: string;
}

/**
 * Snapshot of the editor's selection used by selection-mode formatting.
 * `text` is the selected substring; `startLine` is the document line
 * where the selection begins, so callers can offset relative line
 * numbers back to absolute positions.
 */
export interface SelectionInfo {
  text: string;
  startLine: number;
}
