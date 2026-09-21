/**
 * 時系列ボードの並び順（相対関係）と、日時との整合性
 *
 * ボードの項目（主張）の位置は、日時ではなく、案件が持つ並び順（Case.timelineOrder）で決まります。
 * 日時（Claim.when）は任意の付加情報です。ただし、日時を持つ項目同士は、日時と矛盾する順には並べられません。
 *
 * 矛盾の定義: 前にある項目の日時の区間が、後ろにある項目の区間より完全に後であること。
 * 区間が重なる項目同士は、どちらの順でも矛盾としません。日時を持たない項目は、どこにでも置けます。
 */
import { toInterval, type Interval } from './time-ref';
import type { Case, Id } from './types';

/**
 * ボードの項目を識別するキーです。'claim:主張のID' の形です。
 * 注意: 接頭辞は、出来事の束（'event:出来事のID'）もボードの項目だった頃の名残です。保存済みの並び順をそのまま読めるよう残しています。
 */
export type TimelineKey = string;

/** 主張のボード上のキーを作ります。 */
export function timelineKeyOf(claimId: Id): TimelineKey {
  return `claim:${claimId}`;
}

/** ボードの項目のキーを、案件への登録順で返します。 */
function boardKeys(target: Pick<Case, 'claims'>): TimelineKey[] {
  return target.claims.map((claim) => timelineKeyOf(claim.id));
}

/**
 * ボードの項目の並び順を返します。
 *
 * 保存した並び順（Case.timelineOrder）のうち、現在もボードの項目であるキーを先に並べ、
 * 載っていない項目（位置を決めずに書き足した主張など）を、末尾に登録順で並べます。
 */
export function resolveTimelineOrder(target: Case): TimelineKey[] {
  const onBoard = boardKeys(target);
  const known = new Set(onBoard);
  const listed = [...new Set(target.timelineOrder)].filter((key) => known.has(key));
  const listedKeys = new Set(listed);
  return [...listed, ...onBoard.filter((key) => !listedKeys.has(key))];
}

/** ボードの項目が持つ日時の区間を返します。日時を持たない項目は null を返します。 */
function intervalOf(target: Case, key: TimelineKey): Interval | null {
  const when = target.claims.find((claim) => timelineKeyOf(claim.id) === key)?.when;
  return when ? toInterval(when) : null;
}

/**
 * 項目を動かせる位置の範囲を返します。
 * min と max は、動かした後の並び順の中での、その項目の位置（0始まり）です。
 *
 * 注意: 他の項目同士がすでに矛盾した順に並んでいる場合は、min が max を上回り、置ける位置が無いことを表します。
 * ボードに無い項目を指定した場合は例外を投げます。
 */
export function allowedIndexRange(target: Case, key: TimelineKey): { min: number; max: number } {
  const order = resolveTimelineOrder(target);
  if (!order.includes(key)) {
    throw new Error(`ボードに項目が見つかりません: ${key}`);
  }
  const others = order.filter((other) => other !== key);
  const moving = intervalOf(target, key);
  if (!moving) return { min: 0, max: others.length };

  const intervals = others.map((other) => intervalOf(target, other));
  // 自分より完全に前の項目のうち最も後ろにあるものの直後から、自分より完全に後の項目のうち最も前にあるものの直前まで
  const lastEarlier = intervals.findLastIndex((interval) => interval !== null && interval.end < moving.start);
  const firstLater = intervals.findIndex((interval) => interval !== null && interval.start > moving.end);
  return { min: lastEarlier + 1, max: firstLater === -1 ? others.length : firstLater };
}

/** 項目を toIndex の位置へ動かした並び順を返します。位置の確認はしません。 */
function moved(order: TimelineKey[], key: TimelineKey, toIndex: number): TimelineKey[] {
  const others = order.filter((other) => other !== key);
  return [...others.slice(0, toIndex), key, ...others.slice(toIndex)];
}

/**
 * 項目を指定した位置へ動かした並び順を返します。
 * toIndex は、動かした後の並び順の中での、その項目の位置（0始まり）です。
 * 日時と矛盾する位置を指定した場合は例外を投げます。
 */
export function moveTimelineItem(target: Case, key: TimelineKey, toIndex: number): TimelineKey[] {
  const { min, max } = allowedIndexRange(target, key);
  if (toIndex < min || toIndex > max) {
    throw new Error(`日時と矛盾するため、この位置には動かせません: ${key}`);
  }
  return moved(resolveTimelineOrder(target), key, toIndex);
}

/**
 * 日時の入力などで現在の位置が日時と矛盾するようになった項目を、最も近い矛盾しない位置へ動かした並び順を返します。
 * 日時の編集を拒否せずに位置を合わせるのは、「日時と矛盾するので動かせず、位置と矛盾するので日時を直せない」
 * という行き詰まりを避けるためです。
 *
 * 注意: ボードの項目ではないキーと、置ける位置が無い項目（他の項目同士がすでに矛盾している場合）は、動かしません。
 */
export function settleTimelineItems(target: Case, keys: TimelineKey[]): TimelineKey[] {
  let order = resolveTimelineOrder(target);
  for (const key of keys) {
    if (!order.includes(key)) continue;
    const { min, max } = allowedIndexRange({ ...target, timelineOrder: order }, key);
    if (min > max) continue;
    const nearest = Math.min(Math.max(order.indexOf(key), min), max);
    order = moved(order, key, nearest);
  }
  return order;
}
