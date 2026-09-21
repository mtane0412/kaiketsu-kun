/**
 * 入力欄に書かれた日時の表記の解釈のテスト
 */
import { describe, expect, it } from 'vitest';
import { parseDateInput } from './date-input';

describe('parseDateInput', () => {
  it.each([
    ['1998', '1998'],
    ['1998-08', '1998-08'],
    ['1998-08-12', '1998-08-12'],
    ['1998-08-12T19:00', '1998-08-12T19:00'],
  ])('ISO 8601の部分表記「%s」をそのまま解釈する', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected);
  });

  it.each([
    ['1998/8', '1998-08'],
    ['1998/8/12', '1998-08-12'],
    ['1998/8/12T19:05', '1998-08-12T19:05'],
  ])('スラッシュ区切りの「%s」を部分表記「%s」に整える', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected);
  });

  it.each([
    ['1998年', '1998'],
    ['1998年8月', '1998-08'],
    ['1998年8月12日', '1998-08-12'],
    ['1998年8月12日19時', '1998-08-12T19:00'],
    ['1998年8月12日19時05分', '1998-08-12T19:05'],
  ])('日本語の表記「%s」を部分表記「%s」に整える', (input, expected) => {
    expect(parseDateInput(input)).toBe(expected);
  });

  it('全角の数字も半角として解釈する', () => {
    expect(parseDateInput('１９９８年８月１２日')).toBe('1998-08-12');
  });

  it.each(['8月12日', '1998-13', '1998-02-30', '1998-08-12T25:00', '湖畔の別荘', '', '19:00'])(
    '日時として解釈できない「%s」は null を返す',
    (input) => {
      expect(parseDateInput(input)).toBeNull();
    }
  );
});
