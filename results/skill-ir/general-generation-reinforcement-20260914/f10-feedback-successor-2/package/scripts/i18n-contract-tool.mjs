#!/usr/bin/env node
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';

function usage() {
  console.log(`Usage:
  node scripts/i18n-contract-tool.mjs finalize --contract <file> --root <dir>

finalize extracts confirmed data-i18n-key values from declared React sources,
checks t() calls and locale key parity, writes the contract-declared JSON report,
and validates its closed output ABI.`);
}

function fail(message) {
  console.error(JSON.stringify({ status: 'error', error: message }));
  process.exit(1);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const command = argv[0];
  const values = {};
  for (let i = 1; i < argv.length; i += 2) {
    const option = argv[i];
    const value = argv[i + 1];
    if (!option?.startsWith('--') || value === undefined) fail(`Invalid argument near ${option ?? '<end>'}`);
    values[option.slice(2)] = value;
  }
  return { command, ...values };
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read valid JSON from ${file}: ${error.message}`);
  }
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function requireFile(file) {
  if (!(await isFile(file))) throw new Error(`Required file is missing: ${file}`);
}

async function findByRelativeSuffix(directory, relative, matches = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await findByRelativeSuffix(candidate, relative, matches);
    } else if (entry.isFile()) {
      const normalized = candidate.split(path.sep).join('/');
      if (normalized.endsWith(`/${relative.split(path.sep).join('/')}`)) matches.push(candidate);
    }
  }
  return matches;
}

async function resolveDeclaredInput(root, relative) {
  const direct = path.resolve(root, relative);
  if (await isFile(direct)) return direct;
  const matches = await findByRelativeSuffix(root, relative);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Required file is ambiguous outside the project root: ${relative}`);
  throw new Error(`Required file is missing: ${direct}`);
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicates`);
}

function validateValue(value, schema, locator) {
  if (value === null) {
    if (!schema.nullable) throw new Error(`${locator} must not be null`);
    return;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') throw new Error(`${locator} must be a string`);
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${locator} is not an allowed value`);
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`${locator} must be an array`);
    if (schema.uniqueItems) unique(value, locator);
    value.forEach((item, index) => validateValue(item, schema.items, `${locator}[${index}]`));
    return;
  }
  if (schema.type === 'object') {
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${locator} must be an object`);
    const fields = schema.fields ?? {};
    for (const [name, definition] of Object.entries(fields)) {
      if (definition.required && !(name in value)) throw new Error(`${locator}.${name} is required`);
      if (name in value) validateValue(value[name], definition.schema, `${locator}.${name}`);
    }
    if (schema.additionalProperties === false) {
      const extra = Object.keys(value).filter((name) => !(name in fields));
      if (extra.length) throw new Error(`${locator} has unexpected fields: ${extra.join(', ')}`);
    }
    return;
  }
  throw new Error(`Unsupported schema type at ${locator}: ${schema.type}`);
}

function validateClosedObject(value, abi) {
  const fields = abi.fields ?? {};
  for (const [name, definition] of Object.entries(fields)) {
    if (definition.required && !(name in value)) throw new Error(`report.${name} is required`);
    if (name in value) validateValue(value[name], definition.schema, `report.${name}`);
  }
  if (abi.additionalProperties === false) {
    const extra = Object.keys(value).filter((name) => !(name in fields));
    if (extra.length) throw new Error(`Report has unexpected fields: ${extra.join(', ')}`);
  }
}

function compactArray(values) {
  return `[${values.map((value) => JSON.stringify(value)).join(', ')}]`;
}

function serializeReport(report) {
  const missingEntries = Object.entries(report.missingKeys);
  const missingLines = missingEntries.map(([locale, keys], index) =>
    `    ${JSON.stringify(locale)}: ${compactArray(keys)}${index + 1 < missingEntries.length ? ',' : ''}`
  );
  return [
    '{',
    `  "framework": ${JSON.stringify(report.framework)},`,
    `  "scannedFiles": ${compactArray(report.scannedFiles)},`,
    `  "extractedKeys": ${compactArray(report.extractedKeys)},`,
    '  "missingKeys": {',
    ...missingLines,
    '  }',
    '}',
    ''
  ].join('\n');
}

function extractConfirmedKeys(source) {
  const keys = [];
  const marker = /<([A-Za-z][\w.:-]*)([^>]*\sdata-i18n-key\s*=\s*(["'])([^"']+)\3[^>]*)>/g;
  for (const match of source.matchAll(marker)) {
    const key = match[4];
    if (!key.split('.').every(Boolean) || !key.includes('.')) throw new Error(`Invalid data-i18n-key: ${key}`);
    keys.push(key);
  }
  return keys;
}

function hasTranslationCall(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\bt\\s*\\(\\s*(["'])${escaped}\\1(?:\\s*,|\\s*\\))`).test(source);
}

