/**
 * 証言の2つ目以降の出典の入力欄で使う、入力中の行と保存する出典の変換のテスト
 *
 * 保存済みの出典を入力中の行にし、入力中の行を保存する出典に戻すことと、
 * 資料の重なり・引用の秒数の誤りを、どの行のどの欄の誤りかとあわせて返すことを検証します。
 */
import { describe, expect, it } from 'vitest';
import { toClaimSources, toSourceRows, type SourceRow } from './OtherClaimSourcesField';

/** 入力中の行を作ります。指定しない欄は空です。 */
function row(key: string, fields: Partial<Omit<SourceRow, 'key'>> = {}): SourceRow {
  return { key, interviewId: '', viaPersonIds: [], quoteText: '', quoteSeconds: '', ...fields };
}

describe('toSourceRows', () => {
  it('保存済みの出典の資料・経由・引用・秒数を、入力中の行にする', () => {
    const rows = toSourceRows([
      { interviewId: 'interview-newspaper', viaPersonIds: ['person-newspaper'], quote: { text: '別荘は真っ暗だった', seconds: 95 } },
      { viaPersonIds: ['person-police'] },
    ]);

    expect(rows.map(({ key: _key, ...fields }) => fields)).toEqual([
      { interviewId: 'interview-newspaper', viaPersonIds: ['person-newspaper'], quoteText: '別荘は真っ暗だった', quoteSeconds: '95' },
      { interviewId: '', viaPersonIds: ['person-police'], quoteText: '', quoteSeconds: '' },
    ]);
    // 検証: 行を消しても入力欄が混ざらないよう、行ごとに異なる key を振る
    expect(new Set(rows.map((item) => item.key)).size).toBe(2);
  });
});

describe('toClaimSources', () => {
  it('入力中の行を、未入力の項目を持たない出典にする', () => {
    const result = toClaimSources(
      [
        row('row-newspaper', { interviewId: 'interview-newspaper', viaPersonIds: ['person-newspaper'], quoteText: '別荘は真っ暗だった', quoteSeconds: '95' }),
        row('row-police', { viaPersonIds: ['person-police'] }),
      ],
      undefined
    );

    expect(result).toEqual({
      sources: [
        { interviewId: 'interview-newspaper', viaPersonIds: ['person-newspaper'], quote: { text: '別荘は真っ暗だった', seconds: 95 } },
        { viaPersonIds: ['person-police'] },
      ],
    });
  });

  it('資料・経由・引用のどれも入力していない行は、出典にしない', () => {
    expect(toClaimSources([row('row-empty'), row('row-blank-quote', { quoteText: '  \n ' })], undefined)).toEqual({ sources: [] });
  });

  it('引用が空の行では、秒数を入力していても引用を持たせない', () => {
    expect(toClaimSources([row('row-newspaper', { interviewId: 'interview-newspaper', quoteSeconds: '95' })], undefined)).toEqual({
      sources: [{ interviewId: 'interview-newspaper', viaPersonIds: [] }],
    });
  });

  it('1つ目の出典や前の行と同じ資料を選んだ行に、資料の欄の誤りを返す', () => {
    const result = toClaimSources(
      [
        row('row-book', { interviewId: 'interview-book' }),
        row('row-newspaper', { interviewId: 'interview-newspaper' }),
        row('row-newspaper-again', { interviewId: 'interview-newspaper' }),
      ],
      'interview-book'
    );

    expect(result).toEqual({
      errors: {
        'row-book': { interview: 'この資料は、前の出典ですでに選んでいます。別の資料を選ぶか、この出典を外してください' },
        'row-newspaper-again': { interview: 'この資料は、前の出典ですでに選んでいます。別の資料を選ぶか、この出典を外してください' },
      },
    });
  });

  it.each(['1分35秒', '-1', '1.5'])('引用の秒数「%s」は、秒数の欄の誤りを返す', (quoteSeconds) => {
    const result = toClaimSources([row('row-video', { quoteText: '明かりは消えていた', quoteSeconds })], undefined);

    expect(result).toEqual({ errors: { 'row-video': { seconds: '引用の位置は、0以上の整数の秒数で入力してください' } } });
  });
});
