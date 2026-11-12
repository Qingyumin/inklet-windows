export function searchText(source, query, { sensitive = false, whole = false, limit = 5000 } = {}) {
  if (!query) return { matches: [], count: 0 };
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), sensitive ? 'gu' : 'giu');
  const matches = [];
  let count = 0;
  const isWord = character => !!character && /[\p{L}\p{N}_]/u.test(character);
  let found;
  while ((found = expression.exec(source)) !== null) {
    const from = found.index;
    const to = from + found[0].length;
    if (!whole || (!isWord(source[from - 1]) && !isWord(source[to]))) {
      count++;
      if (matches.length < limit) matches.push({ from, to });
    }
  }
  return { matches, count };
}

export function groupSearchMatches(matches, headings) {
  const groups = [];
  let headingIndex = -1;
  for (const [index, match] of matches.entries()) {
    while (headingIndex + 1 < headings.length && headings[headingIndex + 1].from <= match.from) headingIndex++;
    let group = groups.at(-1);
    if (!group || group.headingIndex !== headingIndex) {
      const heading = headings[headingIndex];
      group = { headingIndex, title: heading?.text || (heading ? '未命名标题' : '文档开头'), level: heading?.level || 0, firstMatch: index, lastMatch: index, count: 0 };
      groups.push(group);
    }
    group.lastMatch = index;
    group.count++;
  }
  return groups;
}

function contextSnippet(source, match) {
  if (typeof source !== 'string' || !match) return '';
  return source.slice(Math.max(0, match.from - 16), Math.min(source.length, match.to + 16)).replace(/\s+/g, ' ');
}

export function captureSearchCursor(source, matches, count, index) {
  const match = matches?.[index];
  if (!match || index < 0) return null;
  const next = matches[index + 1] || null;
  return {
    index,
    from: match.from,
    to: match.to,
    count: Number.isInteger(count) ? count : matches.length,
    context: contextSnippet(source, match),
    nextContext: next ? contextSnippet(source, next) : null,
    touched: false,
    consumed: false,
  };
}

export function mapSearchCursor(cursor, change) {
  if (!cursor || !change) return cursor;
  const delta = (change.insert?.length || 0) - (change.to - change.from);
  if (change.to <= cursor.from) {
    return { ...cursor, from: cursor.from + delta, to: cursor.to + delta };
  }
  if (change.from >= cursor.to) {
    return cursor;
  }
  return { ...cursor, touched: true };
}

export function resolveSearchCursor(source, matches, count, cursor) {
  if (!cursor || !matches?.length) return null;
  const total = Number.isInteger(count) ? count : matches.length;
  if (!cursor.touched && !cursor.consumed) {
    const exact = matches.findIndex(item => item.from === cursor.from && item.to === cursor.to);
    if (exact >= 0) return captureSearchCursor(source, matches, total, exact);
  }
  const index = Math.min(Math.max(0, cursor.index), matches.length);
  const candidate = matches[index];
  const candidateContext = candidate ? contextSnippet(source, candidate) : null;
  if (cursor.consumed) {
    if (candidate && candidateContext === cursor.context && total > cursor.count) {
      return captureSearchCursor(source, matches, total, index);
    }
    return { ...cursor, index, count: total, touched: false, consumed: true };
  }
  if (total < cursor.count && cursor.touched) {
    const shifted = !candidate
      || (cursor.nextContext && candidateContext === cursor.nextContext && candidateContext !== cursor.context)
      || (candidateContext !== cursor.context && candidate.from > cursor.from);
    if (shifted) {
      return { ...cursor, index, count: total, touched: false, consumed: true };
    }
  }
  const resolvedIndex = Math.min(cursor.index, matches.length - 1);
  return captureSearchCursor(source, matches, total, resolvedIndex);
}

export function stepSearchCursor(cursor, matchesLength, direction) {
  if (!matchesLength || matchesLength <= 0) return -1;
  if (!cursor || cursor.index < 0 || (!cursor.consumed && cursor.index >= matchesLength)) {
    return direction > 0 ? 0 : matchesLength - 1;
  }
  if (cursor.consumed) {
    if (direction > 0) return cursor.index < matchesLength ? cursor.index : 0;
    return (Math.min(cursor.index, matchesLength) - 1 + matchesLength) % matchesLength;
  }
  return (cursor.index + direction + matchesLength) % matchesLength;
}