async function finalize(contractPath, root) {
  const contract = await readJson(contractPath);
  if (contract.schemaVersion !== 'skill-ir-i18n-helper-public-contract/v2' || contract.framework !== 'react-i18next') {
    throw new Error('This command supports only the public React react-i18next v2 contract');
  }
  if (!contract.report?.path || !contract.outputAbi?.fields) throw new Error('Contract lacks report path or output ABI');

  const scannedFiles = contract.allowedModifiedFiles ?? [];
  if (!scannedFiles.length) throw new Error('Contract declares no source files to scan');
  const extractedKeys = [];
  for (const relative of scannedFiles) {
    const file = await resolveDeclaredInput(root, relative);
    const source = await readFile(file, 'utf8');
    const keys = extractConfirmedKeys(source);
    for (const key of keys) {
      if (!hasTranslationCall(source, key)) throw new Error(`${relative} lacks t() call for ${key}`);
      extractedKeys.push(key);
    }
  }
  unique(extractedKeys, 'extractedKeys');

  const localeNames = Object.keys(contract.outputAbi.fields.missingKeys.schema.fields ?? {});
  const localeFiles = new Map();
  for (const relative of contract.requiredNewFiles ?? []) {
    const base = path.basename(relative, '.json');
    if (relative.endsWith('.json') && localeNames.includes(base)) localeFiles.set(base, relative);
  }
  const missingKeys = {};
  for (const locale of localeNames) {
    const relative = localeFiles.get(locale);
    if (!relative) throw new Error(`No declared JSON locale file maps to ${locale}`);
    const localeData = await readJson(await resolveDeclaredInput(root, relative));
    if (typeof localeData !== 'object' || localeData === null || Array.isArray(localeData)) throw new Error(`${relative} must contain a JSON object`);
    const localeKeys = Object.keys(localeData);
    const extra = localeKeys.filter((key) => !extractedKeys.includes(key));
    if (extra.length) throw new Error(`${relative} has keys not extracted from confirmed source: ${extra.join(', ')}`);
    missingKeys[locale] = extractedKeys.filter((key) => !(key in localeData));
  }

  for (const relative of contract.requiredNewFiles ?? []) {
    if (relative !== contract.report.path) await resolveDeclaredInput(root, relative);
  }
  const report = { framework: contract.framework, scannedFiles, extractedKeys, missingKeys };
  validateClosedObject(report, contract.outputAbi);
  const reportPath = path.resolve(root, contract.report.path);
  await writeFile(reportPath, serializeReport(report), 'utf8');

  console.log(JSON.stringify({
    status: 'ok',
    report: path.relative(process.cwd(), reportPath) || contract.report.path,
    scannedFiles: scannedFiles.length,
    extractedKeys: extractedKeys.length,
    missingByLocale: Object.fromEntries(localeNames.map((locale) => [locale, missingKeys[locale].length])),
    nextStep: 'Review translation meaning, interpolation, framework wiring, and protected-file preservation.'
  }));
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}
if (args.command !== 'finalize' || !args.contract || !args.root) {
  usage();
  process.exit(2);
}
finalize(path.resolve(args.contract), path.resolve(args.root)).catch((error) => fail(error.message));
