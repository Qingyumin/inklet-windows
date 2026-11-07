import MarkdownIt from 'markdown-it';
import texmath from 'markdown-it-texmath';
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema as baseSchema, MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { tableNodes } from 'prosemirror-tables';
import { isMap, parseDocument as parseYamlDocument, stringify as stringifyYaml } from 'yaml';
import { minimalChange, replaceText } from '../../core/document.mjs';
import { parseHtmlTable, htmlTableSource, textAlignment } from './html-tables.js';
import { htmlBlockTag, parseHtmlBlock, htmlBlockSource, parseHtmlAnchor } from './html-blocks.js';

function frontMatterValue(value) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  return stringifyYaml(value, { collectionStyle: 'flow', lineWidth: 0 }).trim();
}

function frontMatterDom(node) {
  return ['table', { class: 'front-matter-properties', 'data-front-matter': '', 'aria-label': 'YAML 属性' },
    ['tbody', {}, ...node.attrs.entries.map(entry => ['tr', {}, ['th', { scope: 'row' }, entry.key], ['td', {}, entry.value]])]];
}

const mathSpec = inline => ({
  group: inline ? 'inline' : 'block', inline, atom: true, selectable: true,
  attrs: { tex: { default: '' } },
  toDOM: node => [inline ? 'span' : 'div', { 'data-math': node.attrs.tex, class: inline ? 'math-inline' : 'math-block' }, node.attrs.tex],
  parseDOM: [{ tag: inline ? 'span[data-math]' : 'div[data-math]', getAttrs: element => ({ tex: element.getAttribute('data-math') }) }],
});

const tables = tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {
  textAlign: {
    default: null,
    getFromDOM: element => textAlignment(element.style.textAlign || element.getAttribute('align')),
    setDOMAttr: (value, attrs) => { if (textAlignment(value)) attrs.style = (attrs.style || '') + 'text-align:' + value + ';'; },
  },
} });
tables.table.attrs = { format: { default: 'markdown' } };
const paragraph = { ...baseSchema.spec.nodes.get('paragraph'), attrs: { textAlign: { default: null } },
  toDOM: node => ['p', textAlignment(node.attrs.textAlign) ? { style: 'text-align:' + node.attrs.textAlign } : {}, 0],
  parseDOM: [{ tag: 'p', getAttrs: element => ({ textAlign: textAlignment(element.style.textAlign || element.getAttribute('align')) }) }],
};
const lineBreak = { ...baseSchema.spec.nodes.get('hard_break'),
  attrs: { soft: { default: false } },
  toDOM: node => ['br', node.attrs.soft ? { 'data-source-break': 'soft' } : {}],
  parseDOM: [{ tag: 'br[data-source-break="soft"]', getAttrs: () => ({ soft: true }) }, { tag: 'br' }],
};
const heading = { ...baseSchema.spec.nodes.get('heading'),
  attrs: { level: { default: 1 }, textAlign: { default: null } },
  toDOM: node => ['h' + node.attrs.level, textAlignment(node.attrs.textAlign) ? { style: 'text-align:' + node.attrs.textAlign } : {}, 0],
  parseDOM: Array.from({ length: 6 }, (_, index) => ({ tag: 'h' + (index + 1), getAttrs: element => ({ level: index + 1, textAlign: textAlignment(element.style.textAlign || element.getAttribute('align')) }) })),
};
const anchorSpec = inline => ({
  group: inline ? 'inline' : 'block', inline, atom: true, selectable: false,
  attrs: { raw: { default: '' }, id: { default: '' } },
  toDOM: node => [inline ? 'span' : 'div', { class: 'html-anchor', 'data-html-anchor': node.attrs.id, id: 'inklet-anchor-' + encodeURIComponent(node.attrs.id), 'aria-hidden': 'true' }],
});

