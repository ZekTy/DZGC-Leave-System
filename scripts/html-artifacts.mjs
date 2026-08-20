export const extensionArtifactPattern =
  /data-immersive-translate-page-theme|immersive-translate-popup|imt-fb|imt-no-events|imt-notranslate|shadowrootmode=["']open["']|chii\/target\.js|target\.js\.(?:下载|涓嬭浇)/i;

export function hasExtensionArtifacts(html) {
  return extensionArtifactPattern.test(html);
}

export function sanitizeExtensionArtifacts(html) {
  return html
    .replace(/\sdata-immersive-translate-page-theme=(?:"[^"]*"|'[^']*')/gi, '')
    .replace(
      /\s*window\.addEventListener\(["']load["'],\s*function\s*\(\)\s*\{\s*var script = document\.createElement\(["']script["']\);\s*script\.src = ["']\.\/chii\/target\.js["'];\s*document\.body\.append\(script\);\s*\}\);\s*/gi,
      '\n',
    )
    .replace(/<script\b[^>]*src=(["'])\.\/[^"']*\/target\.js\.(?:下载|涓嬭浇)\1[^>]*>\s*<\/script>/gi, '')
    .replace(/<\/body>\s*<div id=(["'])immersive-translate-popup\1[\s\S]*?<\/html>\s*$/i, '</body></html>');
}
