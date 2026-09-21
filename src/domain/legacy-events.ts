/**
 * 出来事（Event）を持っていた頃のデータの変換
 *
 * 以前の版では、同じ事柄についての主張を「出来事」に束ね、時系列ボードには出来事の束と、束ねていない主張を並べていました。
 * 出来事は廃止し、ボードには主張だけを並べます。読み込み時（parseCase）に、次のとおり変換します。
 *
 * - 並び順の中の出来事の束（'event:出来事のID'）は、その位置に、束ねていた主張を当時の束の中の表示順で並べます。
 *   束を解いた結果、日時と矛盾する並びになった主張は、呼び出し側（parseCase）が矛盾しない位置へ動かします。
 * - 主張が束ねる出来事（eventId）は取り除きます。
 * - 本文の末尾の「@出来事」は、束ねる先を指定するための書き方だったため取り除きます。
 *   文中の「@出来事」は、出来事のタイトルの文字に戻します。
 *
 * 注意: 出来事のメモ（description）と、主張を1件も束ねていない出来事は、変換先が無いため引き継ぎません。
 */
import { compareTimeRef } from './time-ref';
import { timelineKeyOf, type TimelineKey } from './timeline-order';
import type { Claim, Id, TimeRef } from './types';

/** 廃止した出来事です。 */
export type LegacyEvent = { id: Id; title: string };

/** 出来事に束ねることができた頃の主張です。 */
export type LegacyClaim = Claim & { eventId?: Id };

type LegacyData = {
  /** 出来事を廃止した後のデータは持ちません。 */
  events?: LegacyEvent[];
  claims: LegacyClaim[];
  /** 並び順を持たない頃のデータは持ちません。 */
  timelineOrder?: string[];
};

/** 本文が含む、出来事へのメンションです。 */
const EVENT_TOKEN_PATTERN = /@\[([^\]]*)\]\(event:([^)\s]+)\)/g;
/** 本文の末尾に並んだ、出来事へのメンションです（前後の空白を含みます）。 */
const TRAILING_EVENT_TOKENS_PATTERN = /(?:\s*@\[[^\]]*\]\(event:[^)\s]+\))+\s*$/;

const EVENT_KEY_PREFIX = 'event:';

/** 時刻参照が、並び順を持たない頃の時系列に並べるための情報（earliest または order）を持つかどうかを返します。 */
function isLegacySortable(ref: TimeRef | undefined): boolean {
  return ref?.earliest !== undefined || ref?.order !== undefined;
}

/** 出来事の束の中の、当時の表示順（述べる日時の早い順、同じなら述べられた時点の早い順）で、束ねていた主張を返します。 */
function bundledClaims(claims: LegacyClaim[], eventId: Id): LegacyClaim[] {
  return claims
    .filter((claim) => claim.eventId === eventId)
    .sort((a, b) => compareTimeRef(a.when, b.when) || compareTimeRef(a.statedAt, b.statedAt));
}

/**
 * 並び順（timelineOrder）を持たない頃のデータの、当時の表示順を返します。要素は 'event:出来事のID' または 'claim:主張のID' です。
 *
 * 当時の位置は主張が述べる日時で決まっていました。日時を持つ項目を早い順に、次に並び順の数値（TimeRef.order）だけを
 * 持つ項目を小さい順に、最後にどちらも持たない項目を、出来事、主張（述べられた時点の早い順）の順で並べます。
 * 出来事の束の位置は、束ねた主張が述べる日時のうち最も早いものです。
 */
function legacyTimelineOrder(events: LegacyEvent[], claims: LegacyClaim[]): string[] {
  const items = [
    ...events.map((event) => ({
      key: `${EVENT_KEY_PREFIX}${event.id}`,
      when: bundledClaims(claims, event.id)
        .map((claim) => claim.when)
        .find(isLegacySortable),
    })),
    ...claims
      .filter((claim) => claim.eventId === undefined)
      .sort((a, b) => compareTimeRef(a.statedAt, b.statedAt))
      .map((claim) => ({ key: timelineKeyOf(claim.id), when: claim.when })),
  ];
  return [
    ...items.filter((item) => isLegacySortable(item.when)).sort((a, b) => compareTimeRef(a.when, b.when)),
    ...items.filter((item) => !isLegacySortable(item.when)),
  ].map((item) => item.key);
}

/** 本文の出来事へのメンションを取り除きます。規則はこのファイル冒頭のコメントを参照してください。 */
function stripEventMentions(content: string, events: LegacyEvent[]): string {
  const titleOf = (id: Id, label: string) => events.find((event) => event.id === id)?.title ?? label;
  const toTitles = (text: string) => text.replaceAll(EVENT_TOKEN_PATTERN, (_token, label: string, id: Id) => titleOf(id, label));

  const stripped = toTitles(content.replace(TRAILING_EVENT_TOKENS_PATTERN, ''));
  // 本文が出来事へのメンションだけだった主張は、本文が空にならないよう、タイトルの文字に戻す
  return stripped.trim() === '' ? toTitles(content) : stripped;
}

/**
 * 出来事を持っていた頃のデータを、主張だけを並べる現在の形に変換します。
 * 変換の必要が無いデータは、そのままの内容で返します（並び順を持たない頃のデータには、当時の表示順を補います）。
 */
export function migrateLegacyEvents(data: LegacyData): { claims: Claim[]; timelineOrder: TimelineKey[] } {
  const events = data.events ?? [];
  const order = data.timelineOrder ?? legacyTimelineOrder(events, data.claims);

  const timelineOrder = order.flatMap((key) =>
    key.startsWith(EVENT_KEY_PREFIX)
      ? bundledClaims(data.claims, key.slice(EVENT_KEY_PREFIX.length)).map((claim) => timelineKeyOf(claim.id))
      : [key]
  );
  const claims = data.claims.map(({ eventId: _eventId, ...claim }): Claim => ({
    ...claim,
    content: stripEventMentions(claim.content, events),
  }));
  return { claims, timelineOrder };
}
