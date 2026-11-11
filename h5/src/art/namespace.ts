/** Rewrites only this SVG's own IDs. Class and @keyframes names remain unchanged. */
export function namespaceSvg(svg: string, prefix: string): string {
  if (!/^[A-Za-z][\w-]*$/.test(prefix)) throw new Error('SVG 实例前缀不合法');
  const ids = new Set<string>();
  const withoutStyles = svg.replace(/<style\b([^>]*)>[\s\S]*?<\/style>/gi, (_match, attributes: string) => `<style${attributes}></style>`);
  withoutStyles.replace(/\sid\s*=\s*(["'])(.*?)\1/g, (match, _quote: string, id: string) => {
    ids.add(id);
    return match;
  });
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const known = [...ids].sort((a, b) => b.length - a.length).map(escape);
  const selector = known.length ? new RegExp(`#(${known.join('|')})(?![A-Za-z0-9_-])`, 'g') : null;
  const rewriteAttributes = (fragment: string): string => {
    let result = fragment.replace(/\sid\s*=\s*(["'])(.*?)\1/g, (match, quote: string, id: string) =>
      ids.has(id) ? ` id=${quote}${prefix}-${id}${quote}` : match);
    result = result.replace(/url\(\s*(["']?)#([^\s)'"<>]+)\1\s*\)/g,
      (match, quote: string, id: string) => ids.has(id) ? `url(${quote}#${prefix}-${id}${quote})` : match);
    return result.replace(/\s((?:xlink:)?href)\s*=\s*(["'])#(.*?)\2/g,
      (match, attr: string, quote: string, id: string) => ids.has(id) ? ` ${attr}=${quote}#${prefix}-${id}${quote}` : match);
  };
  // Styles are isolated so generated names cannot be mistaken for another source ID.
  let output = '';
  let cursor = 0;
  const styles = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
  for (const match of svg.matchAll(styles)) {
    output += rewriteAttributes(svg.slice(cursor, match.index));
    const css = selector ? match[2].replace(selector, (_selector, id: string) => `#${prefix}-${id}`) : match[2];
    output += `<style${rewriteAttributes(match[1])}>${css}</style>`;
    cursor = match.index + match[0].length;
  }
  return output + rewriteAttributes(svg.slice(cursor));
}
