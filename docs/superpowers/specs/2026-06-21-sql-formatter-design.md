# SQL Formatter (sqf) — 设计文档

**日期**: 2026-06-21
**作者**: Claude
**状态**: 已批准 — 待实施规划

---

## 一、目标

开发一款 VSCode 插件 `SQL Formatter (sqf)`，从 MyBatis 风格的 SQL 日志中识别 `Preparing:` / `Parameters:` 段，将 SQL 格式化并将参数**直接替换为字面量**，就地插入到当前文件该段下方。

## 二、用户场景

### 输入（当前文件或选区中可能存在的日志）

```
==>  Preparing: SELECT template.template_id templateId, template.template_name templateName FROM bbci_cust_check_in checkin LEFT JOIN bbci_rule_template template ON template.check_in_id = checkin.check_in_id AND template.tenant_id = 0 AND checkin.tenant_id = 0 WHERE checkin.check_in_id = ? AND template.business_type = '0' AND template.template_type = ?
[10.0.9.137][bzf-business-checkin-630-15342][traceId:06b57a85a51042c3aa2b53501fddfbf3][ INFO][2026-05-19 13:28:31] --[msg:ID[HXO5lNBg52JoC6of0dHdSA==] 执行：[3] ms SQL [SELECT template.template_id   templateId,               template.template_name templateName        FROM bbci_cust_check_in checkin                 LEFT JOIN bbci_rule_template template ON template.check_in_id = checkin.check_in_id        WHERE checkin.check_in_id = ?          and template.business_type = '0'          AND template.template_type = ?]] --[thread name:http-nio-15342-exec-4] --[3117125]-- SQLExecutionTraceInterceptor
==> Parameters: 004a207312d24274bd1092b8510c503a(String), 3(String)
<==    Columns: templateId, templateName
<==        Row: 12395942, 小区新加模板的测试
<==      Total: 1
```

### 输出（就地插入到该段下方，多段时每段后都插入一份）

```sql
-- === Formatted SQL ===
SELECT
    template.template_id AS templateId,
    template.template_name AS templateName
FROM bbci_cust_check_in checkin
LEFT JOIN bbci_rule_template template
    ON template.check_in_id = checkin.check_in_id
    AND template.tenant_id = 0
    AND checkin.tenant_id = 0
WHERE checkin.check_in_id = '004a207312d24274bd1092b8510c503a'
    AND template.business_type = '0'
    AND template.template_type = 3;
-- === End ===
```

参数已**直接替换为字面量**：字符串加单引号、数字原样输出，时间戳/日期加单引号。输出是可执行的 SQL，可直接复制到任何 SQL 客户端中运行。

## 三、命令 & 触发

| 命令 ID                      | 标题                                     | 行为                          |
| ---------------------------- | ---------------------------------------- | ----------------------------- |
| `sqf.formatCurrentDocument`  | SQL Formatter: 格式化当前文件所有 SQL 段 | 扫描整个活动编辑器            |
| `sqf.formatSelection`        | SQL Formatter: 格式化选区                | 仅处理选中文本                |
| `sqf.previewCurrentDocument` | SQL Formatter: 预览当前文件所有 SQL 段   | 弹 Webview 预览，手动点"插入" |

- **触发方式**：`Shift+Cmd+P` 打开命令面板 → 输入 "SQL Formatter" → 选择命令
- **作用域**：命令作用于当前活动编辑器；没有活动编辑器时提示"请先打开文件"
- **无选区时**：`formatCurrentDocument` 走全文件扫描；`formatSelection` 提示"请先选中文本"

## 四、关键设计决策

| 决策点               | 方案                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **格式化库**         | `sql-formatter` (npm)，MySQL 方言                                                                                                   |
| **解析策略**         | 正则表达式三段匹配：`Preparing:` / `Parameters:` / `Row:`                                                                           |
| **多段处理**         | 全部识别、按位置排序、每段下方分别插入一份                                                                                          |
| **插入位置**         | 紧跟该段最后一行（`Row:` / `Total:` 之后留 1 空行）                                                                                 |
| **参数展示**         | 默认 `inline`：直接替换为字面量；可切换 `placeholder`：`?` + 注释列表                                                               |
| **参数类型替换规则** | `String` → `'value'`；`Integer`/`Long`/`Double` → 原样；`Boolean` → `TRUE`/`FALSE`；`Date`/`Timestamp` → `'value'`；`null` → `NULL` |
| **缩进**             | 4 空格（可配 2/4）                                                                                                                  |
| **关键字大小写**     | 大写（可配 upper/lower/preserve）                                                                                                   |
| **自动/手动**        | 配置 `sqf.autoFormat`：true 直接插入；false 走 Webview 预览                                                                         |
| **手动预览**         | Webview 面板显示 + "插入到文件" 按钮 + "取消"                                                                                       |
| **无匹配时**         | 状态栏 5 秒提示"未找到 SQL 日志段"                                                                                                  |
| **撤销**             | 每次插入记录一次 Undo 步骤，按一次 Ctrl+Z 即可回滚全部                                                                              |

## 五、架构与模块

