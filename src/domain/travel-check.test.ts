/**
 * 人物の移動の確認（2地点間の直線距離・時刻の差・概算所要時間）のテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from './sample-fictional-case';
import { buildPersonTravel, distanceMeters, formatDistance, formatDuration } from './travel-check';
import { MINUTE_MS } from './time-ref';
import type { Case, Claim } from './types';

describe('distanceMeters', () => {
  it('同じ地点同士の距離は0メートル', () => {
    const 地点 = { latitude: 35.5, longitude: 138.75 };

    expect(distanceMeters(地点, 地点)).toBe(0);
  });

  it('経度が同じで緯度が1度違う2地点の距離は、約111.2キロメートル', () => {
    const 南 = { latitude: 35, longitude: 139 };
    const 北 = { latitude: 36, longitude: 139 };

    expect(distanceMeters(南, 北)).toBeCloseTo(111_195, -1);
  });

  it('東京駅と大阪駅の直線距離は、約400キロメートル', () => {
    const 東京駅 = { latitude: 35.6812, longitude: 139.7671 };
    const 大阪駅 = { latitude: 34.7025, longitude: 135.4959 };

    const 距離 = distanceMeters(東京駅, 大阪駅);

    expect(距離).toBeGreaterThan(400_000);
    expect(距離).toBeLessThan(406_000);
  });

  it('2地点を入れ替えても距離は変わらない', () => {
    const a = { latitude: 35.6812, longitude: 139.7671 };
    const b = { latitude: 35.6909, longitude: 139.7003 };

    expect(distanceMeters(a, b)).toBe(distanceMeters(b, a));
  });
});

describe('formatDistance', () => {
  it('1キロメートル未満はメートルで、10メートル単位に丸めて表示する', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(853)).toBe('850 m');
  });

  it('1キロメートル以上はキロメートルで、小数第1位まで表示する', () => {
    expect(formatDistance(1_000)).toBe('1.0 km');
    expect(formatDistance(11_119.5)).toBe('11.1 km');
  });
});

describe('formatDuration', () => {
  it('1分未満は「1分未満」と表示する', () => {
    expect(formatDuration(0)).toBe('1分未満');
    expect(formatDuration(59 * 1000)).toBe('1分未満');
  });

  it('1時間未満は分で、1日未満は時間と分で表示する', () => {
    expect(formatDuration(5 * MINUTE_MS)).toBe('5分');
    expect(formatDuration(60 * MINUTE_MS)).toBe('1時間0分');
    expect(formatDuration(139 * MINUTE_MS)).toBe('2時間19分');
  });

  it('1日以上は日と時間で表示する', () => {
    expect(formatDuration((24 * 60 + 90) * MINUTE_MS)).toBe('1日1時間');
  });
});

/** 別荘の持ち主に言及する証言を作ります。 */
function 持ち主に言及する証言(id: string, fields: Partial<Claim>): Claim {
  return {
    id,
    speaker: { kind: 'person', personIds: ['person-neighbor'] },
    viaPersonIds: [],
    content: `${id}の本文`,
    mentionedPersonIds: ['person-owner'],
    ...fields,
  };
}

/**
 * 別荘の持ち主の移動を確かめるためのケースです。
 * 湖畔の別荘と、その真北に緯度0.1度（約11.1キロメートル）離れた駅前に座標があり、県道の交差点には座標がありません。
 * 時系列の並び順（timelineOrder）は、日時の順とわざと逆にしています。
 */
const 移動を確かめるケース: Case = {
  ...sampleFictionalCase,
  places: [
    { id: 'place-villa', name: '湖畔の別荘', latitude: 35.5, longitude: 138.75 },
    { id: 'place-station', name: '駅前', latitude: 35.6, longitude: 138.75 },
    { id: 'place-crossing', name: '県道の交差点' },
  ],
  claims: [
    持ち主に言及する証言('claim-villa-1900', { when: '2026-09-28T19:00', placeId: 'place-villa' }),
    // 11.1kmを30分: 車（時速40km、約17分）なら間に合い、徒歩・自転車では間に合わない
    持ち主に言及する証言('claim-station-1930', { when: '2026-09-28T19:30', placeId: 'place-station' }),
    // 11.1kmを10分: 車でも間に合わない
    持ち主に言及する証言('claim-villa-1940', { when: '2026-09-28T19:40', placeId: 'place-villa' }),
    持ち主に言及する証言('claim-no-when', { placeId: 'place-villa' }),
    持ち主に言及する証言('claim-no-place', { when: '2026-09-28T19:10' }),
    持ち主に言及する証言('claim-no-coordinates', { when: '2026-09-28T19:20', placeId: 'place-crossing' }),
    // 持ち主は証言を伝えただけで、動きの主体ではない
    {
      id: 'claim-via-owner',
      speaker: { kind: 'person', personIds: ['person-neighbor'] },
      viaPersonIds: ['person-owner'],
      content: '持ち主を経由した証言',
      mentionedPersonIds: [],
      when: '2026-09-28T19:05',
      placeId: 'place-station',
    },
    // 持ち主が発言者の証言は、持ち主に関係する証言に含める
    {
      id: 'claim-owner-speaks',
      speaker: { kind: 'person', personIds: ['person-owner'] },
      viaPersonIds: [],
      content: '持ち主の発言',
      mentionedPersonIds: [],
      when: '2026-09-28T21:00',
      placeId: 'place-villa',
    },
  ],
  timelineOrder: [
    'claim:claim-owner-speaks',
    'claim:claim-villa-1940',
    'claim:claim-station-1930',
    'claim:claim-villa-1900',
  ],
};

