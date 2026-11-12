import { TableView, TableMap, columnResizingPluginKey } from 'prosemirror-tables';
import { tableColumnWidths } from './table-layout.js';

export class TableViewport {
  constructor(editor) {
    this.editor = editor;
    this.visible = new WeakSet();
    this.heights = new WeakMap();
    this.scrolls = new WeakMap();
    this.entries = new Map();
    this.frame = null;
    this.proximityFrame = null;
    this.resizeFrame = null;
    this.resizeItems = new Set();
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const item = this.entries.get(entry.target);
        if (item?.tableView) this.resizeItems.add(item);
      }
      if (this.resizeFrame === null) this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = null;
        const items = [...this.resizeItems]; this.resizeItems.clear();
        const changing = new Set(items);
        this.preserveScroll(() => {
          for (const item of items) if (item.dom.isConnected) this.fitColumns(item);
        }, changing);
      });
    });
    this.observer = new IntersectionObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        const item = this.entries.get(entry.target);
        if (!item) continue;
        const root = entry.rootBounds || editor.container.getBoundingClientRect();
        const nearby = entry.isIntersecting || (entry.boundingClientRect.bottom >= root.top - 1200 && entry.boundingClientRect.top <= root.bottom + 1200);
        if (nearby && !item.active) { this.visible.add(item.node); changed = true; }
      }
      if (changed) this.scheduleRefresh();
    }, { root: editor.container, rootMargin: '1200px 120px' });
    this.onContainerScroll = () => {
      if (this.proximityFrame !== null) return;
      this.proximityFrame = requestAnimationFrame(() => { this.proximityFrame = null; this.loadNearby(); });
    };
    editor.container.addEventListener('scroll', this.onContainerScroll, { passive: true });
  }

  markChangedTables() {
    let changed = false;
    for (const item of this.entries.values()) {
      if (this.active(item) !== item.active) {
        const desc = item.dom?.pmViewDesc;
        if (desc) {
          desc.dirty = 3;
          desc.markParentsDirty?.();
        }
        changed = true;
      }
    }
    return changed;
  }

  preserveScroll(work, changingItems = null) {
    const pane = this.editor.container;
    const prose = this.editor.view?.dom;
    if (!pane || !prose) { work(); return; }
    const paneRect = pane.getBoundingClientRect();
    const paneTop = paneRect.top;
    const paneBottom = paneRect.bottom;
    let anchor = null;
    let anchorTop = 0;
    for (const child of prose.children) {
      const item = this.entries.get(child);
      if (item && (this.active(item) !== item.active || changingItems?.has(item))) continue;
      const rect = child.getBoundingClientRect();
      if (rect.top >= paneTop - 4 && rect.top <= paneBottom) {
        anchor = child;
        anchorTop = rect.top;
        break;
      }
      if (rect.top < paneTop - 4 && rect.bottom > paneTop + 24) {
        const inner = child.querySelectorAll?.('tr, li, p, pre');
        if (inner?.length) {
          for (const sub of inner) {
            const subRect = sub.getBoundingClientRect();
            if (subRect.top >= paneTop - 4 && subRect.top <= paneBottom) {
              anchor = sub;
              anchorTop = subRect.top;
              break;
            }
          }
          if (anchor) break;
        }
      }
    }
    work();
    if (anchor?.isConnected) {
      const drift = anchor.getBoundingClientRect().top - anchorTop;
      if (Math.abs(drift) >= 1) pane.scrollTop += drift;
    }
  }

  flushRefresh() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    if (this.editor.view?.isDestroyed) return;
    this.markChangedTables();
    this.preserveScroll(() => {
      this.editor.refresh();
      for (const item of this.entries.values()) {
        if (item.active && item.tableView && item.dom.isConnected && item.fittedNode !== item.node) {
          this.fitColumns(item, true);
        }
      }
    });
  }

  scheduleRefresh() {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.flushRefresh();
    });
  }

  loadNearby() {
    const bounds = this.editor.container.getBoundingClientRect();
    if (!bounds.height && !bounds.width) return;
    let changed = false;
    for (const item of this.entries.values()) {
      if (!item.dom.isConnected) continue;
      const box = item.dom.getBoundingClientRect();
      if (item.active && box.height > 0) this.heights.set(item.node, box.height);
      const nearby = box.bottom >= bounds.top - 1200 && box.top <= bounds.bottom + 1200;
      if (!item.active && nearby) { this.visible.add(item.node); changed = true; }
      else if (item.active && this.editor.parsed.doc.content.size >= 200000 && !this.selected(item) && (box.bottom < bounds.top - 3000 || box.top > bounds.bottom + 3000)) {
        if (box.height > 0) this.heights.set(item.node, box.height);
        this.scrolls.set(item.node, item.dom.scrollLeft);
        if (this.visible.has(item.node)) { this.visible.delete(item.node); changed = true; }
      }
    }
    if (changed) this.scheduleRefresh();
  }

  selected(item, view = this.editor.view) {
    const position = item.getPos();
    const selection = view?.state.selection;
    if (position == null || !selection) return false;
    return [selection.anchor, selection.head].some(value => value > position && value < position + item.node.nodeSize);
  }

  active(item, view = this.editor.view) {
    if (this.editor.parsed.doc.content.size < 200000 || this.visible.has(item.node)) return true;
    if (this.selected(item, view)) {
      this.visible.add(item.node);
      return true;
    }
    return false;
  }

  fitColumns(item, force = false) {
    const width = item.dom.clientWidth || this.editor.view?.dom?.clientWidth || 0;
    if (!width || columnResizingPluginKey.getState(this.editor.view?.state)?.dragging) return;
    const fontSize = parseFloat(getComputedStyle(item.tableView.table).fontSize) || 14;
    if (!force && item.fittedNode === item.node && item.fittedWidth === width && item.fittedFont === fontSize) return;
    const left = item.dom.scrollLeft;
    const widths = tableColumnWidths(item.node, width, fontSize);
    for (const [index, column] of [...item.tableView.colgroup.children].entries()) column.style.width = widths[index] + 'px';
    const total = widths.reduce((sum, value) => sum + value, 0);
    item.tableView.table.style.width = total + 'px';
    item.tableView.table.style.minWidth = total + 'px';
    item.fittedNode = item.node; item.fittedWidth = width; item.fittedFont = fontSize;
    item.dom.scrollLeft = Math.min(left, Math.max(0, item.dom.scrollWidth - item.dom.clientWidth));
    const height = item.dom.getBoundingClientRect().height;
    if (height > 0) this.heights.set(item.node, height);
  }

  create(node, view, getPos) {
    const item = { node, getPos };
    item.active = this.active(item, view);
    const tableView = item.active ? new TableView(node, node.attrs.format === 'html' ? 120 : 80) : null;
    item.tableView = tableView;
    const dom = tableView?.dom || document.createElement('div');
    item.dom = dom;
    dom.classList.add('inklet-table');
    dom.dataset.tableFormat = node.attrs.format;
    dom.dataset.tableLoaded = String(item.active);
    if (!item.active) {
      dom.classList.add('table-placeholder');
      dom.contentEditable = 'false';
      dom.style.height = Math.max(100, this.heights.get(node) || node.childCount * 66) + 'px';
      const label = document.createElement('button');
      label.type = 'button'; label.className = 'table-load-button';
      label.textContent = `${node.childCount.toLocaleString()} 行 · ${TableMap.get(node).width} 列`;
      label.title = '显示表格';
      const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        this.visible.add(item.node);
        this.flushRefresh();
      };
      label.addEventListener('click', activate);
      dom.addEventListener('click', activate);
      dom.addEventListener('dblclick', activate);
      dom.append(label);
    } else {
      const saved = this.scrolls.get(node) || 0;
      const remember = () => this.scrolls.set(item.node, dom.scrollLeft);
      dom.addEventListener('pointerdown', remember, { passive: true });
      dom.addEventListener('scroll', remember, { passive: true });
      requestAnimationFrame(() => {
        if (dom.isConnected) {
          this.preserveScroll(() => {
            this.fitColumns(item, true);
            dom.scrollLeft = Math.min(saved, Math.max(0, dom.scrollWidth - dom.clientWidth));
          }, new Set([item]));
        }
      });
    }
    this.entries.set(dom, item);
    this.observer.observe(dom);
    if (tableView) this.resizeObserver.observe(dom);
    return {
      dom, contentDOM: tableView?.contentDOM,
      update: next => {
        if (next.type !== item.node.type) return false;
        if (next !== item.node) {
          if (this.visible.has(item.node)) this.visible.add(next);
          if (this.heights.has(item.node)) this.heights.set(next, this.heights.get(item.node));
          if (this.scrolls.has(item.node)) this.scrolls.set(next, this.scrolls.get(item.node));
        }
        item.node = next;
        if (this.active(item) !== item.active) return false;
        if (!tableView) return true;
        const left = dom.scrollLeft;
        const updated = tableView.update(next);
        if (updated) { this.fitColumns(item, true); dom.scrollLeft = Math.min(left, Math.max(0, dom.scrollWidth - dom.clientWidth)); }
        return updated;
      },
      ignoreMutation: mutation => tableView ? tableView.ignoreMutation(mutation) : mutation.type !== 'selection',
      stopEvent: event => !item.active && (event.type === 'click' || event.type === 'dblclick' || !!event.target.closest('button')),
      destroy: () => {
        if (item.active) {
          const height = dom.getBoundingClientRect().height;
          if (height > 0) this.heights.set(item.node, height);
          this.scrolls.set(item.node, dom.scrollLeft);
        }
        this.observer.unobserve(dom); this.resizeObserver.unobserve(dom); this.entries.delete(dom);
      },
    };
  }

  ensure(position) {
    let changed = false;
    for (const item of this.entries.values()) {
      const start = item.getPos();
      if (start == null || item.active) continue;
      const end = start + item.node.nodeSize;
      if (position >= start - 600 && position <= end + 300) {
        this.visible.add(item.node); changed = true;
      }
    }
    if (changed) this.flushRefresh();
    this.loadNearby();
  }

  destroy() {
    this.observer.disconnect(); this.resizeObserver.disconnect(); this.editor.container.removeEventListener('scroll', this.onContainerScroll);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.proximityFrame !== null) cancelAnimationFrame(this.proximityFrame);
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
    this.resizeItems.clear();
  }
}