```
sqf/
├── package.json              # 插件清单、命令、配置项
├── tsconfig.json
├── src/
│   ├── extension.ts          # 插件入口，注册命令
│   ├── parser.ts             # SQL 日志解析（正则提取 Preparing/Parameters/Row）
│   ├── formatter.ts          # 调用 sql-formatter，生成参数替换
│   ├── inserter.ts           # 计算插入位置、生成 WorkspaceEdit
│   ├── webviewProvider.ts    # 手动模式预览面板
│   └── types.ts              # 共享类型（SqlSegment, Param 等）
├── test/
│   ├── parser.test.ts
│   ├── formatter.test.ts
│   └── inserter.test.ts
└── docs/
    └── README.md
```

### 模块职责

- **parser.ts** — 输入原始文本，输出 `SqlSegment[]`（含 startLine、endLine、sqlText、params、resultRows）
- **formatter.ts** — 输入 `SqlSegment`，输出格式化结果字符串（参数已替换为字面量）
- **inserter.ts** — 输入 `SqlSegment[]` + 格式化结果，生成 `WorkspaceEdit`，**按行号倒序插入** 避免位移错乱
- **webviewProvider.ts** — 渲染预览列表，每段一个折叠区 + "全部插入" / "单段插入" / "取消" 按钮

### 共享类型（types.ts）

```ts
interface Param {
  index: number; // 1-based
  value: string; // 原始字符串
  type: string; // 'String' | 'Integer' | 'Long' | 'Boolean' | 'Date' | 'Timestamp' | 'null' | ...
}

interface SqlSegment {
  startLine: number; // 包含 Preparing: 的起始行
  endLine: number; // 包含 Total: 的结束行
  sqlText: string; // 原始 SQL（含 ?）
  params: Param[]; // 参数列表
  result?: {
    columns?: string[];
    rows?: string[][];
    total?: number;
  };
}

interface FormatOptions {
  indentSize: 2 | 4;
  keywordCase: "upper" | "lower" | "preserve";
  paramMode: "inline" | "placeholder";
  stringQuote: "single" | "double";
}
```

## 六、配置项 (`package.json.contributes.configuration`)

| Key               | Type                          | Default  | 说明                                 |
| ----------------- | ----------------------------- | -------- | ------------------------------------ |
| `sqf.autoFormat`  | boolean                       | `true`   | true=直接插入；false=走 Webview 预览 |
| `sqf.indentSize`  | enum (2, 4)                   | `4`      | 缩进空格数                           |
| `sqf.keywordCase` | enum (upper, lower, preserve) | `upper`  | 关键字大小写                         |
| `sqf.paramMode`   | enum (inline, placeholder)    | `inline` | 参数替换模式                         |
| `sqf.stringQuote` | enum (single, double)         | `single` | 字符串包裹引号                       |

## 七、错误处理

| 场景                                | 行为                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| 未打开活动编辑器                    | `vscode.window.showWarningMessage("请先打开文件")`                   |
| 选区为空（对 `formatSelection`）    | `showWarningMessage("请先选中文本")`                                 |
| 无 `Preparing:` 段                  | 状态栏 5 秒提示"未找到 SQL 日志"                                     |
| 解析异常（`Parameters:` 行截断）    | 单段降级：仅插入格式化后的 SQL（参数保持 `?`），日志写到 Output 通道 |
| `Row:` / `Columns:` / `Total:` 缺失 | 不影响主流程，照常插入                                               |
| Webview 模式下用户取消              | 不修改文件，无副作用                                                 |

## 八、测试

- **框架**：Mocha + @vscode/test-electron
- **单元测试**：
  - `parser.test.ts`：单段/多段/缺参数/换行符/空文本
  - `formatter.test.ts`：参数替换规则（String/Integer/Boolean/null/Date）、`?` 占位
  - `inserter.test.ts`：多段倒序插入、行号偏移正确
- **覆盖率目标**：≥ 80%
- **手动验证**：插件开发宿主打开 `.log` 文件，触发三个命令各跑一次

## 九、范围控制（YAGNI）

- **不做**：复杂语法高亮、多方言切换（仅 MySQL）、参数类型推断、跨文件批处理、SQL 解析失败时的可视化错误提示
- **理由**：先满足"格式化 + 替换 + 插入"核心路径，其余按需扩展

## 十、风险与缓解

| 风险                                        | 缓解                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `sql-formatter` 对长 SQL/嵌套子查询格式化慢 | 异步 + 进度提示；超过 2000 字符的 SQL 跳过格式化（仅替换参数）          |
| 多段插入行号位移错乱                        | **倒序插入** + 单元测试覆盖                                             |
| 参数类型未在 `String/Integer/...` 中标注    | 启发式推断（纯数字 → 数字；带 `:`/`-` → 字符串；`true`/`false` → 布尔） |
| `Preparing:` 跨多行（`===` 续行）           | 贪婪匹配直到 `Parameters:` 出现为止                                     |
| 用户撤销时一次只撤销一段                    | 合并多段为单次 Undo（`edit.set()` 多次替换 + 单次 apply）               |

---

## 实施前检查清单

- [x] 需求澄清完成
- [x] 输出形式：参数直接替换为字面量
- [x] 多段处理：每段下方分别插入
- [x] 手动模式：Webview 预览
- [x] 配置项：5 项已定义
- [x] 范围控制：明确 YAGNI 边界
