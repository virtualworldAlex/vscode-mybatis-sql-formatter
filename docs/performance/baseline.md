# Performance Baseline

> Frozen performance measurements for the MyBatis SQL Formatter extension.
> Generated: 2026-06-22 from `out/` artifacts built by `tsc -p ./`.

## Methodology

- Node v24.13.0, no warmup cache
- 20-iter warmup + min/avg over multiple trials (min reflects best-case
  in-cache behavior; avg is what users typically see)
- `Date.now()` (1 ms precision) — sufficient for 100+ ms timings
- Each input block is a realistic MyBatis log entry (~5 lines, 230 B):

  ```
  ==>  Preparing: SELECT u.id, u.name, u.email FROM users u WHERE u.status = ? AND u.department_id = ?
  ==> Parameters: 1(String), 42(Integer)
  <==  Columns: id, name, email
  <==        Row: 1, Alice, alice@example.com
  <==      Total: 1
  ```

## Results

All times in **milliseconds**. `min` = best of N trials, `avg` = mean.

| Blocks | Input (KB) | parse min/avg | format min/avg | insert min/avg | end-to-end min/avg |
| -----: | ---------: | ------------: | -------------: | -------------: | -----------------: |
|     10 |        2.3 |      0 / 0.04 |       2 / 2.13 |          0 / 0 |           1 / 2.05 |
|    100 |       22.7 |      0 / 0.24 |     16 / 19.00 |          0 / 0 |         16 / 16.35 |
|    500 |      113.3 |      1 / 1.10 |     77 / 90.93 |       0 / 0.02 |         79 / 97.85 |
|   1000 |      226.6 |      2 / 2.80 |   157 / 196.53 |       0 / 0.03 |       193 / 209.75 |
|   5000 |     1132.8 |    12 / 13.98 |  842 / 1277.20 |       0 / 0.15 |      824 / 1003.40 |

## Analysis

### Where time goes

| Stage            | Share of end-to-end |              Bottleneck?              |
| ---------------- | ------------------: | :-----------------------------------: |
| parseSqlLog      |               ~1-2% | no — already O(n), 1000 blocks in 2ms |
| formatSegments   |             ~98-99% | **yes** — sql-formatter library cost  |
| buildInsertEdits |               <0.1% | no — O(n log n), sub-ms even at 5000  |

### Complexity

- `parseSqlLog`: **O(n) linear**. Doubling blocks doubles time.
- `formatSegments`: **O(n) linear** but with a large constant. Doubling
  blocks from 1000 to 2000 would project ~310ms.
- `buildInsertEdits`: O(n log n) due to the sort, but n ≤ 5000 makes
  this trivial.

### User-facing thresholds

| File size | Blocks (approx) | End-to-end time | User experience              |
| --------- | --------------: | --------------: | ---------------------------- |
| < 50 KB   |           < 200 |         < 30 ms | Imperceptible (sub-frame)    |
| 50-500 KB |        200-2000 |       30-300 ms | Noticeable but smooth        |
| > 1 MB    |          > 4000 |        > 800 ms | Visible jank; spinner needed |

The 800 ms threshold for > 1 MB files is the boundary where a
**progress indicator** becomes mandatory.

## Optimization Opportunities

### Already at theoretical limit (don't bother)

- `parseSqlLog` — 1000 blocks in 2 ms; the linear regex scan is at the
  floor for a JS implementation
- `buildInsertEdits` — sub-millisecond for realistic input sizes

### Real bottlenecks (would require architectural change)

| Optimization                                          |                          Estimated gain |                                            Cost |               Recommended?               |
| ----------------------------------------------------- | --------------------------------------: | ----------------------------------------------: | :--------------------------------------: |
| Move `formatSegments` into a Web Worker               |      Main thread 99% idle during format | Worker setup + message passing + bundler config |        **Yes** for files > 500 KB        |
| Cache results by file content hash                    |        Repeat calls go from 200ms → 0ms |       Invalidation on `onDidChangeTextDocument` | **Yes** for users who re-run the command |
| Stream results to the Webview (chunked rendering)     | 1000-block preview: -300 ms first paint |                          Webview HTML streaming |     Only if preview is the slow path     |
| Replace `sql-formatter` with a faster MySQL formatter |              1000 blocks: 157ms → ~50ms |                     Maintain custom SQL grammar |  Last resort; format-quality trade-off   |

### Already-declined optimizations

- **Flattening parser's nested `while` loops**: the inner loop only
  matches at most a few lines (Columns/Row/Total) per Parameters
  match. Empirically the outer pass is already O(n) with negligible
  constant factor.
- **esbuild bundling**: would shrink `.vsix` from 355 KB to ~281 KB
  and may save 50-200 ms on cold start, but adds a bundler dependency
  and config for marginal gain on a 5-file codebase.
- **Skip-blank-lines micro-optimization**: the parser already does
  `i++` per non-match line; skipping consecutive blanks in one step
  saves microseconds, not milliseconds.

## Reproducing

```bash
# 1. Build artifacts
npm run build

# 2. Run the benchmark
node -e "
const { parseSqlLog } = require('./out/parser');
const { formatSegments } = require('./out/formatter');
const { buildInsertEdits } = require('./out/inserter');

const block = [
  '==>  Preparing: SELECT u.id, u.name, u.email FROM users u WHERE u.status = ? AND u.department_id = ?',
  '==> Parameters: 1(String), 42(Integer)',
  '<==  Columns: id, name, email',
  '<==        Row: 1, Alice, alice@example.com',
  '<==      Total: 1',
].join('\n');

for (const n of [100, 1000]) {
  const input = Array(n).fill(0).map(() => block).join('\n');
  let min = Infinity;
  for (let i = 0; i < 30; i++) {
    const t0 = Date.now();
    parseSqlLog(input);
    const ms = Date.now() - t0;
    if (ms < min) min = ms;
  }
  console.log('parse', n, 'blocks:', min, 'ms');
}
"
```
