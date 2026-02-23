function simpleAllowlistSanitize(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let out = input;
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/\son\w+="[^"]*"/gi, '').replace(/\son\w+='[^']*'/gi, '');
  out = out.replace(/javascript:/gi, '');
  // Preserve style attributes by sanitizing their contents; allow a safe set of tags.
  out = out.replace(/style\s*=\s*"([^"]*)"/gi, (m, s) => {
    const sanitized = sanitizeStyle(s);
    return sanitized ? `style="${sanitized}"` : '';
  });
  out = out.replace(/style\s*=\s*'([^']*)'/gi, (m, s) => {
    const sanitized = sanitizeStyle(s);
    return sanitized ? `style='${sanitized}'` : '';
  });

  out = out.replace(/<(?!\/??(?:b|strong|i|em|u|p|br|span|ul|ol|li|a|table|thead|tbody|tr|th|td|h1|h2|h3|h4|h5|h6|img|figure)\b)[^>]*>/gi, '');
  out = out.replace(/<a([^>]*)>/gi, (m, attrs) => {
    let a = attrs || '';
    a = a.replace(/\srel="[^"]*"/gi, '');
    if (!/target=/.test(a)) a += ' target="_blank"';
    a += ' rel="noopener noreferrer"';
    return `<a${a}>`;
  });
  out = out.replace(/<img([^>]*)>/gi, (m, attrs) => {
    let a = attrs || '';
    a = a.replace(/src\s*=\s*"(?!https?:|\/)/gi, '');
    a = a.replace(/src\s*=\s*'(?!https?:|\/)/gi, '');
    return `<img${a}>`;
  });
  return out;
}

export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  if (typeof window === 'undefined' || typeof (window as any).DOMParser === 'undefined') {
    return simpleAllowlistSanitize(input);
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');
  if (!doc || !doc.body) {
    return simpleAllowlistSanitize(input);
  }
  const allowedTags = new Set([
    'b',
    'strong',
    'i',
    'em',
    'u',
    's',
    'mark',
    'blockquote',
    'figure',
    'p',
    'br',
    'span',
    'ul',
    'ol',
    'li',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'img',
  ]);
  const allowedAttrs: Record<string, Set<string>> = {
    a: new Set(['href', 'title', 'target', 'rel']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
    th: new Set(['colspan', 'rowspan', 'align']),
    td: new Set(['colspan', 'rowspan', 'align']),
    span: new Set(['style', 'class']),
    figure: new Set(['class', 'style']),
    p: new Set(['style', 'class']),
    h1: new Set(['style', 'class']),
    h2: new Set(['style', 'class']),
    h3: new Set(['style', 'class']),
    h4: new Set(['style', 'class']),
    h5: new Set(['style', 'class']),
    h6: new Set(['style', 'class']),
    table: new Set(['border', 'cellpadding', 'cellspacing', 'class', 'style']),
    tr: new Set(['class', 'style']),
    th: new Set(['colspan', 'rowspan', 'align', 'class', 'style']),
    td: new Set(['colspan', 'rowspan', 'align', 'class', 'style']),
    ul: new Set(['class', 'style']),
    ol: new Set(['class', 'style']),
    li: new Set(['class', 'style']),
  };
  const isSafeUrl = (url: string) => /^(https?:|mailto:|\/)/i.test(url);
  const walker = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (!allowedTags.has(tag)) {
        const parent = el.parentNode;
        while (el.firstChild) parent?.insertBefore(el.firstChild, el);
        parent?.removeChild(el);
        return;
      }
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value;
        const allowed = allowedAttrs[tag]?.has(name);
        if (!allowed) {
          el.removeAttribute(name);
          continue;
        }
        if (tag === 'a' && name === 'href') {
          if (!isSafeUrl(value)) {
            el.removeAttribute(name);
          } else {
            el.setAttribute('rel', 'noopener noreferrer');
          }
        }
        if (tag === 'img' && name === 'src') {
          if (!isSafeUrl(value)) {
            el.removeAttribute(name);
          }
        }
        // Sanitize inline style attribute values to only allow safe CSS properties.
        if (name === 'style') {
          const sanitizedStyle = sanitizeStyle(value);
          if (!sanitizedStyle) {
            el.removeAttribute(name);
          } else {
            el.setAttribute(name, sanitizedStyle);
          }
        }
      }
    }
    const children = Array.from(node.childNodes);
    for (const child of children) walker(child);
  };
  walker(doc.body);
  return doc.body ? doc.body.innerHTML : simpleAllowlistSanitize(input);
}

function sanitizeStyle(styleText: string): string {
  if (!styleText || typeof styleText !== 'string') return '';
  // remove potentially dangerous tokens
  const cleaned = styleText.replace(/expression\(|url\(|javascript:/gi, '');
  const allowedProps = new Set([
    'color',
    'background-color',
    'text-align',
    'font-weight',
    'font-style',
    'text-decoration',
    'font-size',
    'font-family',
    'margin',
    'padding'
  ]);
  const parts = cleaned.split(';').map(p => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (allowedProps.has(prop)) {
      out.push(`${prop}: ${val}`);
    }
  }
  return out.join('; ');
}

export function htmlToPlainText(input: string): string {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof (window as any).DOMParser === 'undefined') {
    return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');
  if (!doc || !doc.body) {
    return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return (doc.body.textContent || '').trim();
}
