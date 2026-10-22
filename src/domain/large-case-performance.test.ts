/**
 * 大きなケースでの、ビューの組み立てと並び順の整理の性能のテスト
 *
 * 証言が2万件、人物が4千人、資料が2千件のケースで、各処理が時間の上限に収まることを確かめます。
 * 件数の2乗で時間が増える処理（配列の先頭から ID を探す処理の繰り返しなど）が入り込むと、この規模では数秒かかり、上限を超えます。
 * 注意: 上限は、件数に比例する処理なら、低速な環境でも十分に収まる値にしています。数ミリ秒の差を測るテストではありません。
 * 注意: このファイルは、ほかのテストファイルと CPU を取り合わないように、vitest.config.mts の performance プロジェクトで、ほかのテストがすべて終わってから単独で動きます。
 * 各テストは、ケースと人物の一覧を別のオブジェクトにしてから測ります。前のテストで組み立てた時系列ビュー・証言の表示の使い回しで、速く見えることを避けるためです。
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLargeCase } from '@/test/large-case';
import { buildCaseGraph } from './case-graph';
import {
  buildClaimDetail,
  buildMapTrail,
  buildPersonDetail,
  buildPersonLanes,
  buildTimeline,
  groupClaimsBySpeaker,
} from './case-views';
import { parseCase } from './case-schema';
import { buildInterviewList } from './interviews';
import { searchCase } from './search';
import { findSimilarClaims } from './similar-claims';
import { settleTimelineItems, timelineKeyOf } from './timeline-order';
import type { Case } from './types';

/** 1つの処理にかけてよい時間の上限（ミリ秒）です。 */
const TIME_BUDGET_MS = 1000;

/** 処理にかかった時間（ミリ秒）を返します。 */
function elapsedMs(run: () => unknown): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

describe('大きなケース（証言2万件・人物4千人・資料2千件）', () => {
  let baseCase: Case;
  let largeCase: Case;

  beforeAll(() => {
    baseCase = buildLargeCase({ persons: 4000, places: 600, interviews: 2000, claims: 20000 });
  });

  beforeEach(() => {
    // 中身は同じで、オブジェクトだけが異なるケースにする（時系列ビューはケースのオブジェクトごとに、
    // 証言の表示は証言と人物・場所・資料の一覧のオブジェクトごとに使い回されるため）
    largeCase = { ...baseCase, persons: [...baseCase.persons] };
  });

  it('テスト用のケースは、ケースの検証を通る', () => {
    expect(() => parseCase(largeCase)).not.toThrow();
  });

  it.each([
    ['時系列ビュー', (target: Case) => buildTimeline(target)],
    ['証言者別ビュー', (target: Case) => groupClaimsBySpeaker(target)],
    ['人物の動きビュー', (target: Case) => buildPersonLanes(target)],
    ['地図ビュー', (target: Case) => buildMapTrail(target)],
    ['グラフ', (target: Case) => buildCaseGraph(target)],
    ['検索', (target: Case) => searchCase(target, '人物1')],
    ['似ている証言', (target: Case) => findSimilarClaims(target, 'claim-5000')],
    ['証言の詳細', (target: Case) => buildClaimDetail(target, 'claim-5000')],
    ['人物の詳細', (target: Case) => buildPersonDetail(target, 'person-1000')],
    ['資料の一覧', (target: Case) => buildInterviewList(target)],
    ['証言を保存した後の並び順の整理', (target: Case) => settleTimelineItems(target, [timelineKeyOf('claim-5000')])],
  ])('%sを、時間の上限内に組み立てる', (_label, run) => {
    expect(elapsedMs(() => run(largeCase))).toBeLessThan(TIME_BUDGET_MS);
  });

  it('同じケースの時系列ビューは、2回目以降は組み立て直さずに同じものを返す', () => {
    // 前提: サイドバー・ボード・詳細が、同じケースの時系列ビューをそれぞれ求めるため、使い回して1回分の計算で済ませる
    const first = buildTimeline(largeCase);

    expect(buildTimeline(largeCase)).toBe(first);
  });

  it('使い回す時系列ビューの並びは、書き換えようとするとエラーになる', () => {
    // 前提: 使い回すビューを呼び出し側が書き換えると、同じケースを表示する他の画面まで崩れるため、書き換えを拒む
    const timeline = buildTimeline(largeCase);

    expect(() => timeline.items.reverse()).toThrow(TypeError);
    expect(buildTimeline(largeCase).items[0]?.view.claim.id).toBe('claim-0');
  });

  it('ケースが変わった（別のオブジェクトになった）場合は、時系列ビューを組み立て直す', () => {
    const first = buildTimeline(largeCase);
    const renamed: Case = { ...largeCase, persons: largeCase.persons.map((person) => ({ ...person, name: `${person.name}（改名）` })) };

    const second = buildTimeline(renamed);

    expect(second).not.toBe(first);
    expect(second.items[0]?.view.speakerLabel).toBe('人物0（改名）');
  });
});
