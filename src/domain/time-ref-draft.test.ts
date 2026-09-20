/**
 * 時刻入力欄の入力値（文字列）と TimeRef の相互変換のテスト
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_TIME_REF_DRAFT, draftToTimeRef, timeRefToDraft } from './time-ref-draft';

describe('draftToTimeRef', () => {
  it('すべて空欄の場合は、時刻参照なしとして扱う', () => {
    expect(draftToTimeRef(EMPTY_TIME_REF_DRAFT)).toEqual({ ok: true, value: undefined });
  });

  it('入力された項目だけを持つ時刻参照を作る', () => {
    const result = draftToTimeRef({ text: '1995年7月頃', earliest: '1995-06', latest: '1995-08', order: '' });

    expect(result).toEqual({ ok: true, value: { text: '1995年7月頃', earliest: '1995-06', latest: '1995-08' } });
  });

  it('表記が空欄の場合は、最も早い時点の入力値を表記として使う', () => {
    const result = draftToTimeRef({ text: '', earliest: '1998-08-12', latest: '', order: '' });

    expect(result).toEqual({ ok: true, value: { text: '1998-08-12', earliest: '1998-08-12' } });
  });

  it('並び順だけを入力した場合は、orderを持つ時刻参照を作る', () => {
    const result = draftToTimeRef({ text: '第3話', earliest: '', latest: '', order: '3' });

    expect(result).toEqual({ ok: true, value: { text: '第3話', order: 3 } });
  });

  it('解釈できない日時の表記は、入力例を添えたエラーにする', () => {
    const result = draftToTimeRef({ text: '', earliest: '1998年8月', latest: '', order: '' });

    expect(result).toEqual({
      ok: false,
      error: '「最も早い時点」は 1998 / 1998-08 / 1998-08-12 / 1998-08-12T19:00 のいずれかの形式で入力してください',
    });
  });

  it('最も遅い時点だけを入力した場合はエラーにする', () => {
    const result = draftToTimeRef({ text: '', earliest: '', latest: '1998-08', order: '' });

    expect(result).toEqual({ ok: false, error: '「最も遅い時点」を入力する場合は「最も早い時点」も入力してください' });
  });

  it('最も遅い時点が最も早い時点より前の場合はエラーにする', () => {
    const result = draftToTimeRef({ text: '', earliest: '1998-08', latest: '1998-07', order: '' });

    expect(result).toEqual({ ok: false, error: '「最も遅い時点」は「最も早い時点」以降にしてください' });
  });

  it('数値でない並び順はエラーにする', () => {
    const result = draftToTimeRef({ text: '第3話', earliest: '', latest: '', order: '三' });

    expect(result).toEqual({ ok: false, error: '「並び順」は数値で入力してください' });
  });
});

describe('timeRefToDraft', () => {
  it('時刻参照を入力欄の値に戻す', () => {
    expect(timeRefToDraft({ text: '第3話', order: 3 })).toEqual({ text: '第3話', earliest: '', latest: '', order: '3' });
  });

  it('時刻参照が無い場合は、すべて空欄にする', () => {
    expect(timeRefToDraft(undefined)).toEqual(EMPTY_TIME_REF_DRAFT);
  });
});
