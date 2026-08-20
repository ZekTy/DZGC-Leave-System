import fs from 'node:fs';
import path from 'node:path';
import { sanitizeExtensionArtifacts } from './html-artifacts.mjs';
import { root } from './project-root.mjs';

const sourceDir = path.join(root, 'myhtml');
const copyDir = path.join(root, 'leave-system-copy');

const pages = [
  '步骤1登录.html',
  '步骤2进入首页.html',
  '步骤3点击进出申请进去外出申请.html',
  '步骤4点击外出申请进入申请页.html',
  '步骤3-5进入我的申请查看申请记录等.html',
];

const aliases = new Map([
  ['步骤1登录.html', 'index.html'],
  ['步骤2进入首页.html', 'home.html'],
  ['步骤3点击进出申请进去外出申请.html', 'out.html'],
  ['步骤4点击外出申请进入申请页.html', 'apply.html'],
  ['步骤3-5进入我的申请查看申请记录等.html', 'records.html'],
]);

const cachedAssetDir = path.join(root, 'scripts', 'assets');
const sharedResourceAssets = [
  'iconfont-68600351.woff2',
  'iconfont-565904e9.woff',
  'iconfont-b1e08be4.ttf',
  'login_bg2-b3af8c34.jpg',
  'uniicons-89ed7d6d.ttf',
];

const externalDirName = '_external';
const externalAssets = [
  {
    url: 'https://cdn.dcloud.net.cn/img/shadow-grey.png',
    file: 'shadow-grey.png',
    fallbackBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  },
  {
    url: 'https://at.alicdn.com/t/font_2225171_8kdcwk4po24.ttf',
    file: 'font_2225171_8kdcwk4po24.ttf',
    fallbackPath: path.join(cachedAssetDir, 'font_2225171_8kdcwk4po24.ttf'),
  },
];

function copyFresh() {
  fs.rmSync(copyDir, { recursive: true, force: true });
  fs.mkdirSync(copyDir, { recursive: true });
  fs.cpSync(sourceDir, copyDir, { recursive: true, preserveTimestamps: true });
}

function resourceDirs() {
  return pages.map((page) => path.join(copyDir, page.replace(/\.html$/u, '_files')));
}

