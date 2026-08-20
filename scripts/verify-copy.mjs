import fs from 'node:fs';
import path from 'node:path';
import { hasExtensionArtifacts } from './html-artifacts.mjs';
import { root } from './project-root.mjs';

const sourceDir = path.join(root, 'myhtml');
const copyDir = path.join(root, 'leave-system-copy');

const pages = [
  { file: '步骤1登录.html', title: '登录', next: '步骤2进入首页.html' },
  { file: '步骤2进入首页.html', title: '首页', next: '步骤3点击进出申请进去外出申请.html' },
  { file: '步骤3点击进出申请进去外出申请.html', title: '外出申请', next: '步骤4点击外出申请进入申请页.html' },
  { file: '步骤4点击外出申请进入申请页.html', title: '申请', next: null },
  { file: '步骤3-5进入我的申请查看申请记录等.html', title: '我的申请', next: null },
];

const generatedResourceAssets = new Set([
  'iconfont-68600351.woff2',
  'iconfont-565904e9.woff',
  'iconfont-b1e08be4.ttf',
  'login_bg2-b3af8c34.jpg',
  'uniicons-89ed7d6d.ttf',
]);

const aliasFiles = new Set(['index.html', 'home.html', 'out.html', 'apply.html', 'records.html']);

const failures = [];

function fail(message) {
  failures.push(message);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function fileSize(filePath) {
  return fs.statSync(filePath).size;
}

function normalizedRelative(filePath, baseDir) {
  return path.relative(baseDir, filePath).replaceAll(path.sep, '/');
}

function activeHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*type=["']application\/x-copy-disabled["'][\s\S]*?<\/script>/gi, '');
}

function refsFromMarkup(markup) {
  const refs = [];
  const attrPattern = /(?<![-\w])(?:href|src)=["']([^"']+)["']/g;
  const styleUrlPattern = /url\((?:"([^"]+)"|'([^']+)'|([^)'"]+))\)/g;

  for (const match of markup.matchAll(attrPattern)) {
    refs.push(match[1]);
  }

  for (const match of markup.matchAll(styleUrlPattern)) {
    refs.push(match[1] || match[2] || match[3]);
  }

  return refs;
}

function localRefs(html) {
  return refsFromMarkup(activeHtml(html)).filter((ref) => {
    const clean = ref.trim();
    return clean.startsWith('./') || clean.startsWith('../');
  });
}

function activeExternalRefs(html) {
  return refsFromMarkup(activeHtml(html)).filter((ref) => /^https?:\/\//i.test(ref.trim()));
}

function cssExternalRefs(css) {
  const styleUrlPattern = /url\((?:"([^"]+)"|'([^']+)'|([^)'"]+))\)/g;
  return [...css.matchAll(styleUrlPattern)]
    .map((match) => match[1] || match[2] || match[3])
    .filter((ref) => /^https?:\/\//i.test(ref.trim()));
}

function assertNoExtensionArtifacts(dir, label) {
  if (!exists(dir)) {
    return;
  }

  for (const filePath of walk(dir).filter((file) => file.endsWith('.html'))) {
    const html = read(filePath);
    if (hasExtensionArtifacts(html)) {
      const relative = normalizedRelative(filePath, dir);
      fail(`Immersive Translate artifact remains in ${label}: ${relative}`);
    }
  }
}

function routeBlock(nav, pageName) {
  const marker = `'${pageName}': [`;
  const start = nav.indexOf(marker);
  if (start === -1) {
    return '';
  }

  const end = nav.indexOf('\n    ]', start);
  return end === -1 ? nav.slice(start) : nav.slice(start, end);
}

if (!exists(sourceDir)) {
  fail(`Missing source directory: ${sourceDir}`);
}

if (!exists(copyDir)) {
  fail(`Missing generated copy directory: ${copyDir}`);
}

assertNoExtensionArtifacts(sourceDir, 'source page');
assertNoExtensionArtifacts(copyDir, 'static page');

