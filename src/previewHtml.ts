import { escapeHtml } from "./escapeHtml";
import { FormattedSegment } from "./types";

/**
 * Pure HTML renderer for the preview webview. Pulled out of
 * `webviewProvider.ts` so it can be unit-tested without loading the
 * VSCode API (which isn't available under plain Node).
 *
 * Security:
 * - All dynamic text is run through `escapeHtml`.
 * - CSP locks the webview down to inline scripts/styles only
 *   (no remote resources, no eval, no inline event handlers
 *   other than the two onclick attributes — those are allowed
 *   because we register `unsafe-inline` for `script-src`).
 *
 * Visual: the page uses VSCode's CSS variables so it inherits the
 * user's current theme without any extra work.
 */
export function renderHtml(formatted: FormattedSegment[]): string {
  const cards = formatted
    .map(
      (f, i) => `
        <div class="card">
          <div class="card-header">段 ${i + 1} <span class="meta">行 ${f.segment.startLine + 1}–${f.segment.endLine + 1}</span></div>
          <pre>${escapeHtml(f.text)}</pre>
        </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>SQL Formatter Preview</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .toolbar { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 8px 0; border-bottom: 1px solid var(--vscode-widget-border); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 6px 12px; margin-right: 8px; cursor: pointer; border-radius: 2px; }
  button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .card { margin: 12px 0; padding: 8px; border: 1px solid var(--vscode-widget-border); border-radius: 4px; }
  .card-header { font-weight: bold; margin-bottom: 6px; }
  .meta { font-weight: normal; color: var(--vscode-descriptionForeground); margin-left: 8px; }
  pre { background: var(--vscode-textCodeBlock-background); padding: 8px; overflow: auto; }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="send('insertAll')">插入全部到文件</button>
    <button class="secondary" onclick="send('cancel')">取消</button>
  </div>
  ${cards}
  <script>
    const vscode = acquireVsCodeApi();
    function send(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
}
