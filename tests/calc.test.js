import { describe, expect, it } from 'vitest';
import { display, evaluate, formatNumber, initialCalc, insert, press } from '../src/calc.js';

/** Types keys one after another: "12+3*4=" or with names: ['1', 'neg', '='] */
const type = (keys, s = initialCalc()) => (Array.isArray(keys) ? keys : keys.split('')).reduce(press, s);
const result = (keys) => display(type(keys)).result;

describe('everyday calculator', () => {
  it('does × and ÷ before + and −', () => {
    expect(result('12+3*4=')).toBe('24');
    expect(result('100-20/4=')).toBe('95');
    expect(result('7/2=')).toBe('3.5');
  });

  it('handles % the way you price things', () => {
    expect(result('200+10%=')).toBe('220');
    expect(result('200-10%=')).toBe('180');
    expect(result('200*15%=')).toBe('30');
    expect(result('50%=')).toBe('0.5');
    expect(result('50+20+10%=')).toBe('77');
  });

  it('shows the answer while you type, and ignores a trailing operator', () => {
    const s = type('1234.5+');
    expect(display(s)).toEqual({ expr: '1,234.5 +', result: '1,234.5', error: '' });
    expect(display(type('0.')).expr).toBe('0.');
  });

  it('avoids floating-point noise', () => {
    expect(result('0.1+0.2=')).toBe('0.3');
    expect(result('1.1*3=')).toBe('3.3');
  });

  it('keeps going from an answer, or starts fresh on a digit', () => {
    const s = type('2+3=');
    expect(display(s)).toEqual({ expr: '2 + 3 =', result: '5', error: '' });
    expect(result([...'2+3=', '*', '2', '='])).toBe('10');
    expect(display(press(s, '9')).result).toBe('9');
  });

  it('± flips the number being typed', () => {
    expect(result(['5', 'neg', '+', '2', '='])).toBe('-3');
    expect(result(['1', '0', '-', '4', 'neg', '='])).toBe('14');
  });

  it('⌫ removes the last thing typed, C clears', () => {
    expect(display(type(['1', '2', '3', 'back'])).result).toBe('12');
    expect(display(type(['1', '+', 'back'])).expr).toBe('1');
    expect(display(type(['1', '+', '2', 'clear']))).toEqual({ expr: '', result: '0', error: '' });
  });

  it('ignores impossible input instead of breaking', () => {
    expect(display(type('1..5')).expr).toBe('1.5');
    expect(display(type('5+*2=')).result).toBe('10');
    expect(display(type('007')).expr).toBe('7');
    expect(display(type('5%3')).expr).toBe('5%');
  });

  it("says when it can't divide by 0, and = leaves the screen as is", () => {
    const s = type('8/0');
    expect(display(s).error).toBe("Can't divide by 0");
    expect(press(s, '=')).toBe(s);
    expect(evaluate(['8', '/', '0']).error).toBeTruthy();
  });

  it('puts in a bucket number (market value, offer, paid)', () => {
    expect(display(insert(initialCalc(), 2074.27)).result).toBe('2,074.27');
    expect(result([...'', '=']) || '0').toBe('0');
    const s = insert(type('*'.padStart(1, '*')), 1451.99);
    expect(display(s).expr).toBe('0 × 1,451.99');
    expect(display(press(insert(type('100+5'), 20), '=')).result).toBe('120');
  });

  it('formats big and small numbers readably', () => {
    expect(formatNumber(1234567.891)).toBe('1,234,567.891');
    expect(formatNumber(2e16)).toMatch(/e\+16/);
    expect(formatNumber(-0.5)).toBe('-0.5');
  });
});
