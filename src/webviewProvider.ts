import * as vscode from "vscode";
import { buildInsertEdits } from "./inserter";
import { renderHtml } from "./previewHtml";
import { FormattedSegment } from "./types";

/**
 * The set of commands the webview is allowed to send back to the
 * extension. Using a string literal union (instead of bare `string`)
 * means a typo in `renderHtml`'s inline JS is caught at the
 * `handleMessage` boundary, and an unknown command is logged instead
 * of silently ignored.
 */
export type PreviewCommand = "insertAll" | "cancel";

export class SqlPreviewPanel {
  public static currentPanel: SqlPreviewPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly editor: vscode.TextEditor;
  private readonly formatted: FormattedSegment[];
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    editor: vscode.TextEditor,
    formatted: FormattedSegment[],
  ) {
    this.panel = panel;
    this.editor = editor;
    this.formatted = formatted;
    this.panel.webview.html = renderHtml(formatted);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static show(
    editor: vscode.TextEditor,
    formatted: FormattedSegment[],
  ): void {
    if (SqlPreviewPanel.currentPanel) {
      // Preserve focus so keyboard users can immediately act on the
      // toolbar buttons instead of having to click back into the panel.
      SqlPreviewPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "sqfPreview",
      "SQL Formatter Preview",
      vscode.ViewColumn.Beside,
      { enableScripts: true },
    );
    SqlPreviewPanel.currentPanel = new SqlPreviewPanel(
      panel,
      editor,
      formatted,
    );
  }

  private handleMessage(msg: { command: string }): void {
    const cmd = msg.command as PreviewCommand;
    if (cmd !== "insertAll" && cmd !== "cancel") {
      // eslint-disable-next-line no-console
      console.warn(`SqlPreviewPanel: unknown command '${msg.command}'`);
      return;
    }
    if (cmd === "insertAll") {
      void this.applyAndClose();
    } else {
      this.panel.dispose();
    }
  }

  private async applyAndClose(): Promise<void> {
    const edits = buildInsertEdits(
      this.editor.document.lineCount,
      this.formatted,
    );
    const wsEdit = new vscode.WorkspaceEdit();
    for (const e of edits) {
      wsEdit.insert(
        this.editor.document.uri,
        new vscode.Position(e.line, 0),
        e.text,
      );
    }
    const ok = await vscode.workspace.applyEdit(wsEdit);
    if (ok) {
      void vscode.window.showInformationMessage(
        `Inserted ${edits.length} formatted SQL block(s). Press Cmd+Z to undo.`,
      );
    } else {
      void vscode.window.showErrorMessage(
        "WorkspaceEdit failed (file may be read-only or have conflicting edits).",
      );
    }
    this.panel.dispose();
  }

  private dispose(): void {
    SqlPreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
