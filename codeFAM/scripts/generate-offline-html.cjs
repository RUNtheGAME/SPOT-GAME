const fs = require('fs');
const path = require('path');
const { rollup } = require('rollup');

function readFileOrThrow(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function resolveAssetPath(distDir, assetRef) {
  const normalized = assetRef.replace(/^\.\//, '').replace(/^\//, '');
  return path.join(distDir, normalized);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeAssetRef(assetRef) {
  return String(assetRef || '').replace(/^\.\//, '').replace(/^\//, '');
}

function patchInlineImportMetaFallback(jsText, jsRef) {
  const normalizedRef = normalizeAssetRef(jsRef);
  const jsFileName = path.basename(normalizedRef);
  if (!jsFileName) return jsText;

  const singleQuotedNeedle = `new URL('${jsFileName}', document.baseURI).href`;
  const doubleQuotedNeedle = `new URL(\"${jsFileName}\", document.baseURI).href`;
  const replacement = `new URL('${normalizedRef}', document.baseURI).href`;

  let patched = jsText.split(singleQuotedNeedle).join(replacement);
  patched = patched.split(doubleQuotedNeedle).join(replacement);

  const genericPattern = new RegExp(
    `new URL\\((['\"])${escapeRegExp(jsFileName)}\\1,\\s*document\\.baseURI\\)\\.href`,
    'g'
  );
  patched = patched.replace(genericPattern, replacement);

  return patched;
}

async function bundleEntryJavaScriptToIife(distDir, jsRef, bundleName) {
  const inputPath = resolveAssetPath(distDir, jsRef);
  const bundle = await rollup({ input: inputPath });
  const generated = await bundle.generate({
    format: 'iife',
    name: bundleName,
    inlineDynamicImports: true,
    sourcemap: false,
  });
  await bundle.close();
  const chunk = generated.output.find((item) => item.type === 'chunk');
  if (!chunk) {
    throw new Error(`Could not generate JS bundle for ${jsRef}`);
  }
  return chunk.code;
}

function extractAssetsFromEntryHtml(entryHtml) {
  const scriptMatch = entryHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/i);
  if (!scriptMatch) {
    throw new Error('Could not find module script in built HTML entry.');
  }
  const jsRef = scriptMatch[1];

  const cssRefs = [...entryHtml.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi)]
    .map((match) => match[1]);

  return {
    jsRef,
    cssRefs,
  };
}

function buildOfflineHtml({ title, cssText, jsText }) {
  return `<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
${cssText}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${jsText}
    </script>
  </body>
</html>
`;
}

function copyDistAssetsToRoot(rootDir, distDir) {
  const distAssetsPath = path.join(distDir, 'assets');
  if (!fs.existsSync(distAssetsPath)) return;

  const rootAssetsPath = path.join(rootDir, 'assets');
  fs.rmSync(rootAssetsPath, { recursive: true, force: true });
  fs.cpSync(distAssetsPath, rootAssetsPath, { recursive: true });
}

async function generateOfflineForEntry({ rootDir, distDir, entryHtmlName, offlineFileName, offlineTitle, bundleName }) {
  const distEntryPath = path.join(distDir, entryHtmlName);
  const entryHtml = readFileOrThrow(distEntryPath);
  const { jsRef, cssRefs } = extractAssetsFromEntryHtml(entryHtml);

  const bundledJsText = await bundleEntryJavaScriptToIife(distDir, jsRef, bundleName);
  const jsText = patchInlineImportMetaFallback(bundledJsText, jsRef);

  const cssText = cssRefs
    .map((cssRef) => readFileOrThrow(resolveAssetPath(distDir, cssRef)))
    .join('\n');

  const offlineHtml = buildOfflineHtml({
    title: offlineTitle,
    cssText,
    jsText,
  });

  const rootOfflinePath = path.join(rootDir, offlineFileName);
  const distOfflinePath = path.join(distDir, offlineFileName);
  fs.writeFileSync(rootOfflinePath, offlineHtml, 'utf8');
  fs.writeFileSync(distOfflinePath, offlineHtml, 'utf8');
  fs.writeFileSync(distEntryPath, offlineHtml, 'utf8');

  return {
    entryHtmlName,
    offlineFileName,
    jsRef,
    cssRefs,
  };
}

async function generateOfflineHtml() {
  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');

  const generated = [
    await generateOfflineForEntry({
      rootDir,
      distDir,
      entryHtmlName: 'index.html',
      offlineFileName: 'offline.html',
      offlineTitle: 'codeTAL2 Offline',
      bundleName: 'CodeTalMainOffline',
    }),
    await generateOfflineForEntry({
      rootDir,
      distDir,
      entryHtmlName: 'index-test.html',
      offlineFileName: 'offline-test.html',
      offlineTitle: 'codeTAL2 index-test Offline',
      bundleName: 'CodeTalIndexTestOffline',
    }),
  ];

  copyDistAssetsToRoot(rootDir, distDir);

  generated.forEach((entry) => {
    console.log(
      `Generated ${entry.offlineFileName} from ${entry.entryHtmlName} using ${entry.jsRef} and ${entry.cssRefs.join(', ')}`
    );
  });
}

generateOfflineHtml().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
