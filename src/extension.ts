import * as vscode from "vscode";
import { runFormatPipeline } from "./formatPipeline";
import { buildInsertEdits } from "./inserter";
import { takeParseWarnings } from "./parser";
import { SqlPreviewPanel } from "./webviewProvider";
import { FormatOptions, FormattedSegment, SelectionInfo } from "./types";

const EXT_NAME = "MyBatis Log Formatter";

/** Suppress repeated identical warning modals within this many ms. */
const WARNING_DEDUP_WINDOW_MS = 1500;

let outputChannel: vscode.OutputChannel;
const recentWarnings = new Map<string, number>();

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(EXT_NAME);

  registerCmd(context, "mybatisLogFormatter.formatCurrentDocument", () =>
    runFormat(undefined),
  );
  registerCmd(context, "mybatisLogFormatter.formatSelection", () => {
    const sel = getSelectionInfo();
    if (!sel) return;
    runFormat(sel);
  });
  registerCmd(context, "mybatisLogFormatter.previewCurrentDocument", () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      warnUser("Please open a file first.");
      return;
    }
    const result = runFormatPipeline({
      text: editor.document.getText(),
      options: readOptions(),
      lineOffset: 0,
    });
    if (result.kind === "empty") {
      notifyEmpty();
      return;
    }
    SqlPreviewPanel.show(editor, result.formatted);
  });
}

export function deactivate(): void {
  outputChannel?.dispose();
}

/**
 * Register a command and push its disposable onto the extension context.
 * Centralising the boilerplate keeps `activate` declarative and avoids
 * the three near-identical `context.subscriptions.push(...)` blocks.
 */
function registerCmd(
  context: vscode.ExtensionContext,
  id: string,
  handler: (...args: unknown[]) => unknown,
): void {
  context.subscriptions.push(vscode.commands.registerCommand(id, handler));
}

/**
 * Top-level command handler. Wraps the whole flow in try/catch so a
 * formatting error can never leave the user's file in an unknown state
 * without a visible error message.
 */
function runFormat(selectionInfo: SelectionInfo | undefined): void {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      warnUser("Please open a file first.");
      return;
    }
    if (selectionInfo !== undefined && selectionInfo.text.length === 0) {
      warnUser("Please select some text first.");
      return;
    }

    const text = selectionInfo?.text ?? editor.document.getText();
    const options = readOptions();
    const result = runFormatPipeline({
      text,
      options,
      lineOffset: selectionInfo?.startLine ?? 0,
    });
    surfaceParseWarnings();
    if (result.kind === "empty") {
      notifyEmpty();
      return;
    }

    const autoFormat = vscode.workspace
      .getConfiguration("mybatisLogFormatter")
      .get<boolean>("autoFormat", true);
    if (!autoFormat) {
      SqlPreviewPanel.show(editor, result.formatted);
      return;
    }

    void applyInsertions(editor, result.formatted, result.lineOffset);
  } catch (err) {
    reportError("runFormat", err);
  }
}

/**
 * Build a WorkspaceEdit for the formatted blocks and apply it. The
 * `await` on `applyEdit` is essential — its `Thenable<boolean>` is
 * the only signal whether the edits actually landed (e.g. on a
 * read-only buffer or with a conflicting concurrent edit). Ignoring
 * the result silently was the biggest P0 in the original code.
 */
async function applyInsertions(
  editor: vscode.TextEditor,
  formatted: FormattedSegment[],
  lineOffset: number,
): Promise<void> {
  const edits = buildInsertEdits(editor.document.lineCount, formatted, {
    lineOffset,
  });
  const wsEdit = new vscode.WorkspaceEdit();
  for (const e of edits) {
    const pos = new vscode.Position(e.line, 0);
    wsEdit.insert(editor.document.uri, pos, e.text);
  }
  const ok = await vscode.workspace.applyEdit(wsEdit);
  if (ok) {
    void vscode.window.showInformationMessage(
      `Inserted ${edits.length} formatted SQL block(s). Press Cmd+Z to undo.`,
    );
    revealFirstInsertion(editor, edits);
  } else {
    const msg =
      "WorkspaceEdit failed (file may be read-only or have conflicting edits).";
    outputChannel?.appendLine(msg);
    void vscode.window.showErrorMessage(msg);
  }
}

