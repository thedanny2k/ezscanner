import { describe, expect, it } from 'vitest';
import { confidence, guessName, numFromAi, numberVariants, parseNumber, scoreCards, splitQuery } from '../src/match.js';

describe('parseNumber (reading the collector number from OCR text)', () => {
  const cases = [
    ['G  SVI EN  025/198', ['025', 198]],
    ['blah 4/102 ©1999', ['4', 102]],
    ['TG05/TG30', ['05', 30]],
    ['SVI025/l98', ['025', 198]], // "l" misread for "1", set code glued on
    ['O25 / 198', ['025', 198]], // "O" misread for "0"
    ['GG01/GG70', ['01', 70]],
    ['SV49/SV94', ['49', 94]],
  ];
  it.each(cases)('%s', (text, [digits, total]) => {
    const r = parseNumber(text);
    expect(r).not.toBeNull();
    expect(r.digits).toBe(digits);
    expect(r.total).toBe(total);
  });

  it.each(['©2023 Pokemon/Nintendo', '10 damage', '', 'HP 60'])('finds nothing in %j', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe('numFromAi', () => {
  it('splits prefix, digits and total', () => {
    expect(numFromAi('TG05', 'TG30')).toMatchObject({ prefix: 'TG', digits: '05', total: 30, label: 'TG05/TG30' });
    expect(numFromAi('025', '198')).toMatchObject({ prefix: '', digits: '025', total: 198 });
  });
  it('handles promos with no total', () => {
    expect(numFromAi('SWSH050', null)).toMatchObject({ prefix: 'SWSH', digits: '050', total: null });
  });
  it('rejects junk', () => {
    expect(numFromAi('??', '1')).toBeNull();
  });
});

describe('numberVariants', () => {
  it('covers zero-padded and stripped spellings', () => {
    expect(numberVariants(numFromAi('025', '198'))).toEqual(expect.arrayContaining(['25', '025']));
    expect(numberVariants(numFromAi('TG5', 'TG30'))).toEqual(expect.arrayContaining(['TG5', 'TG05']));
  });
});

describe('splitQuery (typed search)', () => {
  it('separates name and number', () => {
    const { num, name } = splitQuery('charizard 4/102');
    expect(name).toBe('charizard');
    expect(num).toMatchObject({ digits: '4', total: 102 });
  });
  it('name only', () => {
    expect(splitQuery('umbreon vmax')).toEqual({ num: null, name: 'umbreon vmax' });
  });
});

describe('guessName', () => {
  it('skips stage words and HP', () => {
    expect(guessName('BASIC Pikachu ex HP 200')).toBe('Pikachu');
  });
});

const card = (over) => ({ name: 'Pikachu', number: '25', printedTotal: 198, setName: 'Scarlet & Violet', setCode: 'SVI', releaseDate: '2023/03/31', prices: { normal: { market: 0.18 } }, ...over });

describe('scoreCards + confidence', () => {
  const pikachu = card();
  const centiskorch = card({ name: 'Centiskorch', setName: 'Chilling Reign', setCode: 'CRE', releaseDate: '2021/06/18' });

  it('ranks the card whose name and set code match first', () => {
    const scored = scoreCards([centiskorch, pikachu], { text: 'Pikachu SVI', name: 'Pikachu', setCode: 'SVI', num: numFromAi('025', '198') });
    expect(scored[0].c.name).toBe('Pikachu');
    expect(confidence(scored)).toBe(99);
  });

  it('caps confidence when two candidates tie', () => {
    const scored = scoreCards([centiskorch, pikachu], { text: '', num: numFromAi('025', '198') });
    expect(confidence(scored)).toBeLessThanOrEqual(55);
  });

  it('caps confidence when the AI says the number was hard to read', () => {
    const scored = scoreCards([pikachu], { text: 'Pikachu', name: 'Pikachu', setCode: 'SVI', num: numFromAi('025', '198') });
    expect(confidence(scored, 'low')).toBe(60);
  });
});
