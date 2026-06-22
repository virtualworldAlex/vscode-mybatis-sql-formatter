# SQL Formatter (sqf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VSCode extension that detects MyBatis-style SQL log blocks in the active editor, formats the SQL with parameters inlined as literals, and inserts the formatted result directly below each detected block.

**Architecture:** TypeScript-based VSCode extension using `sql-formatter` for SQL prettifying, regex-based parser for log blocks, `WorkspaceEdit` for in-place insertion (processed bottom-up to keep line numbers stable). Webview panel supports manual-preview mode.

**Tech Stack:** TypeScript, VSCode Extension API, `sql-formatter` (npm), Mocha + `@vscode/test-electron` for tests, `vsce` for packaging.

---

## File Structure

Files to be created (all under `/Users/admin/software/Vscode/plugin/`):

| File                     | Responsibility                                                                |
| ------------------------ | ----------------------------------------------------------------------------- |
| `package.json`           | Extension manifest, commands, configuration, scripts                          |
| `tsconfig.json`          | TypeScript config (strict, ES2020, CommonJS)                                  |
| `.vscodeignore`          | Files excluded from package                                                   |
| `src/types.ts`           | Shared types: `Param`, `SqlSegment`, `FormatOptions`                          |
| `src/parser.ts`          | `parseSqlLog(text)` — regex extraction of Preparing/Parameters/Row blocks     |
| `src/formatter.ts`       | `formatSegment(segment, options)` — call sql-formatter + inline params        |
| `src/inserter.ts`        | `insertFormatted(editor, segments, formattedTexts)` — bottom-up WorkspaceEdit |
| `src/webviewProvider.ts` | `SqlPreviewPanel` — manual-mode preview Webview                               |
| `src/extension.ts`       | Activate/deactivate, command registration                                     |
| `test/parser.test.ts`    | Parser unit tests                                                             |
| `test/formatter.test.ts` | Formatter unit tests                                                          |
| `test/inserter.test.ts`  | Inserter unit tests                                                           |
| `test/suite/index.ts`    | Test runner entry point                                                       |
| `README.md`              | User-facing docs                                                              |
| `CHANGELOG.md`           | Version history                                                               |

---

## Task 1: Project Scaffold

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.vscodeignore`
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
out/
dist/
*.vsix
.DS_Store
.vscode-test/
coverage/
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "test"]
}
```

- [ ] **Step 3: Create `.vscodeignore`**

```
.vscode/**
.vscode-test/**
out/test/**
test/**
src/**
tsconfig.json
.gitignore
**/*.map
```

- [ ] **Step 4: Create `package.json`**

```json
{
  "name": "sqf",
  "displayName": "SQL Formatter",
  "description": "Format and inline MyBatis SQL log blocks in place",
  "version": "0.1.0",
  "publisher": "local",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": ["Other"],
  "main": "./out/extension.js",
  "activationEvents": [
    "onCommand:sqf.formatCurrentDocument",
    "onCommand:sqf.formatSelection",
    "onCommand:sqf.previewCurrentDocument"
  ],
  "contributes": {
    "commands": [
      {
        "command": "sqf.formatCurrentDocument",
        "title": "SQL Formatter: Format Current Document"
      },
      {
        "command": "sqf.formatSelection",
        "title": "SQL Formatter: Format Selection"
      },
      {
        "command": "sqf.previewCurrentDocument",
        "title": "SQL Formatter: Preview Current Document"
      }
    ],
    "configuration": {
      "title": "SQL Formatter",
      "properties": {
        "sqf.autoFormat": {
          "type": "boolean",
          "default": true,
          "description": "Insert formatted SQL directly. When false, show Webview preview first."
        },
        "sqf.indentSize": {
          "type": "number",
          "enum": [2, 4],
          "default": 4,
          "description": "Indent size for formatted SQL"
        },
        "sqf.keywordCase": {
          "type": "string",
          "enum": ["upper", "lower", "preserve"],
          "default": "upper",
          "description": "Keyword case in formatted SQL"
        },
        "sqf.paramMode": {
          "type": "string",
          "enum": ["inline", "placeholder"],
          "default": "inline",
          "description": "Parameter representation: inline (literal) or placeholder (? with comments)"
        },
        "sqf.stringQuote": {
          "type": "string",
          "enum": ["single", "double"],
          "default": "single",
          "description": "Quote character for string literals"
        }
      }
    }
  },
  "scripts": {
    "build": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "vscode-test",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "@vscode/test-electron": "^2.3.0",
    "typescript": "^5.3.0",
    "vsce": "^2.15.0",
    "mocha": "^10.2.0"
  },
  "dependencies": {
    "sql-formatter": "^13.0.0"
  }
}
```

