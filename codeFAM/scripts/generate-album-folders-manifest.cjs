#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ROOT_DIR_NAMES = ['album', 'albums'];
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'data', 'albumFolders.generated.js');

function normalizeFolderName(name) {
  const clean = String(name || '').trim();
  return clean || String(name || 'ללא שם');
}

function collectFoldersFromRoot(rootName) {
  const rootPath = path.join(PROJECT_ROOT, rootName);
  if (!fs.existsSync(rootPath)) return [];
  if (!fs.statSync(rootPath).isDirectory()) return [];

  const folders = fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folderPath = path.join(rootPath, entry.name);
      const imageCount = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((item) => item.isFile() && IMAGE_EXT_RE.test(item.name)).length;

      return {
        root: rootName,
        name: normalizeFolderName(entry.name),
        count: imageCount,
      };
    });

  return folders;
}

function main() {
  const byName = new Map();

  ROOT_DIR_NAMES.forEach((rootName) => {
    collectFoldersFromRoot(rootName).forEach((folder) => {
      const existing = byName.get(folder.name) || { name: folder.name, count: 0 };
      existing.count += folder.count;
      byName.set(folder.name, existing);
    });
  });

  const manifest = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const output = `// Auto-generated from local album/albums folders. Do not edit manually.\nexport const ALBUM_FOLDERS_MANIFEST = ${JSON.stringify(
    manifest,
    null,
    2
  )};\n`;

  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

  console.log(`Generated album folder manifest with ${manifest.length} folder(s).`);
  manifest.forEach((item) => {
    console.log(`- ${item.name}: ${item.count}`);
  });
}

main();
