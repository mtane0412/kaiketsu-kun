/**
 * 時刻参照（TimeRef）の解釈・並べ替え・食い違い判定のテスト
 */
import { describe, expect, it } from 'vitest';
import { compareTimeRef, isTimeConflict, isValidPartialIso, toInterval } from './time-ref';

describe('isValidPartialIso', () => {
  it.each(['1998', '1998-08', '1998-08-12', '1998-08-12T19:00'])(
    '精度の異なる表記「%s」を受け付ける',
    (value) => {
      expect(isValidPartialIso(value)).toBe(true);
    }
  );

  it.each(['1998年8月', '98-08-12', '1998-13', '1998-02-30', '1998-08-12T25:00', ''])(
    '解釈できない表記「%s」を拒否する',
    (value) => {
      expect(isValidPartialIso(value)).toBe(false);
    }
  );
});

describe('toInterval', () => {
  it('年だけの表記は、その年の最初から最後までの区間になる', () => {
    const interval = toInterval({ text: '2018年', earliest: '2018' });

    expect(interval).toEqual({
      start: Date.UTC(2018, 0, 1, 0, 0, 0, 0),
      end: Date.UTC(2018, 11, 31, 23, 59, 59, 999),
    });
  });

  it('earliestとlatestの両方がある場合は、earliestの始まりからlatestの終わりまでの区間になる', () => {
    const interval = toInterval({ text: '1995年7月頃', earliest: '1995-06', latest: '1995-08' });

    expect(interval).toEqual({
      start: Date.UTC(1995, 5, 1, 0, 0, 0, 0),
      end: Date.UTC(1995, 7, 31, 23, 59, 59, 999),
    });
  });

  it('earliestが無い時刻参照は区間を持たない', () => {
    expect(toInterval({ text: '第3話', order: 3 })).toBeNull();
  });

  it('latestがearliestより前の場合はエラーにする', () => {
    expect(() => toInterval({ text: '逆転した区間', earliest: '1998-08', latest: '1998-07' })).toThrow(
      'latest が earliest より前です'
    );
  });
});

describe('compareTimeRef', () => {
  it('日時を持つ時刻参照は、区間の始まりが早い順に並ぶ', () => {
    const 夜7時 = { text: '夜7時', earliest: '1998-08-12T19:00' };
    const 夜9時ごろ = { text: '夜9時ごろ', earliest: '1998-08-12T20:30', latest: '1998-08-12T21:30' };

    expect([夜9時ごろ, 夜7時].sort(compareTimeRef)).toEqual([夜7時, 夜9時ごろ]);
  });

  it('日時を持たない時刻参照は、orderの小さい順に並ぶ', () => {
    const 第10話 = { text: '第10話', order: 10 };
    const 十七年前の回想 = { text: '17年前', order: -100 };

    expect([第10話, 十七年前の回想].sort(compareTimeRef)).toEqual([十七年前の回想, 第10話]);
  });

  it('日時を持つもの、orderだけを持つもの、どちらも無いものの順に並ぶ', () => {
    const 日時あり = { text: '1998年8月12日', earliest: '1998-08-12' };
    const orderのみ = { text: '第3話', order: 3 };
    const 時期不明 = { text: '時期不明' };

    expect([時期不明, undefined, orderのみ, 日時あり].sort(compareTimeRef)).toEqual([
      日時あり,
      orderのみ,
      時期不明,
      undefined,
    ]);
  });
});

describe('isTimeConflict', () => {
  const 見立て = { text: '8月12日の夜', earliest: '1998-08-12T18:00', latest: '1998-08-12T23:59' };

  it('証言の時刻が見立ての区間に収まっていれば、食い違いではない', () => {
    const 証言 = { text: '夜9時ごろ', earliest: '1998-08-12T20:30', latest: '1998-08-12T21:30' };

    expect(isTimeConflict(証言, 見立て)).toBe(false);
  });

  it('証言の時刻が見立ての区間と重ならなければ、食い違いである', () => {
    const 証言 = { text: '翌朝', earliest: '1998-08-13T06:00' };

    expect(isTimeConflict(証言, 見立て)).toBe(true);
  });

  it('どちらかが日時を持たない場合は、食い違いと判定しない', () => {
    expect(isTimeConflict({ text: '夏の終わり' }, 見立て)).toBe(false);
    expect(isTimeConflict(undefined, 見立て)).toBe(false);
  });

  it('日時が無くorderだけを持つ同士は、orderが異なれば食い違いである', () => {
    expect(isTimeConflict({ text: '第3話', order: 3 }, { text: '第5話', order: 5 })).toBe(true);
    expect(isTimeConflict({ text: '第3話', order: 3 }, { text: '第3話の冒頭', order: 3 })).toBe(false);
  });
});