- [ ] **Step 5: Install dependencies**

Run: `cd /Users/admin/software/Vscode/plugin && npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git init
git add .gitignore tsconfig.json .vscodeignore package.json
git commit -m "chore: scaffold VSCode extension project"
```

---

## Task 2: Shared Types Module

**Files:**

- Create: `src/types.ts`
- Test: (no test, type-only)

- [ ] **Step 1: Create `src/types.ts`**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/admin/software/Vscode/plugin && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add src/types.ts
git commit -m "feat(types): add shared type definitions for SQL log parser"
```

---

## Task 3: Parser - Test First

**Files:**

- Create: `test/parser.test.ts`
- Create: `src/parser.ts` (stub initially)

- [ ] **Step 1: Create stub `src/parser.ts`**

```ts
import { SqlSegment } from "./types";

export function parseSqlLog(_text: string): SqlSegment[] {
  return [];
}
```

- [ ] **Step 2: Create `test/parser.test.ts` with failing tests**

```ts
import * as assert from "assert";
import { parseSqlLog } from "../src/parser";

suite("parseSqlLog", () => {
  test("returns empty array for empty text", () => {
    assert.deepStrictEqual(parseSqlLog(""), []);
  });

  test("parses a single block with String and Integer params", () => {
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE a = ? AND b = ?",
      "==> Parameters: foo(String), 3(String)",
      "<==    Columns: a, b",
      "<==        Row: 1, 2",
      "<==      Total: 1",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(
      segs[0].sqlText,
      "SELECT * FROM t WHERE a = ? AND b = ?",
    );
    assert.strictEqual(segs[0].params.length, 2);
    assert.deepStrictEqual(segs[0].params[0], {
      index: 1,
      value: "foo",
      type: "String",
    });
    assert.deepStrictEqual(segs[0].params[1], {
      index: 2,
      value: "3",
      type: "String",
    });
    assert.deepStrictEqual(segs[0].result?.columns, ["a", "b"]);
    assert.deepStrictEqual(segs[0].result?.rows, [["1", "2"]]);
    assert.strictEqual(segs[0].result?.total, 1);
  });

  test("parses a block with trace line carrying SQL in brackets", () => {
    const text = [
      "==>  Preparing: SELECT id FROM users WHERE id = ?",
      "[10.0.9.137][app][traceId:abc][ INFO][2026-05-19 13:28:31] --[msg:... SQL [SELECT id FROM users WHERE id = ?]] --[...]-- SQLExecutionTraceInterceptor",
      "==> Parameters: 42(Integer)",
      "<==      Total: 0",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0].sqlText, "SELECT id FROM users WHERE id = ?");
    assert.strictEqual(segs[0].params[0].value, "42");
    assert.strictEqual(segs[0].params[0].type, "Integer");
  });

  test("parses multiple blocks in one text", () => {
    const text = [
      "==>  Preparing: SELECT 1 FROM dual WHERE a = ?",
      "==> Parameters: 1(String)",
      "<==      Total: 1",
      "",
      "==>  Preparing: SELECT 2 FROM dual WHERE b = ?",
      "==> Parameters: two(String)",
      "<==      Total: 1",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 2);
    assert.strictEqual(segs[0].sqlText, "SELECT 1 FROM dual WHERE a = ?");
    assert.strictEqual(segs[1].sqlText, "SELECT 2 FROM dual WHERE b = ?");
    assert.strictEqual(segs[0].startLine, 0);
    assert.strictEqual(segs[0].endLine, 2);
    assert.strictEqual(segs[1].startLine, 4);
    assert.strictEqual(segs[1].endLine, 6);
  });

  test("handles null parameter", () => {
    const text = [
      "==>  Preparing: SELECT * FROM t WHERE x = ?",
      "==> Parameters: null",
      "<==      Total: 0",
    ].join("\n");
    const segs = parseSqlLog(text);
    assert.strictEqual(segs[0].params[0], {
      index: 1,
      value: "null",
      type: "null",
    });
  });

  test("returns empty when no Preparing: found", () => {
    const text = "==>  Parameters: foo(String)\n<==      Total: 0";
    assert.deepStrictEqual(parseSqlLog(text), []);
  });

  test("handles missing result section", () => {
    const text = ["==>  Preparing: UPDATE t SET x = 1", "==> Parameters:"].join(
      "\n",
    );
    const segs = parseSqlLog(text);
    assert.strictEqual(segs.length, 1);
    assert.strictEqual(segs[0].result, undefined);
  });
});
```

- [ ] **Step 3: Run tests and confirm they FAIL**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: All 6 `parseSqlLog` tests FAIL (parser is a stub returning `[]`).

- [ ] **Step 4: Commit failing tests**

```bash
cd /Users/admin/software/Vscode/plugin
git add test/ src/parser.ts
git commit -m "test(parser): add failing tests for SQL log parser"
```

---

## Task 4: Parser - Implementation

**Files:**

- Modify: `src/parser.ts`

- [ ] **Step 1: Implement the parser**

Replace `src/parser.ts` content with:

```ts
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
const TOTAL_RE = /^<==\s+Total:\s*(\d+)\s*$/;