describe('buildPersonTravel', () => {
  it('人物が発言者か言及された証言のうち、日時と座標のある証言を、日時の順に地点として並べる', () => {
    const travel = buildPersonTravel(移動を確かめるケース, 'person-owner');

    expect(travel.stops.map((stop) => [stop.order, stop.view.claim.id, stop.place.name])).toEqual([
      [1, 'claim-villa-1900', '湖畔の別荘'],
      [2, 'claim-station-1930', '駅前'],
      [3, 'claim-villa-1940', '湖畔の別荘'],
      [4, 'claim-owner-speaks', '湖畔の別荘'],
    ]);
  });

  it('日時・場所・座標の無い証言は、理由と共に計算の対象から外す（経由しただけの証言は含めない）', () => {
    const travel = buildPersonTravel(移動を確かめるケース, 'person-owner');

    expect(travel.excluded.map((item) => [item.view.claim.id, item.reason])).toEqual([
      ['claim-no-when', 'no-when'],
      ['claim-no-place', 'no-place'],
      ['claim-no-coordinates', 'no-coordinates'],
    ]);
  });

  it('隣り合う2地点ごとに、直線距離・時刻の差・移動手段ごとの概算所要時間を求める', () => {
    const [駅前へ] = buildPersonTravel(移動を確かめるケース, 'person-owner').legs;

    expect(駅前へ?.from.view.claim.id).toBe('claim-villa-1900');
    expect(駅前へ?.to.view.claim.id).toBe('claim-station-1930');
    expect(駅前へ?.distanceMeters).toBeCloseTo(11_119, -1);
    expect(駅前へ?.minGapMs).toBe(30 * MINUTE_MS);
    expect(駅前へ?.maxGapMs).toBe(30 * MINUTE_MS);
    expect(駅前へ?.estimates.map((estimate) => [estimate.label, Math.round(estimate.requiredMs / MINUTE_MS), estimate.feasible])).toEqual([
      ['徒歩', 139, false],
      ['自転車', 44, false],
      ['車', 17, true],
    ]);
    expect(駅前へ?.feasibleByAny).toBe(true);
  });

  it('最も速い移動手段でも時刻の差を上回る区間は、どの手段でも移動できない区間とする', () => {
    const [, 別荘へ戻る] = buildPersonTravel(移動を確かめるケース, 'person-owner').legs;

    expect(別荘へ戻る?.maxGapMs).toBe(10 * MINUTE_MS);
    expect(別荘へ戻る?.estimates.every((estimate) => !estimate.feasible)).toBe(true);
    expect(別荘へ戻る?.feasibleByAny).toBe(false);
  });

  it('同じ地点に留まる区間は、距離0で移動できる区間とする', () => {
    const 最後の区間 = buildPersonTravel(移動を確かめるケース, 'person-owner').legs.at(-1);

    expect(最後の区間?.distanceMeters).toBe(0);
    expect(最後の区間?.feasibleByAny).toBe(true);
  });

  it('日時に幅がある場合は、最も短い時刻の差と、最も移動しやすい場合の時刻の差を求め、後者で判定する', () => {
    // 前提: 19:00〜19:20のどこかで別荘、19:40〜19:50のどこかで駅前にいた。最短20分・最長50分で、自転車（約44分）なら間に合う
    const ケース: Case = {
      ...移動を確かめるケース,
      claims: [
        持ち主に言及する証言('claim-villa', { when: '2026-09-28T19:00/19:20', placeId: 'place-villa' }),
        持ち主に言及する証言('claim-station', { when: '2026-09-28T19:40/19:50', placeId: 'place-station' }),
      ],
      timelineOrder: [],
    };

    const [区間] = buildPersonTravel(ケース, 'person-owner').legs;

    expect(区間?.minGapMs).toBe(20 * MINUTE_MS);
    expect(区間?.maxGapMs).toBe(50 * MINUTE_MS);
    expect(区間?.estimates.map((estimate) => [estimate.label, estimate.feasible])).toEqual([
      ['徒歩', false],
      ['自転車', true],
      ['車', true],
    ]);
  });

  it('日時の幅が重なる場合は、最も短い時刻の差を0とする', () => {
    const ケース: Case = {
      ...移動を確かめるケース,
      claims: [
        持ち主に言及する証言('claim-villa', { when: '2026-09-28T19:00/19:30', placeId: 'place-villa' }),
        持ち主に言及する証言('claim-station', { when: '2026-09-28T19:20', placeId: 'place-station' }),
      ],
      timelineOrder: [],
    };

    const [区間] = buildPersonTravel(ケース, 'person-owner').legs;

    expect(区間?.minGapMs).toBe(0);
    expect(区間?.maxGapMs).toBe(20 * MINUTE_MS);
  });

  it('地点が1つ以下の場合は、移動区間を作らない', () => {
    const travel = buildPersonTravel(移動を確かめるケース, 'person-caretaker');

    expect(travel.stops).toEqual([]);
    expect(travel.legs).toEqual([]);
  });
});
