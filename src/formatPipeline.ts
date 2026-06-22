import { parseSqlLog } from "./parser";
import { formatSegments } from "./formatter";
import { FormatOptions, FormattedSegment, SqlSegment } from "./types";

/**
 * Inputs to the format pipeline. Keeping the surface pure lets
 * `extension.ts` stay a thin shell over VSCode APIs and lets the
 * decision tree (parse → format → insert / preview) be unit-tested
 * without mocking VSCode.
 */
export interface FormatPipelineInput {
  /** Raw text to scan for SQL log blocks (whole doc or selection). */
  text: string;
  /** User-configurable formatting options. */
  options: FormatOptions;
  /** Optional 0-based line offset for selection-mode coordinate remap. */
  lineOffset: number;
}

/**
 * Result of running the pipeline. Two variants:
 *
 * - `empty`        — no SQL log blocks were found; the caller should
 *                    surface this as a user-visible message.
 * - `ready`        — formatted blocks are available; the caller decides
 *                    whether to insert directly or open the preview
 *                    webview based on `autoFormat`.
 */
export type FormatPipelineResult =
  | { kind: "empty" }
  | { kind: "ready"; formatted: FormattedSegment[]; lineOffset: number };

/**
 * Parse + format a chunk of text in one call. This is the unit-testable
 * core of the format command — extension.ts wraps it with VSCode
 * glue (editor selection, config read, applyEdit).
 */
export function runFormatPipeline(
  input: FormatPipelineInput,
): FormatPipelineResult {
  const segments: SqlSegment[] = parseSqlLog(input.text);
  if (segments.length === 0) return { kind: "empty" };
  const formatted = formatSegments(segments, input.options);
  return { kind: "ready", formatted, lineOffset: input.lineOffset };
}
