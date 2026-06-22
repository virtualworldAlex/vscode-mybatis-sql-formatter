import { Param, SqlSegment } from "./types";

/**
 * Match a line that begins a SQL log block: "==>  Preparing: <sql>"
 */
const PREPARING_RE = /^==>\s+Preparing:\s+(.+?)\s*$/;

/** Match a "==> Parameters: ..." line. */
const PARAMETERS_RE = /^==>\s+Parameters:\s*(.*)$/;

/** Match a single parameter token: "value(Type)". */
const PARAM_TOKEN_RE = /^(.+?)\(([^)]+)\)\s*$/;

/** Result block markers. */
const COLUMNS_RE = /^<==\s+Columns:\s*(.*)$/;
const ROW_RE = /^<==\s+Row:\s*(.*)$/;
// Loose on the value side so we can warn on non-numeric instead of
// silently dropping the line — the original `\d+` would not match
// "not-a-number" at all, leaving the caller with no signal.
const TOTAL_RE = /^<==\s+Total:\s*(.+?)\s*$/;

/**
 * Non-fatal issues the parser can flag while walking the input.
 * Surfaced via `lastParseWarnings` for the extension layer to log.
 */
export interface ParseWarning {
  line: number;
  reason: string;
}

let lastParseWarnings: ParseWarning[] = [];

/**
 * Read warnings emitted by the most recent `parseSqlLog` call.
 * Cleared on each new parse, so callers should drain immediately.
 */
export function takeParseWarnings(): ParseWarning[] {
  const out = lastParseWarnings;
  lastParseWarnings = [];
  return out;
}

function warn(line: number, reason: string): void {
  lastParseWarnings.push({ line, reason });
}

/**
 * Parse the contents of an active editor into SQL log segments.
 * Greedy: each Preparing: starts a new segment; the segment ends at the
 * next line that does not match the result-section pattern, or at the
 * next Preparing: line.
 *
 * Errors:
 * - Malformed `==>  Total: <not-a-number>` lines are skipped with a
 *   warning instead of throwing, so one bad block can't poison the
 *   whole parse.
 */
export function parseSqlLog(text: string): SqlSegment[] {
  lastParseWarnings = [];
  const lines = text.split(/\r?\n/);
  const segments: SqlSegment[] = [];

  let i = 0;
  while (i < lines.length) {
    const preparing = lines[i].match(PREPARING_RE);
    if (!preparing) {
      i++;
      continue;
    }

    const startLine = i;
    const sqlText = preparing[1];
    const params: Param[] = [];
    let result: SqlSegment["result"] | undefined;
    let j = i + 1;

    while (j < lines.length) {
      const line = lines[j];

      const paramMatch = line.match(PARAMETERS_RE);
      if (paramMatch) {
        parseParameters(paramMatch[1], params);
        j++;
        while (j < lines.length) {
          const rl = lines[j];
          const colMatch = rl.match(COLUMNS_RE);
          if (colMatch) {
            result = result ?? {};
            result.columns = colMatch[1]
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            j++;
            continue;
          }
          const rowMatch = rl.match(ROW_RE);
          if (rowMatch) {
            result = result ?? {};
            result.rows = result.rows ?? [];
            result.rows.push(splitRow(rowMatch[1]));
            j++;
            continue;
          }
          const totalMatch = rl.match(TOTAL_RE);
          if (totalMatch) {
            const n = Number.parseInt(totalMatch[1], 10);
            if (Number.isNaN(n)) {
              warn(j, `Total 字段不是有效整数: "${totalMatch[1]}"`);
              j++;
              continue;
            }
            result = result ?? {};
            result.total = n;
            j++;
            continue;
          }
          break;
        }
        break;
      }

      if (PREPARING_RE.test(line)) break;
      j++;
    }

    segments.push({
      startLine,
      endLine: j - 1,
      sqlText,
      params,
      result,
    });

    i = j;
  }

  return segments;
}

/**
 * Parse the tail of a `==> Parameters: ...` line into `Param` entries
 * appended to the given array. Each token is either the literal
 * `"null"`, a typed value `value(Type)`, or a bare untyped value.
 * Empty input is a no-op; existing entries in `params` are preserved.
 */
function parseParameters(tail: string, params: Param[]): void {
  if (!tail.trim()) return;
  const tokens = splitTopLevelCommas(tail);
  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;
    // 1-based positional index matching the ? in the prepared SQL.
    const index = params.length + 1;
    if (t === "null") {
      params.push({ index, value: "null", type: "null" });
      continue;
    }
    const m = t.match(PARAM_TOKEN_RE);
    if (m) {
      params.push({
        index,
        value: m[1].trim(),
        // MyBatis occasionally emits compound type hints like "String,VARCHAR";
        // take only the first segment as the canonical JDBC type.
        type: m[2].split(",")[0].trim(),
      });
    } else {
      params.push({ index, value: t, type: "" });
    }
  }
}

/**
 * Split a comma-separated string at top-level commas only. Commas
 * nested inside parentheses (e.g. inside SQL function calls such as
 * `foo(bar, baz)`) are preserved as part of the surrounding token.
 */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.length) out.push(buf);
  return out;
}

/**
 * Split a `<== Row: a, b, c` values string into trimmed cell tokens,
 * reusing `splitTopLevelCommas` so nested parentheses in any cell
 * (rare but possible) are handled consistently with parameter parsing.
 */
function splitRow(s: string): string[] {
  return splitTopLevelCommas(s).map((x) => x.trim());
}
