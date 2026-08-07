import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const configPath = path.join(root, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));

const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const failures = new Set();

function canBeNumber(type) {
    if (type.isUnion()) return type.types.some(canBeNumber);
    return (type.flags & ts.TypeFlags.NumberLike) !== 0;
}

function location(source, node) {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    return `${path.relative(root, source.fileName)}:${start.line + 1}`;
}

function report(source, node, message) {
    failures.add(`${location(source, node)} ${message}`);
}

function inspectRenderedExpression(source, expression) {
    // Generic React slots may legally carry any ReactNode. Their call sites,
    // rather than the layout shell, own number formatting.
    if (ts.isIdentifier(expression) && expression.text === "children") return;
    if (canBeNumber(checker.getTypeAtLocation(expression))) {
        report(source, expression, "renders a number directly; wrap it in formatNumber(...)");
    }

    function inspect(node) {
        if (ts.isTemplateSpan(node) && canBeNumber(checker.getTypeAtLocation(node.expression))) {
            report(source, node.expression, "interpolates a raw number; wrap it in formatNumber(...)");
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            const result = checker.getTypeAtLocation(node);
            if (!canBeNumber(result)) {
                for (const operand of [node.left, node.right]) {
                    if (canBeNumber(checker.getTypeAtLocation(operand))) {
                        report(source, operand, "concatenates a raw number; wrap it in formatNumber(...)");
                    }
                }
            }
        }
        ts.forEachChild(node, inspect);
    }

    inspect(expression);
}

for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(path.join(root, "src")) || !source.fileName.endsWith(".tsx")) continue;
    // Development diagnostics intentionally expose raw state and telemetry.
    if (source.fileName.startsWith(path.join(root, "src", "dev"))) continue;
    function visit(node) {
        if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
            inspectRenderedExpression(source, node.expression);
        }
        if (ts.isJsxText(node)) {
            const match = node.text.match(/\b\d{4,}\b/);
            if (match) report(source, node, `contains ungrouped player-facing literal ${match[0]}`);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
}

if (failures.size > 0) {
    console.error("Player-facing number formatting audit failed:\n");
    for (const failure of [...failures].sort()) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log("Player-facing number formatting audit passed.");
}