if (exists(sourceDir) && exists(copyDir)) {
  const sourceFiles = walk(sourceDir).map((file) => normalizedRelative(file, sourceDir)).sort();
  const copiedFiles = walk(copyDir)
    .map((file) => normalizedRelative(file, copyDir))
    .filter((file) => file !== 'copy-navigation.js' && !aliasFiles.has(file) && !file.startsWith('_external/'))
    .sort();

  const sourceSet = new Set(sourceFiles);
  const copiedSet = new Set(copiedFiles);

  for (const file of sourceFiles) {
    if (!copiedSet.has(file)) {
      fail(`Missing copied source file: ${file}`);
      continue;
    }

    const sourcePath = path.join(sourceDir, file);
    const copiedPath = path.join(copyDir, file);
    const isLocalizedCss = file.endsWith('/index-0bfeb6e0.css') || file.endsWith('/u-icon-0c4bc082.css');
    if (!file.endsWith('.html') && !isLocalizedCss && fileSize(sourcePath) !== fileSize(copiedPath)) {
      fail(`Copied asset size differs: ${file}`);
    }
  }

  for (const file of copiedFiles) {
    const fileName = file.split('/').pop();
    if (!sourceSet.has(file) && !generatedResourceAssets.has(fileName)) {
      fail(`Unexpected generated source clone file: ${file}`);
    }
  }

  for (const page of pages) {
    const filePath = path.join(copyDir, page.file);
    const resourceDir = path.join(copyDir, page.file.replace(/\.html$/u, '_files'));

    if (!exists(filePath)) {
      fail(`Missing page: ${page.file}`);
      continue;
    }

    if (!exists(resourceDir)) {
      fail(`Missing resource folder for page: ${page.file}`);
    }

    const html = read(filePath);

    if (!html.includes(`<title>${page.title}</title>`)) {
      fail(`Page title changed or missing: ${page.file}`);
    }

    if (!html.includes('copy-navigation.js')) {
      fail(`Navigation helper not included: ${page.file}`);
    }

    if (/<script\b(?![^>]*type=["']application\/x-copy-disabled["'])(?![^>]*src=["']\.\/copy-navigation\.js["'])/i.test(html)) {
      fail(`Active original script remains in page: ${page.file}`);
    }

    if (/rel=["']modulepreload["']/i.test(html)) {
      fail(`Remote modulepreload was not disabled: ${page.file}`);
    }

    for (const ref of localRefs(html)) {
      const resolved = path.resolve(path.dirname(filePath), ref);
      if (!resolved.startsWith(copyDir)) {
        fail(`Reference escapes copy directory in ${page.file}: ${ref}`);
      } else if (!exists(resolved)) {
        fail(`Broken local reference in ${page.file}: ${ref}`);
      }
    }

    for (const ref of activeExternalRefs(html)) {
      fail(`Active external page reference in ${page.file}: ${ref}`);
    }
  }

  for (const file of walk(copyDir).filter((item) => item.endsWith('.css'))) {
    const css = read(file);
    for (const ref of cssExternalRefs(css)) {
      fail(`Active external stylesheet reference in ${normalizedRelative(file, copyDir)}: ${ref}`);
    }

    for (const ref of refsFromMarkup(css).filter((item) => item.startsWith('./') || item.startsWith('../'))) {
      const resolved = path.resolve(path.dirname(file), ref.split('?')[0]);
      if (!resolved.startsWith(copyDir)) {
        fail(`Stylesheet reference escapes copy directory in ${normalizedRelative(file, copyDir)}: ${ref}`);
      } else if (!exists(resolved)) {
        fail(`Broken local stylesheet reference in ${normalizedRelative(file, copyDir)}: ${ref}`);
      }
    }
  }

  const navPath = path.join(copyDir, 'copy-navigation.js');
  if (!exists(navPath)) {
    fail('Missing navigation helper file: copy-navigation.js');
  } else {
    const nav = read(navPath);
    for (const page of pages.filter((item) => item.next)) {
      if (!nav.includes(page.file) || !nav.includes(page.next)) {
        fail(`Navigation map missing route: ${page.file} -> ${page.next}`);
      }
    }

    if (!nav.includes('步骤3-5进入我的申请查看申请记录等.html')) {
      fail('Navigation helper missing 我的申请 page route');
    }
  }

  for (const aliasFile of aliasFiles) {
    const aliasPath = path.join(copyDir, aliasFile);
    if (!exists(aliasPath)) {
      fail(`Missing alias entry page: ${aliasFile}`);
      continue;
    }

    const html = read(aliasPath);
    if (!html.includes('copy-navigation.js')) {
      fail(`Navigation helper not included in alias page: ${aliasFile}`);
    }
  }

  const nav = exists(navPath) ? read(navPath) : '';
  for (const aliasFile of ['index.html', 'home.html', 'out.html', 'apply.html', 'records.html']) {
    if (!nav.includes(aliasFile)) {
      fail(`Navigation helper missing alias route: ${aliasFile}`);
    }
  }

  const outAliasRoutes = routeBlock(nav, 'out.html');
  const outSourceRoutes = routeBlock(nav, '步骤3点击进出申请进去外出申请.html');
  for (const [label, block] of [
    ['out.html', outAliasRoutes],
    ['步骤3点击进出申请进去外出申请.html', outSourceRoutes],
  ]) {
    if (!block.includes("text: '出入申请'") || !block.includes("target: 'apply.html'")) {
      fail(`Top 出入申请 route should open apply page in ${label}`);
    }

    if (block.includes("text: '外出申请'") && block.includes("target: 'apply.html'")) {
      fail(`Bottom 外出申请 route must not open apply page in ${label}`);
    }
  }
}

if (failures.length) {
  console.error(`Verification failed (${failures.length}):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Verification passed: generated static copy is complete.');