/**
 * Parse the contents of an active editor into SQL log segments.
 * Greedy: each Preparing: starts a new segment; the segment ends at the
 * next line that does not match the result-section pattern, or at the
 * next Preparing: line.
 */
export function parseSqlLog(text: string): SqlSegment[] {
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
            result = result ?? {};
            result.total = parseInt(totalMatch[1], 10);
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

function parseParameters(tail: string, params: Param[]): void {
  if (!tail.trim()) return;
  const tokens = splitTopLevelCommas(tail);
  for (const tok of tokens) {
    const t = tok.trim();
    if (!t) continue;
    if (t === "null") {
      params.push({ index: params.length + 1, value: "null", type: "null" });
      continue;
    }
    const m = t.match(PARAM_TOKEN_RE);
    if (m) {
      params.push({
        index: params.length + 1,
        value: m[1].trim(),
        type: m[2].split(",")[0].trim(),
      });
    } else {
      params.push({ index: params.length + 1, value: t, type: "" });
    }
  }
}

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

function splitRow(s: string): string[] {
  return splitTopLevelCommas(s).map((x) => x.trim());
}
```

- [ ] **Step 2: Run tests and confirm they PASS**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: All 6 `parseSqlLog` tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add src/parser.ts
git commit -m "feat(parser): implement SQL log block parser"
```

---

## Task 5: Formatter - Test First

**Files:**

- Create: `test/formatter.test.ts`
- Modify: `src/formatter.ts` (stub)

- [ ] **Step 1: Create stub `src/formatter.ts`**

```ts
import { FormattedSegment, FormatOptions, SqlSegment } from "./types";

export function formatSegment(
  _segment: SqlSegment,
  _options: FormatOptions,
): FormattedSegment {
  throw new Error("not implemented");
}

export function formatSegments(
  _segments: SqlSegment[],
  _options: FormatOptions,
): FormattedSegment[] {
  return [];
}
```

- [ ] **Step 2: Add tests in `test/formatter.test.ts`**

```ts
import * as assert from "assert";
import { formatSegment, formatSegments } from "../src/formatter";
import { FormatOptions, SqlSegment } from "../src/types";

const baseOptions: FormatOptions = {
  indentSize: 4,
  keywordCase: "upper",
  paramMode: "inline",
  stringQuote: "single",
};

function makeSegment(
  sql: string,
  params: { value: string; type: string }[],
): SqlSegment {
  return {
    startLine: 0,
    endLine: 0,
    sqlText: sql,
    params: params.map((p, i) => ({
      index: i + 1,
      value: p.value,
      type: p.type,
    })),
  };
}

suite("formatSegment (inline mode)", () => {
  test("replaces String param with single-quoted literal", () => {
    const seg = makeSegment("SELECT * FROM t WHERE a = ?", [
      { value: "foo", type: "String" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("'foo'"), `expected 'foo' in: ${out.text}`);
    assert.ok(!out.text.includes("?"), `? should be replaced in: ${out.text}`);
  });

  test("replaces Integer param with bare number", () => {
    const seg = makeSegment("SELECT * FROM t WHERE id = ?", [
      { value: "42", type: "Integer" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("42"), `expected 42 in: ${out.text}`);
    assert.ok(!out.text.includes("'42'"), `should not be quoted: ${out.text}`);
  });

  test("replaces Long/Double param with bare number", () => {
    const seg = makeSegment("SELECT ?", [{ value: "12345", type: "Long" }]);
    assert.ok(formatSegment(seg, baseOptions).text.includes("12345"));
  });

  test("replaces Boolean param with TRUE/FALSE uppercase", () => {
    const seg = makeSegment("SELECT ?", [{ value: "true", type: "Boolean" }]);
    assert.ok(formatSegment(seg, baseOptions).text.includes("TRUE"));
  });

  test("replaces null param with NULL keyword", () => {
    const seg = makeSegment("SELECT ?", [{ value: "null", type: "null" }]);
    assert.ok(formatSegment(seg, baseOptions).text.includes("NULL"));
  });

  test("replaces Date/Timestamp with single-quoted literal", () => {
    const seg = makeSegment("SELECT ?", [
      { value: "2026-05-19 13:28:31", type: "Timestamp" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("'2026-05-19 13:28:31'"), `got: ${out.text}`);
  });

  test("respects stringQuote: double", () => {
    const seg = makeSegment("SELECT ?", [{ value: "foo", type: "String" }]);
    const opts: FormatOptions = { ...baseOptions, stringQuote: "double" };
    const out = formatSegment(seg, opts);
    assert.ok(out.text.includes('"foo"'), `got: ${out.text}`);
  });

  test("heuristic: pure digits become number when type is empty", () => {
    const seg = makeSegment("SELECT ?", [{ value: "7", type: "" }]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(/\b7\b/.test(out.text), `got: ${out.text}`);
  });

  test("heuristic: true/false become boolean when type is empty", () => {
    const seg = makeSegment("SELECT ?", [{ value: "false", type: "" }]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("FALSE"), `got: ${out.text}`);
  });

  test("output contains SQL with SELECT keyword uppercased", () => {
    const seg = makeSegment("select id from t where a = ?", [
      { value: "1", type: "String" },
    ]);
    const out = formatSegment(seg, baseOptions);
    assert.ok(out.text.includes("SELECT"), `got: ${out.text}`);
  });

  test("output starts with -- === Formatted SQL === marker and ends with -- === End ===", () => {
    const seg = makeSegment("SELECT 1", []);
    const out = formatSegment(seg, baseOptions);
    assert.ok(
      out.text.startsWith("-- === Formatted SQL ==="),
      `got: ${out.text}`,
    );
    assert.ok(
      out.text.trimEnd().endsWith("-- === End ==="),
      `got: ${out.text}`,
    );
  });
});

suite("formatSegment (placeholder mode)", () => {
  test("keeps ? in SQL and adds comment block of params", () => {
    const seg = makeSegment("SELECT ? AND ?", [
      { value: "a", type: "String" },
      { value: "1", type: "Integer" },
    ]);
    const opts: FormatOptions = { ...baseOptions, paramMode: "placeholder" };
    const out = formatSegment(seg, opts);
    assert.ok(out.text.includes("?"), `expected ? kept: ${out.text}`);
    assert.ok(
      out.text.includes("-- param[1] = 'a' (String)"),
      `got: ${out.text}`,
    );
    assert.ok(
      out.text.includes("-- param[2] = 1 (Integer)"),
      `got: ${out.text}`,
    );
  });
});

suite("formatSegments", () => {
  test("returns one FormattedSegment per input segment", () => {
    const segs = [
      makeSegment("SELECT 1", []),
      makeSegment("SELECT ?", [{ value: "x", type: "String" }]),
    ];
    const out = formatSegments(segs, baseOptions);
    assert.strictEqual(out.length, 2);
  });
});
```

- [ ] **Step 3: Run tests and confirm they FAIL**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: All `formatSegment` tests FAIL with "not implemented".

- [ ] **Step 4: Commit failing tests**

```bash
cd /Users/admin/software/Vscode/plugin
git add test/formatter.test.ts src/formatter.ts
git commit -m "test(formatter): add failing tests for SQL formatter"
```

---

## Task 6: Formatter - Implementation

**Files:**

- Modify: `src/formatter.ts`

- [ ] **Step 1: Implement the formatter**

Replace `src/formatter.ts` content with:

```ts
import {
  format as sqlFormat,
  FormatOptions as SqlFmtOptions,
} from "sql-formatter";
import { FormattedSegment, FormatOptions, Param, SqlSegment } from "./types";

const HEADER = "-- === Formatted SQL ===";
const FOOTER = "-- === End ===";

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
    linesBetweenQueries: 2,
  };

  const formattedSql = sqlFormat(sqlWithParams, sqlOpts);

  let body = formattedSql.trimEnd();
  if (!body.endsWith(";")) body += ";";

  let text = `${HEADER}\n${body}\n${FOOTER}`;

  if (options.paramMode === "placeholder" && segment.params.length > 0) {
    const paramBlock = segment.params
      .map(
        (p) =>
          `-- param[${p.index}] = ${renderParamValue(p, options)} (${p.type || "unknown"})`,
      )
      .join("\n");
    text = `${HEADER}\n${paramBlock}\n${body}\n${FOOTER}`;
  }

  return { segment, text };
}

function inlineParams(
  sql: string,
  params: Param[],
  options: FormatOptions,
): string {
  if (params.length === 0) return sql;

  let out = "";
  let i = 0;
  for (const p of params) {
    const rendered = renderParamValue(p, options);
    const idx = sql.indexOf("?", i);
    if (idx === -1) break;
    out += sql.slice(i, idx) + rendered;
    i = idx + 1;
  }
  out += sql.slice(i);
  return out;
}

function renderParamValue(p: Param, options: FormatOptions): string {
  const quote = options.stringQuote === "single" ? "'" : '"';
  const t = (p.type || "").toLowerCase();
  const v = p.value;

  if (t === "null" || v === "null") return "NULL";

  if (t === "string" || t === "date" || t === "timestamp" || t === "time") {
    return `${quote}${escape(v, quote)}${quote}`;
  }

  if (t === "boolean") {
    if (v.toLowerCase() === "true") return "TRUE";
    if (v.toLowerCase() === "false") return "FALSE";
    return v.toUpperCase();
  }

  if (
    t === "integer" ||
    t === "long" ||
    t === "short" ||
    t === "double" ||
    t === "float" ||
    t === "bigdecimal" ||
    t === "number"
  ) {
    return v;
  }

  // Heuristic inference when type is empty.
  if (t === "") {
    if (/^-?\d+(\.\d+)?$/.test(v)) return v;
    if (v.toLowerCase() === "true" || v.toLowerCase() === "false")
      return v.toUpperCase();
    if (v.toLowerCase() === "null") return "NULL";
    return `${quote}${escape(v, quote)}${quote}`;
  }

  // Fallback: treat as string.
  return `${quote}${escape(v, quote)}${quote}`;
}

function escape(value: string, quote: string): string {
  return value.replace(new RegExp(quote, "g"), quote + quote);
}
```

- [ ] **Step 2: Run tests and confirm they PASS**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: All `formatSegment` and `formatSegments` tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add src/formatter.ts
git commit -m "feat(formatter): implement SQL formatter with inline/placeholder modes"
```

---

## Task 7: Inserter - Test First

**Files:**

- Create: `test/inserter.test.ts`
- Create: `src/inserter.ts` (stub)

- [ ] **Step 1: Create stub `src/inserter.ts`**

```ts
import { FormattedSegment } from "./types";

export function buildInsertEdits(
  _documentLineCount: number,
  _segments: FormattedSegment[],
): { line: number; text: string }[] {
  return [];
}
```

- [ ] **Step 2: Add tests in `test/inserter.test.ts`**

```ts
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
  test("inserts after endLine + 1 (one blank line gap)", () => {
    const edits = buildInsertEdits(10, [makeFmt("SELECT 1", 0, 2)]);
    assert.strictEqual(edits.length, 1);
    assert.strictEqual(edits[0].line, 3);
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
      [12, 7, 2],
    );
  });

  test("text ends with newline so insertion does not concatenate with next line", () => {
    const edits = buildInsertEdits(5, [makeFmt("X", 0, 0)]);
    assert.ok(edits[0].text.endsWith("\n"));
  });
});
```

- [ ] **Step 3: Run tests and confirm they FAIL**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: 3 `buildInsertEdits` tests FAIL.

- [ ] **Step 4: Commit failing tests**

```bash
cd /Users/admin/software/Vscode/plugin
git add test/inserter.test.ts src/inserter.ts
git commit -m "test(inserter): add failing tests for insert edit builder"
```

---

## Task 8: Inserter - Implementation

**Files:**

- Modify: `src/inserter.ts`

- [ ] **Step 1: Implement the inserter**

Replace `src/inserter.ts` content with:

```ts
import { FormattedSegment } from "./types";

