function simpleAllowlistSanitize(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let out = input;
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/\son\w+="[^"]*"/gi, '').replace(/\son\w+='[^']*'/gi, '');
  out = out.replace(/javascript:/gi, '');
  out = out.replace(/<(?!\/?(?:b|strong|i|em|u|p|br|span|ul|ol|li|a|table|thead|tbody|tr|th|td|h1|h2|h3|h4|h5|h6|img)\b)[^>]*>/gi, '');
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
    span: new Set(['style']),
    figure: new Set(['class', 'style']),
    p: new Set(['style']),
    h1: new Set(['style']),
    h2: new Set(['style']),
    h3: new Set(['style']),
    h4: new Set(['style']),
    h5: new Set(['style']),
    h6: new Set(['style']),
    table: new Set(['border', 'cellpadding', 'cellspacing']),
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
      }
    }
    const children = Array.from(node.childNodes);
    for (const child of children) walker(child);
  };
  walker(doc.body);
  return doc.body ? doc.body.innerHTML : simpleAllowlistSanitize(input);
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
