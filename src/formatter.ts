import {
  format as sqlFormat,
  FormatOptionsWithLanguage as SqlFmtOptions,
} from "sql-formatter";
import { FormattedSegment, FormatOptions, Param, SqlSegment } from "./types";

const HEADER = "-- === Formatted SQL ===";
const FOOTER = "-- === End ===";
/** Spacing between consecutive queries when sql-formatter emits multiple. */
const LINES_BETWEEN_QUERIES = 2;

/**
 * Numeric JDBC types rendered as bare numbers (no quoting).
 * Set lookup is O(1) and keeps the list data-driven instead of a
 * 7-branch if-chain.
 */
const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  "integer",
  "long",
  "short",
  "double",
  "float",
  "bigdecimal",
  "number",
]);

/**
 * Format a list of SQL log segments. Returns one rendered block per
 * segment; the caller decides where to insert.
 */
export function formatSegments(
  segments: SqlSegment[],
  options: FormatOptions,
): FormattedSegment[] {
  return segments.map((s) => formatSegment(s, options));
}

/**
 * Format a single segment: replace ? placeholders with literal values
 * (inline mode) or add a comment block of param info (placeholder mode),
 * then prettify the SQL.
 */
export function formatSegment(
  segment: SqlSegment,
  options: FormatOptions,
): FormattedSegment {
  const sqlWithParams =
    options.paramMode === "inline"
      ? inlineParams(segment.sqlText, segment.params, options)
      : segment.sqlText;

  const sqlOpts: SqlFmtOptions = {
    language: "mysql",
    tabWidth: options.indentSize,
    useTabs: false,
    keywordCase: options.keywordCase,
    linesBetweenQueries: LINES_BETWEEN_QUERIES,
  };

  const formattedSql = sqlFormat(sqlWithParams, sqlOpts);

  const body = ensureSemicolon(formattedSql);
  const paramBlock = renderParamBlock(segment.params, options);
  return { segment, text: renderBlock(paramBlock, body) };
}

/**
 * Compose the final block text: HEADER, optional param block, SQL body,
 * FOOTER. Centralised so the placeholder-mode and inline-mode paths
 * stay in lockstep.
 */
function renderBlock(paramBlock: string, body: string): string {
  if (paramBlock.length === 0) {
    return `${HEADER}\n${body}\n${FOOTER}`;
  }
  return `${HEADER}\n${paramBlock}\n${body}\n${FOOTER}`;
}

/**
 * Build the `-- param[N] = value (Type)` comment block for placeholder
 * mode. Returns an empty string when there are no params, so the caller
 * can branch on length instead of duplicating the join logic.
 */
function renderParamBlock(params: Param[], options: FormatOptions): string {
  if (params.length === 0) return "";
  return params
    .map(
      (p) =>
        `-- param[${p.index}] = ${renderParamValue(p, options)} (${p.type || "unknown"})`,
    )
    .join("\n");
}

/**
 * Make sure the formatted SQL ends with a single `;` before being
 * embedded in the comment-bracketed block. Trimmed first so we never
 * produce `;;` when sql-formatter already added a terminator.
 */
function ensureSemicolon(formatted: string): string {
  const trimmed = formatted.trimEnd();
  return trimmed.endsWith(";") ? trimmed : `${trimmed};`;
}

/**
 * Substitute `?` placeholders in `sql` with rendered parameter literals
 * in order. Extra placeholders past `params.length` are left as `?`
 * (e.g. when SQL has more `?` than the log captured). With no params
 * the SQL is returned untouched.
 *
 * Implementation note: builds the output via array push + single
 * `join` instead of repeated `+=` so the cost stays O(n) for large
 * SQL strings (string concatenation in a loop copies the prefix on
 * every iteration, which is quadratic in pathological cases).
 */
function inlineParams(
  sql: string,
  params: Param[],
  options: FormatOptions,
): string {
  if (params.length === 0) return sql;

  const parts: string[] = [];
  let cursor = 0;
  for (const p of params) {
    const idx = sql.indexOf("?", cursor);
    if (idx === -1) break;
    parts.push(sql.slice(cursor, idx), renderParamValue(p, options));
    cursor = idx + 1;
  }
  parts.push(sql.slice(cursor));
  return parts.join("");
}

/**
 * Render one parameter value as a SQL literal, choosing quoting and
 * case based on the JDBC `type` and `options.stringQuote`:
 *
 * - `null` / value `"null"`         → `NULL`
 * - `string|date|timestamp|time`     → quoted (single or double)
 * - `boolean`                        → `TRUE` / `FALSE` / uppercased
 * - numeric (`integer|long|short|double|float|bigdecimal|number`)
 *                                    → bare number, no quotes
 * - empty type                       → numeric regex / boolean / null
 *                                      heuristic, otherwise quoted
 * - unknown type                     → quoted (string fallback)
 *
 * String values are escaped by doubling the quote character.
 */
function renderParamValue(p: Param, options: FormatOptions): string {
  const quote = options.stringQuote === "single" ? "'" : '"';
  const t = (p.type || "").toLowerCase();
  const v = p.value;

  // Null is null: type "null" OR literal "null" value both → NULL.
  if (t === "null" || v === "null") return "NULL";

  // Numeric branch: fast Set lookup instead of 7-branch if-chain.
  if (NUMERIC_TYPES.has(t)) return v;

  // String-like branch (must run BEFORE empty-type heuristic so that
  // explicitly-typed strings never fall through to numeric regex).
  if (t === "string" || t === "date" || t === "timestamp" || t === "time") {
    return `${quote}${escape(v, quote)}${quote}`;
  }

  // Boolean: type known OR value matches TRUE/FALSE literally.
  if (t === "boolean" || (t === "" && /^(true|false)$/i.test(v))) {
    if (v.toLowerCase() === "true") return "TRUE";
    if (v.toLowerCase() === "false") return "FALSE";
    return v.toUpperCase();
  }

  // Heuristic inference when type is empty.
  if (t === "") {
    if (/^-?\d+(\.\d+)?$/.test(v)) return v;
    return `${quote}${escape(v, quote)}${quote}`;
  }

  // Fallback: treat as string.
  return `${quote}${escape(v, quote)}${quote}`;
}

/**
 * Escape a string value for inclusion inside a SQL string literal of
 * the given `quote` character by doubling that character (SQL standard
 * escape). All other characters are passed through unchanged.
 */
function escape(value: string, quote: string): string {
  return value.replace(new RegExp(quote, "g"), quote + quote);
}