/**
 * Scroll the editor to the first inserted block so the user sees the
 * result immediately instead of having to hunt for it in a long file.
 */
function revealFirstInsertion(
  editor: vscode.TextEditor,
  edits: { line: number }[],
): void {
  if (edits.length === 0) return;
  const line = Math.min(...edits.map((e) => e.line));
  const range = new vscode.Range(line, 0, line, 0);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

/**
 * Capture the editor's selected text and the line where the selection
 * starts. Selection-mode formatting uses `startLine` to offset
 * relative segment line numbers back to absolute document positions.
 */
function getSelectionInfo(): SelectionInfo | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  if (editor.selection.isEmpty) {
    warnUser("Please select some text first.");
    return undefined;
  }
  return {
    text: editor.document.getText(editor.selection),
    startLine: editor.selection.start.line,
  };
}

/**
 * Read the formatting options from VSCode config. The schema in
 * `package.json` already constrains values to the literal union types
 * we use here, so the `as` casts are safe narrowing — no runtime
 * validation needed.
 */
function readOptions(): FormatOptions {
  const c = vscode.workspace.getConfiguration("mybatisLogFormatter");
  return {
    indentSize: c.get<2 | 4>("indentSize", 4),
    keywordCase: c.get<FormatOptions["keywordCase"]>("keywordCase", "upper"),
    paramMode: c.get<FormatOptions["paramMode"]>("paramMode", "inline"),
    stringQuote: c.get<FormatOptions["stringQuote"]>("stringQuote", "single"),
  };
}

/**
 * Notify the user that no SQL log blocks were found. Status bar
 * messages disappear after 5s, so we also push a notification that
 * stays until acknowledged, and log to the output channel for triage.
 * Deduplicated: a second invocation within `WARNING_DEDUP_WINDOW_MS`
 * is silently swallowed to avoid modal spam when users hammer the keybind.
 */
function notifyEmpty(): void {
  const msg = "No SQL log blocks found.";
  if (!shouldEmit(msg)) return;
  outputChannel?.appendLine(msg);
  void vscode.window.showInformationMessage(msg);
}

/**
 * Drain parse warnings emitted by the most recent `parseSqlLog` and
 * surface them through the output channel + a single notification.
 * Skipped when there's nothing to say, so a clean parse is silent.
 */
function surfaceParseWarnings(): void {
  const warnings = takeParseWarnings();
  if (warnings.length === 0) return;
  for (const w of warnings) {
    outputChannel?.appendLine(`line ${w.line + 1}: ${w.reason}`);
  }
  const msg = `${warnings.length} parse warning(s) — see ${EXT_NAME} output.`;
  if (shouldEmit(msg)) {
    void vscode.window.showWarningMessage(msg);
    outputChannel?.show(true);
  }
}

/**
 * Emit a warning modal, deduplicated by message text within
 * `WARNING_DEDUP_WINDOW_MS`. Always logs to the output channel.
 */
function warnUser(msg: string): void {
  outputChannel?.appendLine(msg);
  if (!shouldEmit(msg)) return;
  void vscode.window.showWarningMessage(msg);
}

/**
 * Rate-limit identical messages so repeated keybind presses don't
 * stack modals. Returns true if the caller should proceed to show
 * the UI; false if it should stay silent.
 */
function shouldEmit(msg: string): boolean {
  const now = Date.now();
  const last = recentWarnings.get(msg) ?? 0;
  if (now - last < WARNING_DEDUP_WINDOW_MS) return false;
  recentWarnings.set(msg, now);
  return true;
}

/**
 * Report an unexpected error to both the user and the output channel.
 * The output channel is the durable record; the modal is what the user
 * sees when the command silently would have otherwise done nothing.
 */
function reportError(command: string, err: unknown): void {
  const detail =
    err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const prefix = `[mybatis-log-formatter] ${command} failed:`;
  outputChannel?.appendLine(`${prefix} ${detail}`);
  if (err instanceof Error && err.stack) {
    outputChannel?.appendLine(err.stack);
  }
  void vscode.window.showErrorMessage(
    `${prefix} ${detail} (see ${EXT_NAME} output for details)`,
  );
  outputChannel?.show(true);
}
