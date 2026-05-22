#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const xlsx = require('xlsx');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const XLSX_PATH = path.join(PROJECT_ROOT, 'משפחת_טל.xlsx');
const GENERATED_MAP_FILE = path.join(PROJECT_ROOT, 'src', 'data', 'xlsxColumnRImageMap.generated.js');
const PUBLIC_IMAGES_DIR = path.join(PROJECT_ROOT, 'public', 'family-images');
const LOCAL_IMAGES_DIR = path.join(PROJECT_ROOT, 'family-images');

function normalizeName(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .trim();
}

function runUnzip(entry, binary = false) {
  return execFileSync('unzip', ['-p', XLSX_PATH, entry], {
    encoding: binary ? null : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 30 * 1024 * 1024,
  });
}

function parseColumnRRows(sheetXml) {
  const rows = [];
  const re = /<c r="R(\d+)"([^>]*)>/g;
  let match;
  while ((match = re.exec(sheetXml))) {
    const row = Number(match[1]);
    const attrs = match[2] || '';
    const vmMatch = attrs.match(/\bvm="(\d+)"/);
    if (!vmMatch) continue;
    rows.push({ row, vm: Number(vmMatch[1]) });
  }
  return rows;
}

function parseFutureRichValueIndexes(metadataXml) {
  const futureSection = metadataXml.match(/<futureMetadata[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/);
  if (!futureSection) return [];
  return [...futureSection[1].matchAll(/<bk>[\s\S]*?<xlrd:rvb[^>]*\bi="(\d+)"[^>]*\/>[\s\S]*?<\/bk>/g)].map((m) =>
    Number(m[1])
  );
}

function parseValueMetadataIndexes(metadataXml) {
  const valueSection = metadataXml.match(/<valueMetadata[^>]*>([\s\S]*?)<\/valueMetadata>/);
  if (!valueSection) return [];
  return [...valueSection[1].matchAll(/<bk>[\s\S]*?<rc[^>]*\bt="1"[^>]*\bv="(\d+)"[^>]*\/>[\s\S]*?<\/bk>/g)].map((m) =>
    Number(m[1])
  );
}

function parseRichValueLocalImageIds(richValueXml) {
  const blocks = [...richValueXml.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)];
  return blocks.map((match) => {
    const firstValue = match[1].match(/<v>(\d+)<\/v>/);
    return firstValue ? Number(firstValue[1]) : null;
  });
}

function parseRelIdsInOrder(richValueRelXml) {
  return [...richValueRelXml.matchAll(/<rel\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
}

function parseRelTargets(richValueRelRelsXml) {
  const map = new Map();
  for (const match of richValueRelRelsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

function imageFileNameForRow(row, name, sourceRelativePath) {
  const ext = path.extname(sourceRelativePath) || '.jpg';
  const safeName = normalizeName(name)
    .replace(/[^A-Za-z0-9\u0590-\u05FF]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return `${safeName || 'member'}_row_${row}${ext}`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolveRichValueIndexFromVm(vm, valueMetadataIndexes, futureRichValueIndexes) {
  if (!Number.isFinite(vm) || vm <= 0) return null;
  const valueMetadataIndex = vm - 1;
  const futureMetadataIndex = valueMetadataIndexes[valueMetadataIndex];
  if (!Number.isFinite(futureMetadataIndex)) return null;
  const richValueIndex = futureRichValueIndexes[futureMetadataIndex];
  if (!Number.isFinite(richValueIndex)) return null;
  return richValueIndex;
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`XLSX file not found: ${XLSX_PATH}`);
  }

  const workbook = xlsx.readFile(XLSX_PATH, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const sheetXml = runUnzip('xl/worksheets/sheet1.xml');
  const metadataXml = runUnzip('xl/metadata.xml');
  const richValueXml = runUnzip('xl/richData/rdrichvalue.xml');
  const richValueRelXml = runUnzip('xl/richData/richValueRel.xml');
  const richValueRelRelsXml = runUnzip('xl/richData/_rels/richValueRel.xml.rels');

  const columnRRows = parseColumnRRows(sheetXml);
  const futureRichValueIndexes = parseFutureRichValueIndexes(metadataXml);
  const valueMetadataIndexes = parseValueMetadataIndexes(metadataXml);
  const richValueLocalImageIds = parseRichValueLocalImageIds(richValueXml);
  const relIdsInOrder = parseRelIdsInOrder(richValueRelXml);
  const relTargetsById = parseRelTargets(richValueRelRelsXml);

  ensureDir(PUBLIC_IMAGES_DIR);
  ensureDir(LOCAL_IMAGES_DIR);

  const imageMapByName = {};
  const rowsWithImages = [];

  for (const entry of columnRRows) {
    const row = entry.row;
    const vm = entry.vm;
    const name = normalizeName(sheet[`A${row}`]?.v);
    if (!name) continue;

    const richValueIndex = resolveRichValueIndexFromVm(vm, valueMetadataIndexes, futureRichValueIndexes);
    if (!Number.isFinite(richValueIndex)) continue;

    const localImageIdentifier = richValueLocalImageIds[richValueIndex];
    if (!Number.isFinite(localImageIdentifier)) continue;

    const relId = relIdsInOrder[localImageIdentifier];
    if (!relId) continue;

    const targetRelative = relTargetsById.get(relId);
    if (!targetRelative) continue;

    const zipEntry = path.posix.join('xl', 'richData', targetRelative).replace(/\\/g, '/');
    const imageBuffer = runUnzip(zipEntry, true);

    const fileName = imageFileNameForRow(row, name, targetRelative);
    const publicTarget = path.join(PUBLIC_IMAGES_DIR, fileName);
    const localTarget = path.join(LOCAL_IMAGES_DIR, fileName);

    fs.writeFileSync(publicTarget, imageBuffer);
    fs.writeFileSync(localTarget, imageBuffer);

    imageMapByName[name] = `/family-images/${fileName}`;
    rowsWithImages.push({ row, name, vm, relId, fileName });
  }

  const generatedFile = `// Auto-generated from משפחת_טל.xlsx column R. Do not edit manually.\nexport const XLSX_COLUMN_R_IMAGE_BY_NAME = ${JSON.stringify(
    imageMapByName,
    null,
    2
  )};\n`;
  fs.writeFileSync(GENERATED_MAP_FILE, generatedFile, 'utf8');

  console.log(`Synced ${rowsWithImages.length} image(s) from column R.`);
  rowsWithImages.forEach((item) => {
    console.log(`- row ${item.row}: ${item.name} -> ${item.fileName}`);
  });
}

main();

