import test from 'node:test';
import assert from 'node:assert/strict';
import { searchText, groupSearchMatches, captureSearchCursor, mapSearchCursor, resolveSearchCursor, stepSearchCursor } from '../src/search-engine.js';

test('search returns real positions, case selection and whole words', () => {
  assert.deepEqual(searchText('Alpha alpha alphabet', 'alpha').matches.map(match => match.from), [0, 6, 12]);
  assert.equal(searchText('Alpha alpha alphabet', 'alpha', { sensitive: true, whole: true }).count, 1);
});

test('large search counts every match without creating unlimited UI results', () => {
  const source = 'word '.repeat(200000);
  const result = searchText(source, 'word', { limit: 5000 });
  assert.equal(result.count, 200000);
  assert.equal(result.matches.length, 5000);
});

test('empty queries are bounded and Chinese phrases are searchable', () => {
  assert.equal(searchText('abc', '').count, 0);
  assert.equal(searchText('\u58a8\u70b9\u4e0e\u58a8\u70b9', '\u58a8\u70b9').count, 2);
});

test('Unicode case matching does not shift source positions or interpret regex syntax', () => {
  const source = '\u0130 BEFORE needle [.*] NEEDLE';
  const results = searchText(source, 'needle');
  assert.deepEqual(results.matches.map(match => source.slice(match.from, match.to)), ['needle', 'NEEDLE']);
  assert.equal(results.matches[0].from, source.indexOf('needle'));
  assert.equal(searchText(source, '[.*]').count, 1);
});

test('search results belong only to their nearest heading and keep duplicate sections separate', () => {
  const headings = [
    { from: 10, text: 'Parent', level: 1 },
    { from: 30, text: 'Detail', level: 3 },
    { from: 60, text: 'Parent', level: 1 },
  ];
  const matches = [2, 12, 17, 30, 42, 67].map(from => ({ from, to: from + 1 }));
  const groups = groupSearchMatches(matches, headings);
  assert.deepEqual(groups.map(group => [group.headingIndex, group.title, group.count]), [
    [-1, '\u6587\u6863\u5f00\u5934', 1], [0, 'Parent', 2], [1, 'Detail', 2], [2, 'Parent', 1],
  ]);
  assert.deepEqual(groups.map(group => [group.firstMatch, group.lastMatch]), [[0, 0], [1, 2], [3, 4], [5, 5]]);
  assert.deepEqual(groupSearchMatches([], headings), []);
});

test('search cursor continues from current match number after document edits instead of restarting at 1', () => {
  const initial = 'Row1: operationNumber | Row2: operationDescription | Row3: operationCode';
  const initialSearch = searchText(initial, 'op');
  assert.equal(initialSearch.count, 3);

  // User navigates to match #2 (index 1: operationDescription)
  let cursor = captureSearchCursor(initial, initialSearch.matches, initialSearch.count, 1);
  assert.equal(cursor.index, 1);

  // 1. Edit text after match #2: match #2 stays index 1, clicking Next advances to index 2 (match #3)
  const afterEditPos = initial.indexOf('operationDescription') + 'operationDescription'.length;
  const editedAfter = initial.slice(0, afterEditPos) + ' (edited)' + initial.slice(afterEditPos);
  cursor = mapSearchCursor(cursor, { from: afterEditPos, to: afterEditPos, insert: ' (edited)' });
  const searchAfter = searchText(editedAfter, 'op');
  cursor = resolveSearchCursor(editedAfter, searchAfter.matches, searchAfter.count, cursor);
  assert.equal(cursor.index, 1);
  assert.equal(cursor.consumed, false);
  assert.equal(stepSearchCursor(cursor, searchAfter.matches.length, 1), 2);
  assert.equal(stepSearchCursor(cursor, searchAfter.matches.length, -1), 0);

  // 2. Edit text before match #2 that inserts a new match: match #2 shifts to index 2, clicking Next advances to index 3
  const editedBefore = 'New op prefix | ' + editedAfter;
  cursor = mapSearchCursor(cursor, { from: 0, to: 0, insert: 'New op prefix | ' });
  const searchBefore = searchText(editedBefore, 'op');
  cursor = resolveSearchCursor(editedBefore, searchBefore.matches, searchBefore.count, cursor);
  assert.equal(cursor.index, 2);
  assert.equal(cursor.consumed, false);
  assert.equal(stepSearchCursor(cursor, searchBefore.matches.length, 1), 3);

  // 3. Edit match #2 itself so 'op' is removed: next match shifts into index 2, clicking Next lands on index 2 without skipping or resetting to 0
  const targetMatch = searchBefore.matches[2];
  const deletedCurrent = editedBefore.slice(0, targetMatch.from) + 'XX' + editedBefore.slice(targetMatch.to);
  cursor = mapSearchCursor(cursor, { from: targetMatch.from, to: targetMatch.to, insert: 'XX' });
  const searchDeleted = searchText(deletedCurrent, 'op');
  cursor = resolveSearchCursor(deletedCurrent, searchDeleted.matches, searchDeleted.count, cursor);
  assert.equal(cursor.consumed, true);
  assert.equal(stepSearchCursor(cursor, searchDeleted.matches.length, 1), 2);
  assert.equal(stepSearchCursor(cursor, searchDeleted.matches.length, -1), 1);
});