export interface InsertEdit {
  /** Zero-based line index to insert at (BEFORE this line). */
  line: number;
  /** Text to insert. Must end with a newline. */
  text: string;
}

/**
 * Compute insert edits for a list of formatted segments. Returns
 * edits in bottom-up order so that applying them in sequence does not
 * invalidate the line numbers of earlier edits.
 *
 * Insertion point: segment.endLine + 2 (one blank line gap after the
 * block's last line).
 */
export function buildInsertEdits(
  _documentLineCount: number,
  segments: FormattedSegment[],
): InsertEdit[] {
  const sorted = [...segments].sort(
    (a, b) => b.segment.endLine - a.segment.endLine,
  );
  return sorted.map((s) => ({
    line: s.segment.endLine + 2,
    text: s.text + "\n",
  }));
}
```

- [ ] **Step 2: Run tests and confirm they PASS**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: All `buildInsertEdits` tests PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add src/inserter.ts
git commit -m "feat(inserter): implement bottom-up insert edit builder"
```

---

## Task 9: Extension Entry & Command Wiring

**Files:**

- Create: `src/extension.ts`

- [ ] **Step 1: Create `src/extension.ts`**

```ts
import * as vscode from "vscode";
import { parseSqlLog } from "./parser";
import { formatSegments } from "./formatter";
import { buildInsertEdits } from "./inserter";
import { FormatOptions } from "./types";

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("SQL Formatter");

  context.subscriptions.push(
    vscode.commands.registerCommand("sqf.formatCurrentDocument", () =>
      runFormat(undefined),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sqf.formatSelection", () =>
      runFormat(getSelectedText()),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("sqf.previewCurrentDocument", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("请先打开文件");
        return;
      }
      const segments = parseSqlLog(editor.document.getText());
      if (segments.length === 0) {
        status("未找到 SQL 日志段");
        return;
      }
      const opts = readOptions();
      const formatted = formatSegments(segments, opts);
      import("./webviewProvider").then(({ SqlPreviewPanel }) => {
        SqlPreviewPanel.show(editor, formatted);
      });
    }),
  );
}

export function deactivate(): void {
  outputChannel?.dispose();
}

function runFormat(selectionText: string | undefined): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("请先打开文件");
    return;
  }
  if (selectionText !== undefined && selectionText.length === 0) {
    vscode.window.showWarningMessage("请先选中文本");
    return;
  }
  const text = selectionText ?? editor.document.getText();
  const segments = parseSqlLog(text);
  if (segments.length === 0) {
    status("未找到 SQL 日志段");
    return;
  }
  const opts = readOptions();
  const formatted = formatSegments(segments, opts);

  const config = vscode.workspace.getConfiguration("sqf");
  if (!config.get<boolean>("autoFormat", true)) {
    import("./webviewProvider").then(({ SqlPreviewPanel }) => {
      SqlPreviewPanel.show(editor, formatted);
    });
    return;
  }

  applyInsertions(editor, formatted);
}

function applyInsertions(
  editor: vscode.TextEditor,
  formatted: ReturnType<typeof formatSegments>,
): void {
  const edits = buildInsertEdits(editor.document.lineCount, formatted);
  const wsEdit = new vscode.WorkspaceEdit();
  for (const e of edits) {
    const pos = new vscode.Position(e.line, 0);
    wsEdit.insert(editor.document.uri, pos, e.text);
  }
  vscode.workspace.applyEdit(wsEdit);
}

function getSelectedText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  if (editor.selection.isEmpty) return "";
  return editor.document.getText(editor.selection);
}

function readOptions(): FormatOptions {
  const c = vscode.workspace.getConfiguration("sqf");
  return {
    indentSize: (c.get<number>("indentSize", 4) === 2 ? 2 : 4) as 2 | 4,
    keywordCase: c.get<FormatOptions["keywordCase"]>("keywordCase", "upper"),
    paramMode: c.get<FormatOptions["paramMode"]>("paramMode", "inline"),
    stringQuote: c.get<FormatOptions["stringQuote"]>("stringQuote", "single"),
  };
}

function status(msg: string): void {
  vscode.window.setStatusBarMessage(`$(info) ${msg}`, 5000);
}
```

