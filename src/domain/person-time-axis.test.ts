/**
 * 人物の動きビューの時刻軸（人物ごとの証言の帯・目盛り・表示範囲）のテスト
 */
import { describe, expect, it } from 'vitest';
import { buildPersonTimeAxis, buildTimeTicks, placeInRange, resolveAxisRange } from './person-time-axis';
import { sampleFictionalCase } from './sample-fictional-case';
import { toInterval } from './time-ref';
import type { Case, Claim, TimeRef } from './types';

/** 散歩していた人物（person-walker）の発言としての証言を作ります。 */
function makeWalkClaim(id: string, when?: TimeRef): Claim {
  const claim: Claim = {
    id,
    speaker: { kind: 'person', personIds: ['person-walker'] },
    viaPersonIds: [],
    content: `${id}の内容`,
    mentionedPersonIds: [],
  };
  if (when) claim.when = when;
  return claim;
}

function makeWalkCase(claims: Claim[]): Case {
  return {
    id: 'case-lakeside',
    name: '湖畔の別荘の失踪',
    persons: [{ id: 'person-walker', name: '散歩していた人', kind: 'individual' }],
    places: [],
    claims,
    relationships: [],
    interviews: [],
    crossChecks: [],
    hypotheses: [],
    tasks: [],
    timelineOrder: [],
    personLaneOrder: [],
  };
}

describe('buildPersonTimeAxis', () => {
  it('人物ごとの列に、日時を持つ証言を、その区間と役割の帯として並べる', () => {
    const axis = buildPersonTimeAxis(sampleFictionalCase);

    const caretakerBand = axis.bandsByPerson['person-caretaker'];
    expect(caretakerBand).toEqual([
      expect.objectContaining({
        role: 'speaker',
        interval: toInterval('1998-08-12T19:00'),
        column: 0,
        columnCount: 1,
      }),
    ]);
    expect(caretakerBand?.[0]?.view.claim.id).toBe('claim-caretaker');
  });

  it('日時を持つ証言が無い人物も列に残し、帯を持たない（所在の分からない人物として見せるため）', () => {
    const axis = buildPersonTimeAxis(sampleFictionalCase);

    // 前提: 架空日報 朝刊の登場する証言は、日時を述べていない
    expect(axis.lanes.map((lane) => lane.label)).toContain('架空日報 朝刊');
    expect(axis.bandsByPerson['person-newspaper']).toEqual([]);
  });

  it('人物が登場するが日時を持たない証言の件数を数える', () => {
    const axis = buildPersonTimeAxis(sampleFictionalCase);

    // 前提: サンプルでは、架空日報の記事とユーザーの推測の2件が、人物に言及しつつ日時を述べない
    expect(axis.undatedCount).toBe(2);
  });

  it('すべての帯を含む区間を、時刻軸の全体の範囲として返す', () => {
    const axis = buildPersonTimeAxis(sampleFictionalCase);

    expect(axis.extent).toEqual({
      start: toInterval('1998-08-12T19:00').start,
      end: toInterval('1998-08-12T21:00').end,
    });
  });

  it('日時を持つ証言が1件も無い場合は、全体の範囲を null にする', () => {
    const axis = buildPersonTimeAxis(makeWalkCase([makeWalkClaim('claim-undated')]));

    expect(axis.extent).toBeNull();
  });

  it('同じ列で重なる帯は、横に並ぶよう別々の位置（column）に置く', () => {
    const axis = buildPersonTimeAxis(
      makeWalkCase([
        makeWalkClaim('claim-walking', '2026-09-28T19:10/19:40'),
        makeWalkClaim('claim-at-shop', '2026-09-28T19:30'),
        makeWalkClaim('claim-at-home', '2026-09-28T20:00'),
      ])
    );

    const position = Object.fromEntries(
      (axis.bandsByPerson['person-walker'] ?? []).map((band) => [band.view.claim.id, [band.column, band.columnCount]])
    );
    // 検証: 19:10〜19:40 と 19:30 は重なるため別の位置に、重ならない 20:00 は空いた最初の位置に置く
    expect(position).toEqual({
      'claim-walking': [0, 2],
      'claim-at-shop': [1, 2],
      'claim-at-home': [0, 2],
    });
  });
});

