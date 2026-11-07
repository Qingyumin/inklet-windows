import { parseFragment, serializeOuter } from 'parse5';
import { cellContent, htmlAlignment, htmlTableSource, parseHtmlTable, safeLink, textAlignment } from './html-tables.js';

const containers = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'aside', 'center', 'figure', 'figcaption']);
const blocks = new Set([...containers, 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'pre', 'hr']);
const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base']);
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function htmlBlockTag(line) {
  const tag = /^<(\w+)(?:\s|>|\/)/i.exec(line)?.[1].toLowerCase();
  return blocks.has(tag) ? tag : null;
}

export function parseHtmlAnchor(source) {
  const fragment = parseFragment(source, { sourceCodeLocationInfo: true });
  const nodes = fragment.childNodes.filter(node => node.nodeName !== '#text' || node.value.trim());
  const element = nodes[0];
  if (nodes.length !== 1 || element?.tagName !== 'a' || !element.sourceCodeLocation?.endTag) return null;
  if (element.childNodes.some(node => node.nodeName !== '#text' || node.value.trim())) return null;
  const id = attribute(element, 'id') || attribute(element, 'name');
  return id ? { id, raw: source } : null;
}

function pageBreak(element, side) {
  return new RegExp('(?:^|;)\\s*(?:page-break-' + side + '\\s*:\\s*always|break-' + side + '\\s*:\\s*page)\\s*(?:!important\\s*)?(?:;|$)', 'i').test(attribute(element, 'style') || '');
}

export function parseHtmlBlock(source, schema) {
  const fragment = parseFragment(source, { sourceCodeLocationInfo: true });
  const meaningful = fragment.childNodes.filter(node => node.nodeName !== '#text' || node.value.trim());
  const element = meaningful[0];
  if (meaningful.length !== 1 || !blocks.has(element?.tagName) || (!element.sourceCodeLocation?.endTag && element.tagName !== 'hr')) return null;
  const convert = (parent, inherited = null, depth = 0) => {
    if (depth > 64) throw new Error('HTML nesting is too deep');
    const result = [];
    let pending = [];
    const flush = () => {
      if (!pending.length) return;
      for (const paragraph of cellContent({ childNodes: pending }, schema)) {
        if (paragraph.childCount) result.push(paragraph.type.create({ ...paragraph.attrs, textAlign: paragraph.attrs.textAlign || inherited }, paragraph.content));
      }
      pending = [];
    };
    for (const child of parent.childNodes || []) {
      const tag = child.tagName;
      if (blocked.has(tag)) continue;
      if (child.nodeName === '#comment') {
        flush(); result.push(schema.nodes.html_comment.create({ raw: '<!--' + child.data + '-->' })); continue;
      }
      if (tag === 'a') {
        const anchor = parseHtmlAnchor(serializeOuter(child));
        if (anchor) { flush(); result.push(schema.nodes.html_anchor.create(anchor)); continue; }
      }
      if (tag !== 'table' && !blocks.has(tag)) { pending.push(child); continue; }
      flush();
      const alignment = htmlAlignment(child, tag === 'center' ? 'center' : inherited);
      if (tag === 'table') {
        const table = parseHtmlTable(serializeOuter(child), schema);
        if (!table) throw new Error('Unsupported HTML table');
        result.push(table);
      } else if (containers.has(tag)) {
        const content = convert(child, alignment, depth + 1);
        result.push(schema.nodes.html_block.create({ tag, textAlign: alignment, pageBreakBefore: pageBreak(child, 'before'), pageBreakAfter: pageBreak(child, 'after') }, content.length ? content : schema.nodes.paragraph.create()));
      } else if (tag === 'blockquote') {
        const content = convert(child, alignment, depth + 1);
        result.push(schema.nodes.blockquote.create(null, content.length ? content : schema.nodes.paragraph.create()));
      } else if (tag === 'ul' || tag === 'ol') {
        const items = (child.childNodes || []).filter(item => item.tagName === 'li').map(item => {
          const content = convert(item, alignment, depth + 1);
          if (content[0]?.type.name !== 'paragraph') content.unshift(schema.nodes.paragraph.create());
          return schema.nodes.list_item.create(null, content);
        });
        if (items.length) result.push(schema.nodes[tag === 'ul' ? 'bullet_list' : 'ordered_list'].create(tag === 'ol' ? { order: Math.max(1, Math.min(1000000000, parseInt(attribute(child, 'start'), 10) || 1)) } : null, items));
      } else if (tag === 'pre') {
        const textOf = node => node.nodeName === '#text' ? node.value : blocked.has(node.tagName) ? '' : node.tagName === 'br' ? '\n' : (node.childNodes || []).map(textOf).join('');
        const text = textOf(child).replace(/\n$/, '');
        result.push(schema.nodes.code_block.create(null, text ? schema.text(text) : null));
      } else if (tag === 'hr') result.push(schema.nodes.horizontal_rule.create());
      else {
        const paragraphs = cellContent(child, schema);
        if (/^h[1-6]$/.test(tag)) {
          const inline = [];
          for (const paragraph of paragraphs) {
            if (inline.length) inline.push(schema.nodes.hard_break.create());
            paragraph.forEach(node => inline.push(node));
          }
          result.push(schema.nodes.heading.create({ level: Number(tag[1]), textAlign: alignment }, inline));
        } else for (const paragraph of paragraphs) result.push(paragraph.type.create({ ...paragraph.attrs, textAlign: paragraph.attrs.textAlign || alignment }, paragraph.content));
      }
    }
    flush();
    return result;
  };
  try {
    const content = convert({ childNodes: [element] });
    const children = content.length ? content : [schema.nodes.paragraph.create()];
    const node = schema.nodes.html_block.create({ raw: source, original: JSON.stringify(children.map(child => child.toJSON())) }, children);
    node.check();
    return node;
  } catch { return null; }
}

