/**
 * 時刻参照（TimeRef）の解釈・表示・並べ替えのテスト
 */
import { describe, expect, it } from 'vitest';
import { compareTimeRef, formatTimeRef, isValidTimeRef, toInterval } from './time-ref';

describe('isValidTimeRef', () => {
  it.each(['1998', '1998-08', '1998-08-12', '1998-08-12T19:00'])(
    '精度の異なる表記「%s」を受け付ける',
    (value) => {
      expect(isValidTimeRef(value)).toBe(true);
    }
  );

  it.each(['1998年8月', '98-08-12', '1998-13', '1998-02-30', '1998-08-12T25:00', ''])(
    '解釈できない表記「%s」を拒否する',
    (value) => {
      expect(isValidTimeRef(value)).toBe(false);
    }
  );
});

describe('toInterval', () => {
  it('年だけの表記は、その年の最初から最後までの区間になる', () => {
    expect(toInterval('2018')).toEqual({
      start: Date.UTC(2018, 0, 1, 0, 0, 0, 0),
      end: Date.UTC(2018, 11, 31, 23, 59, 59, 999),
    });
  });

  it('月までの表記は、その月の最初から最後までの区間になる', () => {
    expect(toInterval('1995-06')).toEqual({
      start: Date.UTC(1995, 5, 1, 0, 0, 0, 0),
      end: Date.UTC(1995, 5, 30, 23, 59, 59, 999),
    });
  });

  it('分までの表記は、その1分間の区間になる', () => {
    expect(toInterval('1998-08-12T19:00')).toEqual({
      start: Date.UTC(1998, 7, 12, 19, 0, 0, 0),
      end: Date.UTC(1998, 7, 12, 19, 0, 59, 999),
    });
  });

  it('解釈できない表記はエラーにする', () => {
    expect(() => toInterval('1998年8月')).toThrow('日時を解釈できません: 1998年8月');
  });
});

describe('formatTimeRef', () => {
  it.each([
    ['1998', '1998年'],
    ['1998-08', '1998年8月'],
    ['1998-08-12', '1998年8月12日'],
    ['1998-08-12T19:00', '1998年8月12日 19:00'],
  ])('表記「%s」を「%s」と表示する', (value, expected) => {
    expect(formatTimeRef(value)).toBe(expected);
  });
});

describe('compareTimeRef', () => {
  it('区間の始まりが早い順に並ぶ', () => {
    const 夜7時 = '1998-08-12T19:00';
    const 夜9時 = '1998-08-12T21:00';

    expect([夜9時, 夜7時].sort(compareTimeRef)).toEqual([夜7時, 夜9時]);
  });

  it('区間の始まりが同じ場合は、精度の細かい（区間の終わりが早い）ものが先に並ぶ', () => {
    const その年 = '1998';
    const その年の元日 = '1998-01-01';

    expect([その年, その年の元日].sort(compareTimeRef)).toEqual([その年の元日, その年]);
  });

  it('日時を持たないものは、日時を持つものの後ろに並ぶ', () => {
    const 日時あり = '1998-08-12';

    expect([undefined, 日時あり].sort(compareTimeRef)).toEqual([日時あり, undefined]);
  });
});