export const schema = new Schema({
  nodes: baseSchema.spec.nodes.update('paragraph', paragraph).update('heading', heading).update('hard_break', lineBreak).append(tables).append({
    html_block: {
      group: 'block', content: 'block+', defining: true, isolating: true,
      attrs: { raw: { default: '' }, original: { default: '' }, tag: { default: 'div' }, textAlign: { default: null }, pageBreakBefore: { default: false }, pageBreakAfter: { default: false } },
      toDOM: node => ['div', { class: 'html-block', 'data-html-block': '', ...(textAlignment(node.attrs.textAlign) ? { style: 'text-align:' + node.attrs.textAlign } : {}), ...(node.attrs.pageBreakBefore ? { 'data-html-break-before': '' } : {}), ...(node.attrs.pageBreakAfter ? { 'data-html-break-after': '' } : {}) }, 0],
      parseDOM: [{ tag: 'div[data-html-block]', getAttrs: element => ({ textAlign: textAlignment(element.style.textAlign), pageBreakBefore: element.hasAttribute('data-html-break-before'), pageBreakAfter: element.hasAttribute('data-html-break-after') }) }],
    },
    html_anchor: anchorSpec(false),
    html_anchor_inline: anchorSpec(true),
    html_comment: {
      group: 'block', atom: true, selectable: false,
      attrs: { raw: { default: '' } },
      toDOM: () => ['div', { hidden: '', 'data-html-comment': '', 'aria-hidden': 'true' }],
    },
    html_comment_inline: {
      group: 'inline', inline: true, atom: true, selectable: false,
      attrs: { raw: { default: '' } },
      toDOM: () => ['span', { hidden: '', 'data-html-comment': '', 'aria-hidden': 'true' }],
    },
    front_matter: {
      group: 'block', atom: true, selectable: true,
      attrs: { raw: { default: '' }, entries: { default: [] } },
      toDOM: frontMatterDom,
      parseDOM: [{ tag: 'table[data-front-matter]', getAttrs: element => ({
        raw: '',
        entries: [...element.querySelectorAll('tr')].map(row => ({ key: row.querySelector('th')?.textContent || '', value: row.querySelector('td')?.textContent || '' })),
      }) }],
    },
    math_inline: mathSpec(true),
    math_block: mathSpec(false),
    toc: {
      group: 'block', atom: true, selectable: true,
      attrs: { marker: { default: '[TOC]' } },
      toDOM: () => ['nav', { class: 'document-toc', 'data-toc': '', 'aria-label': '文档目录' }],
      parseDOM: [{ tag: 'nav[data-toc]' }],
    },
    page_break: {
      group: 'block', atom: true, selectable: false,
      attrs: { marker: { default: '<!-- pagebreak -->' } },
      toDOM: () => ['div', { class: 'document-pagebreak', 'data-pagebreak': '', 'aria-label': '分页' }],
      parseDOM: [{ tag: 'div[data-pagebreak]' }],
    },
    mermaid: {
      group: 'block', atom: true, selectable: true,
      attrs: { code: { default: '' } },
      toDOM: node => ['div', { 'data-mermaid': node.attrs.code, class: 'diagram-block' }, node.attrs.code],
      parseDOM: [{ tag: 'div[data-mermaid]', getAttrs: element => ({ code: element.getAttribute('data-mermaid') }) }],
    },
  }),
  marks: baseSchema.spec.marks.append({
    strike: { toDOM: () => ['s', 0], parseDOM: [{ tag: 's' }, { tag: 'del' }] },
  }),
});