- [ ] **Step 2: Build and check for errors**

Run: `cd /Users/admin/software/Vscode/plugin && npx tsc --noEmit`
Expected: No errors. (webviewProvider.ts does not exist yet — that's OK, it's dynamically imported.)

- [ ] **Step 3: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add src/extension.ts
git commit -m "feat(extension): wire commands, parser, formatter, inserter"
```

---

## Task 10: Webview Preview Panel

**Files:**

- Create: `src/webviewProvider.ts`

- [ ] **Step 1: Create `src/webviewProvider.ts`**

```ts
import * as vscode from "vscode";
import { FormattedSegment } from "./types";
import { buildInsertEdits } from "./inserter";

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
    this.panel.webview.html = this.render();
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
      SqlPreviewPanel.currentPanel.panel.reveal();
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
    if (msg.command === "insertAll") {
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
      vscode.workspace.applyEdit(wsEdit);
      this.panel.dispose();
    } else if (msg.command === "cancel") {
      this.panel.dispose();
    }
  }

  private render(): string {
    const cards = this.formatted
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
<title>SQL Formatter Preview</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  .toolbar { position: sticky; top: 0; background: var(--vscode-editor-background); padding: 8px 0; border-bottom: 1px solid var(--vscode-widget-border); }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 6px 12px; margin-right: 8px; cursor: pointer; border-radius: 2px; }
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

  private dispose(): void {
    SqlPreviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: Build and check for errors**

Run: `cd /Users/admin/software/Vscode/plugin && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run all tests**

Run: `cd /Users/admin/software/Vscode/plugin && npx vscode-test`
Expected: All tests (parser, formatter, inserter) PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add src/webviewProvider.ts
git commit -m "feat(webview): add manual preview panel with insert-all / cancel"
```

---

## Task 11: Manual Smoke Test & Docs

**Files:**

- Create: `test-fixtures/sample.log`
- Create: `README.md`

- [ ] **Step 1: Create `test-fixtures/sample.log`**

```
==>  Preparing: SELECT template.template_id templateId, template.template_name templateName FROM bbci_cust_check_in checkin LEFT JOIN bbci_rule_template template ON template.check_in_id = checkin.check_in_id AND template.tenant_id = 0 AND checkin.tenant_id = 0 WHERE checkin.check_in_id = ? AND template.business_type = '0' AND template.template_type = ?
[10.0.9.137][bzf-business-checkin-630-15342][traceId:06b57a85a51042c3aa2b53501fddfbf3][ INFO][2026-05-19 13:28:31] --[msg:ID[HXO5lNBg52JoC6of0dHdSA==] 执行：[3] ms SQL [SELECT template.template_id   templateId,               template.template_name templateName        FROM bbci_cust_check_in checkin                 LEFT JOIN bbci_rule_template template ON template.check_in_id = checkin.check_in_id        WHERE checkin.check_in_id = ?          and template.business_type = '0'          AND template.template_type = ?]] --[thread name:http-nio-15342-exec-4] --[3117125]-- SQLExecutionTraceInterceptor
==> Parameters: 004a207312d24274bd1092b8510c503a(String), 3(String)
<==    Columns: templateId, templateName
<==        Row: 12395942, 小区新加模板的测试
<==      Total: 1
```

- [ ] **Step 2: Create `README.md`**

````markdown
# SQL Formatter (sqf)

Format and inline MyBatis SQL log blocks in place.

## Usage

1. Open a file containing MyBatis SQL log output.
2. Press `Shift+Cmd+P` and run one of:
   - **SQL Formatter: Format Current Document** — formats all blocks in the file
   - **SQL Formatter: Format Selection** — formats the selected text
   - **SQL Formatter: Preview Current Document** — opens a preview Webview
3. Formatted SQL is inserted directly below each detected block, with `?` parameters replaced by literals.

## Configuration

| Setting           | Default  | Description                                          |
| ----------------- | -------- | ---------------------------------------------------- |
| `sqf.autoFormat`  | `true`   | Insert directly, or show Webview preview first       |
| `sqf.indentSize`  | `4`      | Indent size                                          |
| `sqf.keywordCase` | `upper`  | Keyword case                                         |
| `sqf.paramMode`   | `inline` | `inline` (literal) or `placeholder` (`?` + comments) |
| `sqf.stringQuote` | `single` | Quote character for string literals                  |

## Development

```bash
npm install
npm run build
npm test
```
````

To try the extension in the Extension Development Host, open this folder in VSCode and press `F5`.

````

- [ ] **Step 3: Manual verification**

Open VSCode → Open Folder → select `/Users/admin/software/Vscode/plugin` → Press F5 to launch Extension Development Host → open `test-fixtures/sample.log` → press `Shift+Cmd+P` → run "SQL Formatter: Format Current Document" → confirm formatted SQL appears below the original block with `?` replaced by `'004a207312d24274bd1092b8510c503a'` and `3`.

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add test-fixtures/sample.log README.md
git commit -m "docs: add README and sample log fixture"
````

---

## Task 12: Create CHANGELOG

**Files:**

- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

## 0.1.0 (2026-06-21)

### Added

- Initial release
- Detect MyBatis-style SQL log blocks (Preparing/Parameters/Row)
- Format SQL with parameters inlined as literals
- Insert formatted SQL below each block in place
- Three commands: Format Document, Format Selection, Preview Document
- Webview preview panel for manual confirmation
- Five user-configurable settings (autoFormat, indentSize, keywordCase, paramMode, stringQuote)
```

- [ ] **Step 2: Commit**

```bash
cd /Users/admin/software/Vscode/plugin
git add CHANGELOG.md
git commit -m "docs: add CHANGELOG for 0.1.0"
```

---

## Self-Review

**Spec coverage:**

| Spec section                                                    | Task                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Goal (parse + format + insert)                                  | Tasks 3–9                                                                     |
| 3 commands                                                      | Task 9                                                                        |
| Trigger via Shift+Cmd+P                                         | Task 9 (commands registered in package.json, Task 1)                          |
| Default scans current file                                      | Task 9 (`formatCurrentDocument`)                                              |
| Supports selection                                              | Task 9 (`formatSelection`)                                                    |
| Multi-segment: insert below each                                | Task 8 (bottom-up) + Task 4 (parser finds all)                                |
| Param inline as literal                                         | Task 6                                                                        |
| Config: autoFormat/indentSize/keywordCase/paramMode/stringQuote | Task 1 (package.json) + Task 6 (consumed)                                     |
| Webview manual mode                                             | Task 10                                                                       |
| Error handling (no file, no selection, no match)                | Task 9                                                                        |
| Tests ≥ 80%                                                     | Tasks 3/4 (parser), 5/6 (formatter), 7/8 (inserter)                           |
| YAGNI boundaries                                                | Multi-dialect, syntax highlighting explicitly excluded in spec, plan respects |

**Placeholder scan:** No "TBD"/"TODO"/"implement later" in plan steps. Each code step has the full file content.

**Type consistency:** `Param`, `SqlSegment`, `FormatOptions`, `FormattedSegment` defined in Task 2; used identically in Tasks 3–10. `buildInsertEdits` signature stable across Tasks 7–10.

---

## Plan Complete

Plan saved to `docs/superpowers/plans/2026-06-21-sql-formatter.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