export function htmlBlockSource(node) {
  if (node.attrs.raw && node.attrs.original === JSON.stringify(node.content.toJSON())) return node.attrs.raw;
  const render = current => {
    if (current.isText) {
      let text = escapeHtml(current.text);
      for (const mark of current.marks) {
        const tag = { strong: 'strong', em: 'em', strike: 's', code: 'code' }[mark.type.name];
        if (tag) text = '<' + tag + '>' + text + '</' + tag + '>';
        else if (mark.type.name === 'link' && safeLink(mark.attrs.href)) text = '<a href="' + escapeHtml(mark.attrs.href) + '">' + text + '</a>';
      }
      return text;
    }
    const kind = current.type.name;
    if (['html_comment', 'html_comment_inline', 'html_anchor', 'html_anchor_inline'].includes(kind)) return current.attrs.raw;
    if (kind === 'table') return htmlTableSource(current);
    if (kind === 'hard_break') return '<br>';
    if (kind === 'horizontal_rule') return '<hr>';
    if (kind === 'image') return '<img src="' + escapeHtml(current.attrs.src) + '" alt="' + escapeHtml(current.attrs.alt || '') + '">';
    if (kind === 'math_inline') return escapeHtml('$' + current.attrs.tex + '$');
    if (kind === 'code_block') return '<pre><code>' + escapeHtml(current.textContent) + '</code></pre>';
    let content = ''; current.forEach(child => { content += render(child); });
    const tag = kind === 'html_block' ? containers.has(current.attrs.tag) ? current.attrs.tag : 'div' : kind === 'heading' ? 'h' + current.attrs.level : { paragraph: 'p', blockquote: 'blockquote', bullet_list: 'ul', ordered_list: 'ol', list_item: 'li' }[kind];
    if (!tag) return content;
    const alignment = textAlignment(current.attrs.textAlign);
    const styles = [alignment ? 'text-align:' + alignment : '', current.attrs.pageBreakBefore ? 'page-break-before:always' : '', current.attrs.pageBreakAfter ? 'page-break-after:always' : ''].filter(Boolean);
    const attributes = (styles.length ? ' style="' + styles.join(';') + '"' : '') + (kind === 'ordered_list' && current.attrs.order !== 1 ? ' start="' + current.attrs.order + '"' : '');
    return '<' + tag + attributes + '>' + content + '</' + tag + '>';
  };
  return render(node);
}