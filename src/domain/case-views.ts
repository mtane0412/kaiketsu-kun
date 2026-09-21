/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジック
 *
 * ビューは一次データ（Case）から毎回計算する派生物であり、保存しません。
 * 時系列ボードには証言だけを並べます。ボード上の位置は案件の並び順（Case.timelineOrder、src/domain/timeline-order.ts）で決まります。
 * 証言同士の食い違いは判定しません。並んだ証言を見比べて判断するのは読み手です。
 * 参照先（人物・場所）が見つからない場合は、データ破損として例外を投げます。
 * 参照の整合性は、ストアの操作と読み込み時の検証（case-schema.ts）で担保する前提です。
 */
import { resolveContent, type ContentSegment } from './mention';
import { compareTimeRef } from './time-ref';
import { resolveTimelineOrder, timelineKeyOf, type TimelineKey } from './timeline-order';
import type { Case, Claim, Id, Person, Place } from './types';

/** 表示用に参照先を解決した証言です。 */
export type ClaimView = {
  claim: Claim;
  /** 本文を文字列とメンションに分解したものです。メンションの表示名はエンティティの現在の名前です。 */
  contentSegments: ContentSegment[];
  speakerLabel: string;
  /** 発言者の人物です。ユーザーの推測の場合は空です。 */
  speakerPersons: Person[];
  /** 発言者の発言をユーザーに伝えた人物です。伝えた順に並びます。 */
  viaPersons: Person[];
  /** この証言が述べる場所です。 */
  place?: Place;
  mentionedPersons: Person[];
};

/** 時系列ボードの1項目（証言）です。 */
export type TimelineItem = {
  /** 並び順の中でこの項目を識別するキーです。 */
  key: TimelineKey;
  view: ClaimView;
};

/** 時系列ビュー全体です。 */
export type Timeline = {
  /** 案件の並び順のとおりに並べた項目です。 */
  items: TimelineItem[];
};

/** 証言者別ビューの1グループです。 */
export type SpeakerGroup = {
  key: string;
  kind: 'person' | 'user';
  label: string;
  /** 発言者の人物に登録された画像です。 */
  imageDataUrl?: string;
  claims: ClaimView[];
};

/** ユーザーの推測をまとめるグループの表示名です。 */
export const USER_SPEAKER_LABEL = 'ユーザーの推測';

/** IDで要素を探し、見つからない場合は例外を投げます。 */
function findOrThrow<T extends { id: Id }>(items: T[], id: Id, entityName: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) {
    throw new Error(`${entityName}が見つかりません: ${id}`);
  }
  return found;
}

/** 経由した人物の名前（伝えた順）を「（県警 → 架空日報 朝刊 による）」の形にします。経由が無い場合は空文字列を返します。 */
export function formatViaLabel(viaNames: string[]): string {
  return viaNames.length > 0 ? `（${viaNames.join(' → ')} による）` : '';
}

/** 証言の発言者の表示名を返します。複数の人物は「、」でつなぎ、発言者がいない証言はユーザーの推測とします。 */
function speakerLabelOf(target: Case, claim: Claim): string {
  return claim.speaker.kind === 'person'
    ? claim.speaker.personIds.map((id) => findOrThrow(target.persons, id, '人物').name).join('、')
    : USER_SPEAKER_LABEL;
}

/**
 * 証言が誰の発言で、誰を経由して伝わったかを、1行の文字列で返します。
 * 例「県道の防犯カメラ（県警 → 架空日報 朝刊 による）」。一覧のように、カードを使わずに証言を並べる箇所で使用します。
 */
export function describeClaimAttribution(target: Case, claim: Claim): string {
  const viaNames = claim.viaPersonIds.map((id) => findOrThrow(target.persons, id, '人物').name);
  return `${speakerLabelOf(target, claim)}${formatViaLabel(viaNames)}`;
}

/** 証言の参照先を解決します。 */
function toClaimView(target: Case, claim: Claim): ClaimView {
  const place = claim.placeId === undefined ? undefined : findOrThrow(target.places, claim.placeId, '場所');

  return {
    claim,
    contentSegments: resolveContent(claim.content, target),
    speakerLabel: speakerLabelOf(target, claim),
    speakerPersons:
      claim.speaker.kind === 'person' ? claim.speaker.personIds.map((id) => findOrThrow(target.persons, id, '人物')) : [],
    viaPersons: claim.viaPersonIds.map((id) => findOrThrow(target.persons, id, '人物')),
    place,
    mentionedPersons: claim.mentionedPersonIds.map((id) => findOrThrow(target.persons, id, '人物')),
  };
}

/** 証言を、述べられた時点の早い順に並べます。 */
function sortByStatedAt(claims: ClaimView[]): ClaimView[] {
  return [...claims].sort((a, b) => compareTimeRef(a.claim.statedAt, b.claim.statedAt));
}

/** 時系列ビューを組み立てます。証言を、案件の並び順（resolveTimelineOrder）のとおりに並べます。 */
export function buildTimeline(target: Case): Timeline {
  const itemByKey = new Map(
    target.claims.map((claim): [TimelineKey, TimelineItem] => {
      const key = timelineKeyOf(claim.id);
      return [key, { key, view: toClaimView(target, claim) }];
    })
  );
  return { items: resolveTimelineOrder(target).flatMap((key) => itemByKey.get(key) ?? []) };
}

/**
 * 証言者別ビューを組み立てます。
 * 人物（案件への登録順）、ユーザーの推測の順にグループを並べます。
 * 証言が1件も無い発言者のグループは作りません。複数の人物が述べた証言は、それぞれの人物のグループに入れます。
 * 経由した人物（Claim.viaPersonIds）は発言者ではないため、その人物のグループには入れません。
 */
export function groupClaimsBySpeaker(target: Case): SpeakerGroup[] {
  const claimViews = target.claims.map((claim) => toClaimView(target, claim));

  const personGroups: SpeakerGroup[] = target.persons.map((person) => ({
    key: `person:${person.id}`,
    kind: 'person',
    label: person.name,
    imageDataUrl: person.imageDataUrl,
    claims: claimViews.filter(
      (view) => view.claim.speaker.kind === 'person' && view.claim.speaker.personIds.includes(person.id)
    ),
  }));

  const userGroup: SpeakerGroup = {
    key: 'user',
    kind: 'user',
    label: USER_SPEAKER_LABEL,
    claims: claimViews.filter((view) => view.claim.speaker.kind === 'user'),
  };

  return [...personGroups, userGroup]
    .filter((group) => group.claims.length > 0)
    .map((group) => ({ ...group, claims: sortByStatedAt(group.claims) }));
}
