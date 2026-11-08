import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const root = process.env.TS_SOURCE_ROOT
  ? pathToFileURL(`${process.env.TS_SOURCE_ROOT.replace(/\/?$/, '/')}`)
  : new URL('../src/', import.meta.url);
const scanAllJavaScript = Boolean(process.env.TS_SOURCE_ROOT);
const failures = [];
const MAX_EXPECTED_ERRORS = 8;
let expectedErrorCount = 0;
let explicitAnyCount = 0;
const FORBIDDEN_RUNTIME_PATTERNS = [
  [/\bnew\s+Function\b/, 'dynamic Function compilation is forbidden in application TypeScript'],
  [/\beval\s*\(/, 'eval is forbidden in application TypeScript'],
  [/\batob\s*\(/, 'encoded runtime payloads are forbidden in application TypeScript'],
  [/\bbtoa\s*\(/, 'encoded runtime payloads are forbidden in application TypeScript'],
  [/\bRUNTIME_SOURCE\b/, 'encoded runtime source payloads are forbidden in application TypeScript'],
  [/\b(?:base64|encodedRuntime|generatedRuntime)\b/i, 'encoded/generated runtime payloads are forbidden in application TypeScript'],
];

function isAny(type) {
  return (type.flags & ts.TypeFlags.Any) !== 0;
}

async function findTypeFiles(url) {
  const files = [];
  const entries = await readdir(url, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
    if (entry.isDirectory()) {
      files.push(...await findTypeFiles(child));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(fileURLToPath(child));
    }
  }
  return files;
}

async function rejectIndirectAnyTypes() {
  const files = await findTypeFiles(root);
  if (!files.length) return;
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    types: ['node'],
  });
  const checker = program.getTypeChecker();
  for (const diagnostic of program.getSemanticDiagnostics()) {
    if (!diagnostic.file || !diagnostic.file.fileName.startsWith(fileURLToPath(root))) continue;
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    failures.push(`${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}: TypeScript diagnostic: ${message}`);
  }
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || !sourceFile.fileName.startsWith(fileURLToPath(root))) continue;
    const visitNode = node => {
      if (node.type && ts.isTypeNode(node.type)) {
        const type = checker.getTypeAtLocation(node.type);
        if (isAny(type) && node.type.kind !== ts.SyntaxKind.AnyKeyword) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          failures.push(`${sourceFile.fileName}:${position.line + 1}: type annotation resolves to any; indirect any aliases are forbidden`);
        }
      }
      if (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.kind === ts.SyntaxKind.Identifier &&
          node.expression.expression.text === 'JSON' &&
          node.expression.name.text === 'parse' &&
          isAny(checker.getTypeAtLocation(node))) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        failures.push(`${sourceFile.fileName}:${position.line + 1}: inferred any from JSON.parse is forbidden; validate the parsed boundary`);
      }
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const receiver = node.expression;
        if (isAny(checker.getTypeAtLocation(receiver))) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          failures.push(`${sourceFile.fileName}:${position.line + 1}: unchecked property access on an inferred any value is forbidden`);
        }
      }
      ts.forEachChild(node, visitNode);
    };
    visitNode(sourceFile);
  }
}

async function visit(url) {
  const entries = await readdir(url, { withFileTypes: true });
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, url);
    if (entry.isDirectory()) {
      await visit(child);
      continue;
    }
    if (!entry.name.endsWith('.ts') && !(scanAllJavaScript || url.pathname.includes('/domain/'))) continue;
    const source = await readFile(child, 'utf8');
    if (entry.name.endsWith('.js')) {
      failures.push(`${child.pathname}: unchecked application JavaScript is forbidden; move the implementation into a checked TypeScript domain module`);
      continue;
    }
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      for (const [pattern, message] of FORBIDDEN_RUNTIME_PATTERNS) {
        if (pattern.test(line)) {
          failures.push(`${child.pathname}:${index + 1}: ${message}`);
        }
      }
      if (/@ts-nocheck\b/.test(line)) {
        failures.push(`${child.pathname}:${index + 1}: file-wide @ts-nocheck is forbidden`);
      }
      if (/@ts-ignore\b/.test(line)) {
        failures.push(`${child.pathname}:${index + 1}: @ts-ignore is forbidden; type the boundary or use a narrow @ts-expect-error`);
      }
      if (/@ts-expect-error\b/.test(line)) {
        expectedErrorCount += 1;
        if (!/@ts-expect-error\s+--\s+\S/.test(line)) {
          failures.push(`${child.pathname}:${index + 1}: @ts-expect-error requires a reason`);
        }
      }
      if (/(?:\s*:\s*any\b|\bas\s+any\b|<any>|\bArray\s*<\s*any\s*>)/.test(line)) {
        explicitAnyCount += 1;
        failures.push(`${child.pathname}:${index + 1}: explicit any is forbidden; use a domain type or unknown with narrowing`);
      }
    });
  }
}

await visit(root);
await rejectIndirectAnyTypes();

if (expectedErrorCount > MAX_EXPECTED_ERRORS) {
  failures.push(`src: ${expectedErrorCount} @ts-expect-error directives exceed the limit of ${MAX_EXPECTED_ERRORS}`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`TypeScript boundary checks passed (${explicitAnyCount} explicit any values).`);
}
