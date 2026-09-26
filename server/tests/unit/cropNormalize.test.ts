import { normalizeNameTh, levenshtein, findNearMatches } from '../../src/domain/cropNormalize';

describe('normalizeNameTh', () => {
  it('strips spaces and lowercases', () => {
    expect(normalizeNameTh('มะม่วง')).toBe('มะม่วง');
    expect(normalizeNameTh(' มะ ม่วง ')).toBe('มะม่วง');
  });

  it('removes hyphens and parentheses', () => {
    expect(normalizeNameTh('ผัก-กาด(ขาว)')).toBe('ผักกาดขาว');
  });
});

describe('levenshtein', () => {
  it('identical strings → 0', () => {
    expect(levenshtein('มะม่วง', 'มะม่วง')).toBe(0);
  });

  it('empty string → length of other', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });

  it('single substitution → 1', () => {
    expect(levenshtein('มะม่วง', 'มะม้วง')).toBe(1);
  });

  it('one insertion → 1', () => {
    expect(levenshtein('มะม่วง', 'มะม่วงน')).toBe(1);
  });

  it('two edits', () => {
    expect(levenshtein('กล้วย', 'กลวย')).toBe(1);
    expect(levenshtein('มะม่วง', 'มมวง')).toBe(2);
  });
});

describe('findNearMatches', () => {
  const existing = [
    { id: 1, name_th: 'มะม่วง', name_en: 'Mango' },
    { id: 2, name_th: 'กล้วยน้ำว้า', name_en: 'Banana' },
    { id: 3, name_th: 'มะละกอ', name_en: 'Papaya' },
    { id: 4, name_th: 'ทุเรียน', name_en: 'Durian' },
  ];

  it('exact match is returned', () => {
    const result = findNearMatches('มะม่วง', existing);
    expect(result.map((c) => c.id)).toContain(1);
  });

  it('near match (1 edit) is returned', () => {
    const result = findNearMatches('มะม้วง', existing);
    expect(result.map((c) => c.id)).toContain(1);
  });

  it('distant match (>2 edits) not returned', () => {
    const result = findNearMatches('แตงกวา', existing);
    expect(result).toHaveLength(0);
  });

  it('ignores spaces in query', () => {
    const result = findNearMatches('มะ ม่วง', existing);
    expect(result.map((c) => c.id)).toContain(1);
  });
});