describe('buildTimeTicks', () => {
  it('1時間の範囲には10分ごとの目盛りを置き、最初の目盛りにだけ日付を添える', () => {
    const ticks = buildTimeTicks({ start: Date.UTC(2026, 8, 28, 19, 0), end: Date.UTC(2026, 8, 28, 20, 0) });

    expect(ticks.map((tick) => tick.label)).toEqual([
      '9月28日 19:00',
      '19:10',
      '19:20',
      '19:30',
      '19:40',
      '19:50',
      '20:00',
    ]);
    expect(ticks[1]?.at).toBe(Date.UTC(2026, 8, 28, 19, 10));
  });

  it('日付が変わる目盛りには、日付を添える', () => {
    const ticks = buildTimeTicks({ start: Date.UTC(2026, 8, 28, 23, 0), end: Date.UTC(2026, 8, 29, 1, 0) });

    expect(ticks.map((tick) => tick.label)).toContain('9月29日 00:00');
    expect(ticks.map((tick) => tick.label)).toContain('00:15');
  });

  it('日の範囲には日ごとの目盛りを置き、最初の目盛りにだけ年を添える', () => {
    const ticks = buildTimeTicks({ start: Date.UTC(1998, 7, 1), end: Date.UTC(1998, 7, 10) });

    expect(ticks.map((tick) => tick.label)).toEqual([
      '1998年8月1日',
      '8月2日',
      '8月3日',
      '8月4日',
      '8月5日',
      '8月6日',
      '8月7日',
      '8月8日',
      '8月9日',
      '8月10日',
    ]);
  });

  it('月の範囲には、月の初めに目盛りを置く', () => {
    const ticks = buildTimeTicks({ start: Date.UTC(1998, 0, 1), end: Date.UTC(1998, 11, 31) });

    expect(ticks.map((tick) => tick.label)).toEqual([
      '1998年1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ]);
  });

  it('年の範囲には、目盛りが多すぎないよう間隔を空けた年の初めに目盛りを置く', () => {
    const ticks = buildTimeTicks({ start: Date.UTC(1990, 0, 1), end: Date.UTC(2020, 0, 1) });

    expect(ticks.map((tick) => tick.label)).toEqual(['1990年', '1995年', '2000年', '2005年', '2010年', '2015年', '2020年']);
  });
});

describe('resolveAxisRange', () => {
  const whole = toInterval('1998-08-12T19:00/21:00');
  const focus = toInterval('1998-08-12T19:30/19:59');
  const specified = toInterval('1998-08-12');

  it('表示する範囲を指定した場合は、その範囲にする', () => {
    expect(resolveAxisRange(whole, focus, specified)).toEqual(specified);
  });

  it('範囲を指定せず、注目する時間帯を指定した場合は、その前後に同じ長さの半分ずつ余白を足した範囲にする', () => {
    const half = (focus.end - focus.start) / 2;

    expect(resolveAxisRange(whole, focus, null)).toEqual({ start: focus.start - half, end: focus.end + half });
  });

  it('どちらも指定しない場合は、すべての帯を含む範囲にする', () => {
    expect(resolveAxisRange(whole, null, null)).toEqual(whole);
  });

  it('帯が無く、何も指定しない場合は null を返す', () => {
    expect(resolveAxisRange(null, null, null)).toBeNull();
  });
});

describe('placeInRange', () => {
  const from7To9pm = { start: Date.UTC(1998, 7, 12, 19), end: Date.UTC(1998, 7, 12, 21) };

  it('範囲の中の区間は、範囲の上端からの割合で、上端と下端の位置を返す', () => {
    const from730To8 = { start: Date.UTC(1998, 7, 12, 19, 30), end: Date.UTC(1998, 7, 12, 20) };

    expect(placeInRange(from730To8, from7To9pm)).toEqual({ top: 0.25, bottom: 0.5 });
  });

  it('範囲からはみ出す区間は、範囲の端で切る', () => {
    const from6To8 = { start: Date.UTC(1998, 7, 12, 18), end: Date.UTC(1998, 7, 12, 20) };

    expect(placeInRange(from6To8, from7To9pm)).toEqual({ top: 0, bottom: 0.5 });
  });

  it('範囲と重ならない区間は null を返す', () => {
    const at10pm = { start: Date.UTC(1998, 7, 12, 22), end: Date.UTC(1998, 7, 12, 22, 0, 59, 999) };

    expect(placeInRange(at10pm, from7To9pm)).toBeNull();
  });
});