const tokenizer = new MarkdownIt({ html: false, breaks: false, linkify: false });
const imageRules = new MarkdownIt().inline.ruler;
imageRules.enableOnly(['image']);
const [imageRule] = imageRules.getRules('');
tokenizer.inline.ruler.at('image', (state, silent) => {
  const validate = state.md.validateLink;
  state.md.validateLink = value => /^file:\/\/\//i.test(value) || /^[a-z]:(?:[\\/]|%5c|%2f)/i.test(value) || validate(value);
  try { return imageRule(state, silent); }
  finally { state.md.validateLink = validate; }
});
const referenceRules = new MarkdownIt().block.ruler;
referenceRules.enableOnly(['reference']);
const [referenceRule] = referenceRules.getRules('');
tokenizer.block.ruler.at('reference', (state, start, end, silent) => {
  const validate = state.md.validateLink;
  state.md.validateLink = value => /^file:\/\/\//i.test(value) || /^[a-z]:(?:[\\/]|%5c|%2f)/i.test(value) || validate(value);
  try { return referenceRule(state, start, end, silent); }
  finally { state.md.validateLink = validate; }
});
tokenizer.use(texmath, { delimiters: 'dollars', engine: { renderToString: () => '' } });
tokenizer.block.ruler.before('hr', 'inklet_front_matter', (state, start, end, silent) => {
  if (start !== 0 || state.blkIndent !== 0) return false;
  const opening = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
  if (opening !== '---') return false;
  let closing = -1;
  for (let line = start + 1; line < end; line++) {
    if (state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]).trim() === '---') { closing = line; break; }
  }
  if (closing < 0) return false;
  const content = state.src.slice(state.bMarks[start + 1], state.bMarks[closing]);
  let document;
  let values;
  try {
    document = parseYamlDocument(content, { prettyErrors: false, uniqueKeys: true });
    if (document.errors.length || !isMap(document.contents)) return false;
    values = document.toJS({ mapAsMap: true, maxAliasCount: 100 });
  } catch { return false; }
  if (silent) return true;
  const after = closing + 1 < state.lineMax ? state.bMarks[closing + 1] : state.eMarks[closing];
  const token = state.push('front_matter', '', 0);
  token.map = [start, closing + 1];
  token.meta = {
    raw: state.src.slice(state.bMarks[start], after),
    entries: [...values].map(([key, value]) => ({ key: String(key), value: frontMatterValue(value) })),
  };
  state.line = closing + 1;
  return true;
});
tokenizer.block.ruler.before('paragraph', 'inklet_document_marker', (state, start, end, silent) => {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const marker = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
  const kind = /^\[toc\]$/i.test(marker) ? 'toc_marker' : /^<!--\s*pagebreak\s*-->$/i.test(marker) ? 'page_break_marker' : null;
  if (!kind) return false;
  if (silent) return true;
  const token = state.push(kind, '', 0);
  token.map = [start, start + 1]; token.content = marker;
  state.line = start + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote'] });
const htmlCache = new Map();
let htmlCacheSize = 0;
tokenizer.block.ruler.before('html_block', 'inklet_html_comment', (state, start, end, silent) => {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const begin = state.bMarks[start] + state.tShift[start];
  if (!state.src.startsWith('<!--', begin)) return false;
  const closing = state.src.indexOf('-->', begin + 4);
  if (closing < 0) return false;
  let last = start;
  while (last + 1 < end && state.eMarks[last] < closing + 3) last++;
  if (state.eMarks[last] < closing + 3 || state.src.slice(closing + 3, state.eMarks[last]).trim()) return false;
  const raw = state.getLines(start, last + 1, state.blkIndent, false);
  if (/^<!--\s*pagebreak\s*-->$/i.test(raw.trim())) return false;
  if (silent) return true;
  const token = state.push('html_comment', '', 0);
  token.map = [start, last + 1]; token.content = raw;
  state.line = last + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote'] });
tokenizer.inline.ruler.before('html_inline', 'inklet_inline_comment', (state, silent) => {
  if (!state.src.startsWith('<!--', state.pos)) return false;
  const closing = state.src.indexOf('-->', state.pos + 4);
  if (closing < 0) return false;
  if (!silent) {
    const token = state.push('html_comment_inline', '', 0);
    token.content = state.src.slice(state.pos, closing + 3);
  }
  state.pos = closing + 3;
  return true;
});
tokenizer.block.ruler.before('html_block', 'inklet_html_anchor', (state, start, end, silent) => {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
  if (!/^<a\b/i.test(line)) return false;
  const anchor = parseHtmlAnchor(line);
  if (!anchor) return false;
  if (silent) return true;
  const token = state.push('html_anchor', '', 0);
  token.map = [start, start + 1]; token.meta = anchor; state.line = start + 1;
  return true;
}, { alt: ['paragraph', 'reference', 'blockquote'] });
tokenizer.inline.ruler.before('html_inline', 'inklet_html_break', (state, silent) => {
  const match = /^<br\s*\/?\s*>/i.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) state.push('hardbreak', 'br', 0);
  state.pos += match[0].length;
  return true;
});
tokenizer.inline.ruler.before('html_inline', 'inklet_inline_anchor', (state, silent) => {
  const match = /^<a\b[^<>]*>\s*<\/a\s*>/i.exec(state.src.slice(state.pos));
  if (!match) return false;
  const anchor = parseHtmlAnchor(match[0]);
  if (!anchor) return false;
  if (!silent) { const token = state.push('html_anchor_inline', '', 0); token.meta = anchor; }
  state.pos += match[0].length;
  return true;
});
tokenizer.block.ruler.before('html_block', 'inklet_safe_html_block', (state, start, end, silent) => {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const begin = state.bMarks[start] + state.tShift[start];
  const tag = htmlBlockTag(state.src.slice(begin, state.eMarks[start]));
  if (!tag) return false;
  const closing = new RegExp('</' + tag + '\\s*>', 'i');
  for (let line = start; line < end; line++) {
    if (state.eMarks[line] - begin > 1024 * 1024) return false;
    if (tag !== 'hr' && !closing.test(state.src.slice(state.bMarks[line], state.eMarks[line]))) continue;
    const content = state.getLines(start, line + 1, state.blkIndent, false);
    const node = parseHtmlBlock(content, schema);
    if (!node) continue;
    if (silent) return true;
    const token = state.push('safe_html_block', '', 0);
    token.map = [start, line + 1]; token.meta = node; state.line = line + 1;
    return true;
  }
  return false;
}, { alt: ['paragraph', 'reference', 'blockquote'] });
tokenizer.block.ruler.before('html_block', 'inklet_html_table', (state, start, end, silent) => {
  if (state.sCount[start] - state.blkIndent >= 4) return false;
  const begin = state.bMarks[start] + state.tShift[start];
  if (!/^<table(?:\s|>|$)/i.test(state.src.slice(begin, state.eMarks[start]))) return false;
  if (silent) return true;
  for (let line = start; line < end; line++) {
    const currentLine = state.src.slice(state.bMarks[line], state.eMarks[line]);
    if (line > start && /^\s*<table(?:\s|>)/i.test(currentLine)) return false;
    if (!/<\/table\s*>/i.test(currentLine)) continue;
    const content = state.getLines(start, line + 1, state.blkIndent, false);
    let node = htmlCache.get(content);
    if (!node) {
      node = parseHtmlTable(content, schema);
      if (!node) return false;
      htmlCache.set(content, node);
      htmlCacheSize += content.length;
      while (htmlCache.size > 600 || htmlCacheSize > 8 * 1024 * 1024) {
        const oldest = htmlCache.keys().next().value;
        htmlCacheSize -= oldest.length;
        htmlCache.delete(oldest);
      }
    }
    const token = state.push('html_table', 'table', 0);
    token.map = [start, line + 1]; token.meta = node;
    state.line = line + 1;
    return true;
  }
  return false;
}, { alt: ['paragraph', 'reference', 'blockquote'] });

const tokenRules = {
  ...defaultMarkdownParser.tokens,
  softbreak: { node: 'hard_break', getAttrs: () => ({ soft: true }) },
  table: { block: 'table' },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: 'table_row' },
  th: { block: 'table_header' },
  td: { block: 'table_cell' },
  s: { mark: 'strike' },
  html_comment: { node: 'html_comment', getAttrs: token => ({ raw: token.content }) },
  html_comment_inline: { node: 'html_comment_inline', getAttrs: token => ({ raw: token.content }) },
  html_anchor: { node: 'html_anchor', getAttrs: token => token.meta },
  html_anchor_inline: { node: 'html_anchor_inline', getAttrs: token => token.meta },
  front_matter: { node: 'front_matter', getAttrs: token => token.meta },
  toc_marker: { node: 'toc', getAttrs: token => ({ marker: token.content }) },
  page_break_marker: { node: 'page_break', getAttrs: token => ({ marker: token.content }) },
  math_inline: { node: 'math_inline', getAttrs: token => ({ tex: token.content }) },
  math_inline_double: { node: 'math_inline', getAttrs: token => ({ tex: token.content }) },
  math_single: { node: 'math_inline', getAttrs: token => ({ tex: token.content }) },
  math_block: { node: 'math_block', getAttrs: token => ({ tex: token.content }) },
  math_block_eqno: { node: 'math_block', getAttrs: token => ({ tex: token.content }) },
  mermaid_block: { node: 'mermaid', getAttrs: token => ({ code: token.content.replace(/\n$/, '') }) },
};

export const serializer = new MarkdownSerializer({
  ...defaultMarkdownSerializer.nodes,
  html_comment(state, node) { state.write(node.attrs.raw.replace(/\n$/, '')); state.closeBlock(node); },
  html_comment_inline(state, node) { state.write(node.attrs.raw); },
  html_anchor(state, node) { state.write(node.attrs.raw); state.closeBlock(node); },
  html_anchor_inline(state, node) { state.write(node.attrs.raw); },
  html_block(state, node) { state.write(htmlBlockSource(node).replace(/\n$/, '')); state.closeBlock(node); },
  hard_break(state, node, parent, index) {
    if (node.attrs.soft) state.write('\n');
    else defaultMarkdownSerializer.nodes.hard_break(state, node, parent, index);
  },
  front_matter(state, node) {
    const generated = '---\n' + stringifyYaml(Object.fromEntries(node.attrs.entries.map(entry => [entry.key, entry.value]))).trimEnd() + '\n---';
    state.write((node.attrs.raw || generated).replace(/(?:\r\n|\n|\r)$/, ''));
    state.closeBlock(node);
  },
  math_inline(state, node) { state.write('$' + node.attrs.tex + '$'); },
  math_block(state, node) { state.write('$$\n' + node.attrs.tex + '\n$$'); state.closeBlock(node); },
  mermaid(state, node) { state.write('```mermaid\n' + node.attrs.code + '\n```'); state.closeBlock(node); },
  toc(state, node) { state.write(node.attrs.marker); state.closeBlock(node); },
  page_break(state, node) { state.write(node.attrs.marker); state.closeBlock(node); },
  table(state, node) {
    let merged = false;
    node.forEach(row => row.forEach(cell => { if (cell.attrs.colspan > 1 || cell.attrs.rowspan > 1) merged = true; }));
    if (node.attrs.format === 'html' || merged) {
      state.write(htmlTableSource(node)); state.closeBlock(node); return;
    }
    const rows = [];
    node.forEach(row => {
      const cells = [];
      row.forEach(cell => {
        const content = serializer.serialize(schema.node('doc', null, cell.content));
        cells.push(content.replace(/\n/g, ' ').replace(/(?<!\\)\|/g, '\\|'));
      });
      rows.push('| ' + cells.join(' | ') + ' |');
    });
    if (rows.length) rows.splice(1, 0, '| ' + Array(node.firstChild.childCount).fill('---').join(' | ') + ' |');
    state.write(rows.join('\n'));
    state.closeBlock(node);
  },
}, {
  ...defaultMarkdownSerializer.marks,
  strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
});

function lineOffsets(source) {
  const offsets = [0];
  for (let position = 0; position < source.length; position++) if (source[position] === '\n') offsets.push(position + 1);
  offsets.push(source.length);
  return offsets;
}

export function parseDocument(source) {
  const originalTokens = tokenizer.parse(source, {});
  const offsets = lineOffsets(source);
  const blocks = originalTokens.filter(token => token.level === 0 && token.map && token.nesting !== -1);
  const tokens = [];
  for (const token of originalTokens) {
    if (token.type === 'fence' && token.info.trim() === 'mermaid') token.type = 'mermaid_block';
    if (token.type === 'th_close' || token.type === 'td_close') tokens.push(new token.constructor('paragraph_close', 'p', -1));
    tokens.push(token);
    if (token.type === 'th_open' || token.type === 'td_open') tokens.push(new token.constructor('paragraph_open', 'p', 1));
  }
  const parser = new MarkdownParser(schema, { parse: () => tokens }, tokenRules);
  parser.tokenHandlers.html_table = (state, token) => state.addNode(schema.nodes.table, token.meta.attrs, token.meta.content.content);
  parser.tokenHandlers.safe_html_block = (state, token) => state.addNode(schema.nodes.html_block, token.meta.attrs, token.meta.content.content);
  const doc = parser.parse(source);
  const ranges = [];
  doc.forEach((node, position, index) => {
    const block = blocks[index];
    ranges.push({
      from: block ? offsets[block.map[0]] : source.length,
      to: block ? (offsets[block.map[1]] ?? source.length) : source.length,
      position, end: position + node.nodeSize, node,
    });
  });
  const runs = [];
  for (const range of ranges) {
    let cursor = range.from;
    range.node.descendants((node, position) => {
      if (!node.isText) return;
      const offset = source.indexOf(node.text, cursor);
      if (offset < 0 || offset + node.text.length > range.to) return;
      runs.push({ from: offset, to: offset + node.text.length, position: range.position + 1 + position, text: node.text });
      cursor = offset + node.text.length;
    });
  }
  return { doc, ranges, runs, source };
}

export function richChange(source, previous, next, ranges) {
  let first = 0;
  while (first < previous.childCount && first < next.childCount && previous.child(first).eq(next.child(first))) first++;
  if (first === previous.childCount && first === next.childCount) return null;
  let remaining = 0;
  while (remaining < previous.childCount - first && remaining < next.childCount - first && previous.child(previous.childCount - remaining - 1).eq(next.child(next.childCount - remaining - 1))) remaining++;
  const from = ranges[first]?.from ?? source.length;
  const to = Math.max(from, ranges[previous.childCount - remaining - 1]?.to ?? from);
  const children = [];
  for (let index = first; index < next.childCount - remaining; index++) children.push(next.child(index));
  let replacement = children.length ? serializer.serialize(schema.node('doc', null, children)) : '';
  if (replacement && first === previous.childCount && from > 0 && !source.slice(0, from).endsWith('\n\n')) replacement = '\n\n' + replacement;
  if (replacement && (source.slice(from, to).endsWith('\n') || to < source.length)) replacement += to < source.length && source[to] !== '\n' ? '\n\n' : '\n';
  const localChange = minimalChange(source.slice(from, to), replacement);
  return { from: from + localChange.from, to: from + localChange.to, insert: localChange.insert };
}

export function sourcePosition(parsed, position, association = 1) {
  const run = parsed.runs.find(item => position >= item.position && position <= item.position + item.text.length);
  if (run) return run.from + position - run.position;
  const block = parsed.ranges.find(item => position >= item.position && position <= item.end);
  if (!block) return parsed.source.length;
  if (association < 0) {
    const previous = parsed.runs.findLast(item => item.position >= block.position && item.position + item.text.length <= position);
    if (previous) return previous.to;
  }
  return association > 0 ? block.from : block.to;
}

export function prosePosition(parsed, position) {
  const run = parsed.runs.find(item => position >= item.from && position <= item.to);
  if (run) return run.position + position - run.from;
  const block = parsed.ranges.find(item => position >= item.from && position <= item.to);
  if (block) return Math.min(block.position + 1, parsed.doc.content.size);
  return Math.max(0, parsed.doc.content.size - 1);
}

export function plainTextChange(parsed, transaction) {
  if (transaction.steps.length !== 1) return null;
  const step = transaction.steps[0];
  if (parsed.ranges.some(range => (range.node.type.name === 'html_block' || range.node.type.name === 'table' && range.node.attrs.format === 'html') && step.from >= range.position && step.to <= range.end)) return null;
  if (!step.slice || step.slice.openStart || step.slice.openEnd || !Number.isInteger(step.from) || !Number.isInteger(step.to)) return null;
  const run = parsed.runs.find(item => step.from >= item.position && step.to <= item.position + item.text.length);
  if (!run) return null;
  let text = '';
  let valid = true;
  step.slice.content.forEach(node => {
    if (!node.isText || node.marks.some(mark => !transaction.before.resolve(step.from).marks().some(existing => existing.eq(mark)))) valid = false;
    text += node.text || '';
  });
  if (!valid || /[\n\r*_[\]`<>$\\]/.test(text)) return null;
  return { from: run.from + step.from - run.position, to: run.from + step.to - run.position, insert: text };
}

export function outlineOf(parsed) {
  return documentHeadings(parsed.doc).map(heading => {
    const range = parsed.ranges.find(item => item.position === heading.position);
    return { text: heading.text, level: heading.level, from: range?.from ?? sourcePosition(parsed, heading.position + 1), position: heading.position };
  });
}

export function documentHeadings(doc) {
  const headings = [];
  doc.descendants((node, position) => {
    if (node.type.name === 'heading') headings.push({ id: 'inklet_heading_' + (headings.length + 1), text: node.textContent, level: node.attrs.level, position });
    return node.type.name === 'html_block';
  });
  return headings;
}

export function documentAnchors(doc) {
  const anchors = [];
  let pending = [];
  doc.descendants((node, position) => {
    if (node.type.name === 'html_anchor') { const entry = { id: node.attrs.id, position }; anchors.push(entry); pending.push(entry); }
    else if (node.type.name === 'html_anchor_inline') anchors.push({ id: node.attrs.id, position: position + node.nodeSize });
    else if ((node.isTextblock && (node.textContent || node.childCount)) || node.type.name === 'mermaid' || node.type.name === 'table') {
      for (const entry of pending) entry.position = position + (node.isTextblock ? 1 : 0);
      pending = [];
    }
  });
  return anchors;
}

export function fragmentTarget(doc, href) {
  if (!href?.startsWith('#')) return null;
  let id;
  try { id = decodeURIComponent(href.slice(1)); } catch { return null; }
  const anchors = documentAnchors(doc).filter(entry => entry.id === id);
  if (anchors.length === 1) return anchors[0].position;
  if (anchors.length > 1) return null;
  const heading = documentHeadings(doc).find(entry => entry.id === id);
  return heading ? heading.position + 1 : null;
}

export function wordStatistics(doc) {
  const counts = { han: 0, letters: 0, numbers: 0, total: 0 };
  doc.descendants(node => {
    if (!node.isText) return;
    for (const match of node.text.matchAll(/[\p{L}\p{N}]/gu)) {
      const character = match[0];
      if (/\p{Script=Han}/u.test(character)) counts.han++;
      else if (/\p{N}/u.test(character)) counts.numbers++;
      else counts.letters++;
      counts.total++;
    }
  });
  return counts;
}

export function imageInsertion(source, from, to, attributes) {
  const parsed = parseDocument(source);
  const anchor = TextSelection.near(parsed.doc.resolve(prosePosition(parsed, from))).from;
  const head = TextSelection.near(parsed.doc.resolve(prosePosition(parsed, to))).from;
  const state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, anchor, head) });
  const image = schema.nodes.image.create({ src: attributes.src, alt: attributes.alt || '', title: attributes.title || null });
  const paragraph = schema.nodes.paragraph.create(null, image);
  const precedingImage = from === to && parsed.ranges.find(range => range.to === from && range.node.type.name === 'paragraph' && range.node.firstChild?.type.name === 'image');
  const transaction = precedingImage ? state.tr.insert(precedingImage.end, paragraph) : state.tr.replaceSelectionWith(paragraph, false);
  const change = richChange(source, parsed.doc, transaction.doc, parsed.ranges);
  const updated = parseDocument(change ? replaceText(source, change) : source);
  let imageIndex = 0;
  let insertedIndex = -1;
  transaction.doc.descendants(node => {
    if (node.type.name !== 'image') return;
    if (node === image) insertedIndex = imageIndex;
    imageIndex++;
  });
  imageIndex = 0;
  let cursor = updated.source.length;
  for (const range of updated.ranges) range.node.descendants(node => {
    if (node.type.name !== 'image') return;
    if (imageIndex === insertedIndex) cursor = range.to;
    imageIndex++;
  });
  return { change, cursor };
}