function copySharedResourceAssets() {
  for (const dir of resourceDirs()) {
    for (const assetName of sharedResourceAssets) {
      const sourcePath = path.join(cachedAssetDir, assetName);
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Missing cached asset: ${sourcePath}`);
      }
      fs.copyFileSync(sourcePath, path.join(dir, assetName));
    }
  }
}

async function downloadBuffer(url, attempts = 2) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function downloadExternalAssets() {
  const externalDir = path.join(copyDir, externalDirName);
  fs.mkdirSync(externalDir, { recursive: true });

  for (const asset of externalAssets) {
    const outputPath = path.join(externalDir, asset.file);
    let bytes;

    try {
      bytes = await downloadBuffer(asset.url);
    } catch (error) {
      if (asset.fallbackPath && fs.existsSync(asset.fallbackPath)) {
        bytes = fs.readFileSync(asset.fallbackPath);
      } else if (asset.fallbackBase64) {
        bytes = Buffer.from(asset.fallbackBase64, 'base64');
      } else {
        throw new Error(`Failed to download ${asset.url}: ${error.message}`);
      }
    }

    fs.writeFileSync(outputPath, bytes);
  }
}

function removeSavedFromComment(html) {
  return html.replace(/<!-- saved from url=\([\s\S]*?\) -->\r?\n?/gi, '');
}

function disableOriginalRuntime(html) {
  return html
    .replace(/<script\b/gi, '<script type="application/x-copy-disabled"')
    .replace(/<script type="application\/x-copy-disabled"[^>]*>/gi, (tag) => tag.replace(/\ssrc=/i, ' data-copy-src='))
    .replace(/\srel=(["'])modulepreload\1/gi, ' data-copy-rel-disabled="modulepreload"')
    .replace(/\shref=(["'])http:\/\/esp\.qmxy\.com\/assets\/[^"']+\1/gi, ' data-copy-remote-href=""')
    .replace(/\.\/chii\/target\.js/g, './copy-disabled/target.js');
}

function localizePageAssetRefs(html, page) {
  const resourceDirName = page.replace(/\.html$/u, '_files');
  const resourceDir = path.join(copyDir, resourceDirName);

  return html.replace(/https?:\/\/esp\.qmxy\.com\/assets\/([^"'&)<\s]+)/gi, (url, fileName) => {
    const localPath = path.join(resourceDir, fileName);
    return fs.existsSync(localPath) ? `./${resourceDirName}/${fileName}` : url;
  });
}

function localizeStylesheets() {
  const cssFiles = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith('.css')) {
        cssFiles.push(fullPath);
      }
    }
  }

  walk(copyDir);

  for (const filePath of cssFiles) {
    let css = fs.readFileSync(filePath, 'utf8');
    css = css
      .replaceAll('https://cdn.dcloud.net.cn/img/shadow-grey.png', `../${externalDirName}/shadow-grey.png`)
      .replaceAll('https://at.alicdn.com/t/font_2225171_8kdcwk4po24.ttf', `../${externalDirName}/font_2225171_8kdcwk4po24.ttf`);
    fs.writeFileSync(filePath, css, 'utf8');
  }
}

function injectNavigation(html) {
  const script = '<script src="./copy-navigation.js"></script>';
  if (html.includes(script)) {
    return html;
  }

  if (html.includes('</body>')) {
    return html.replace('</body>', `${script}\n</body>`);
  }

  return `${html}\n${script}\n`;
}

function createAliasPages(pageHtmlByName) {
  for (const [sourcePage, aliasPage] of aliases.entries()) {
    fs.writeFileSync(path.join(copyDir, aliasPage), pageHtmlByName.get(sourcePage), 'utf8');
  }
}

function createNavigationHelper() {
  const helper = `(() => {
  const routes = {
    'index.html': [
      { text: '立即登录', target: 'home.html' }
    ],
    'home.html': [
      { text: '进出申请', target: 'out.html' },
      { text: '我的', target: 'records.html' }
    ],
    'out.html': [
      { text: '出入申请', target: 'apply.html', within: '.form-item' },
      { text: '我的申请', target: 'records.html', within: '.bottom-menu-item' }
    ],
    'apply.html': [
      { text: '我的申请', target: 'records.html', within: '.bottom-menu-item' },
      { text: '外出申请', target: 'out.html', within: '.bottom-menu-item' }
    ],
    'records.html': [
      { text: '外出申请', target: 'out.html', within: '.bottom-menu-item' }
    ],
    '步骤1登录.html': [
      { text: '立即登录', target: 'home.html' }
    ],
    '步骤2进入首页.html': [
      { text: '进出申请', target: 'out.html' },
      { text: '我的', target: 'records.html' }
    ],
    '步骤3点击进出申请进去外出申请.html': [
      { text: '出入申请', target: 'apply.html', within: '.form-item' },
      { text: '我的申请', target: 'records.html', within: '.bottom-menu-item' }
    ],
    '步骤4点击外出申请进入申请页.html': [
      { text: '我的申请', target: 'records.html', within: '.bottom-menu-item' },
      { text: '外出申请', target: 'out.html', within: '.bottom-menu-item' }
    ],
    '步骤3-5进入我的申请查看申请记录等.html': [
      { text: '外出申请', target: 'out.html', within: '.bottom-menu-item' }
    ]
  };

  const fileName = decodeURIComponent(location.pathname.split('/').pop() || '步骤1登录.html');
  const pageRoutes = routes[fileName] || [];

  function textOf(node) {
    return (node.textContent || '').replace(/\\s+/g, '').trim();
  }

  function hasRouteText(node, routeText) {
    return textOf(node) === routeText;
  }

  function isInRouteScope(node, route) {
    return !route.within || Boolean(node.closest(route.within));
  }

  function closestRouteTarget(startNode) {
    for (const route of pageRoutes) {
      let node = startNode;
      while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE && hasRouteText(node, route.text) && isInRouteScope(node, route)) {
          return route.target;
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  document.addEventListener('click', (event) => {
    const target = closestRouteTarget(event.target);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    location.href = './' + encodeURI(target);
  }, true);
})();
`;
  fs.writeFileSync(path.join(copyDir, 'copy-navigation.js'), helper, 'utf8');
}

copyFresh();
copySharedResourceAssets();
await downloadExternalAssets();

const pageHtmlByName = new Map();

for (const page of pages) {
  const filePath = path.join(copyDir, page);
  const source = fs.readFileSync(filePath, 'utf8');
  const html = injectNavigation(localizePageAssetRefs(disableOriginalRuntime(sanitizeExtensionArtifacts(removeSavedFromComment(source))), page));
  fs.writeFileSync(filePath, html, 'utf8');
  pageHtmlByName.set(page, html);
}

localizeStylesheets();
createAliasPages(pageHtmlByName);
createNavigationHelper();

console.log(`Generated static copy at ${copyDir}`);
