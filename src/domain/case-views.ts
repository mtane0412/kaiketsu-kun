/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジック
 *
 * ビューは一次データ（Case）から毎回計算する派生物であり、保存しません。
 * 時系列の骨格は主張です。ボード上の位置は主張が述べる日時（Claim.when）で決まり、
 * 出来事は同じ事柄についての主張を束ねるラベルとして、束ねた主張から位置・場所・人物を導出します。
 * 食い違いは、特定の見立てとの比較ではなく、同じ出来事に束ねた主張同士の比較で判定します。
 * 参照先（出来事・人物・場所・ソース）が見つからない場合は、データ破損として例外を投げます。
 * 参照の整合性は、ストアの操作と読み込み時の検証（case-schema.ts）で担保する前提です。
 */
import { resolveContent, type ContentSegment } from './mention';
import { compareTimeRef, isTimeConflict } from './time-ref';
import type { Case, Claim, Event, Id, Person, Place, Source, TimeRef } from './types';

/** 表示用に参照先を解決した主張です。 */
export type ClaimView = {
  claim: Claim;
  /** 本文を文字列とメンションに分解したものです。メンションの表示名はエンティティの現在の名前です。 */
  contentSegments: ContentSegment[];
  speakerLabel: string;
  source?: Source;
  event?: Event;
  /** この主張が述べる場所です。 */
  place?: Place;
  mentionedPersons: Person[];
  /** 同じ出来事に束ねた他の主張と、述べる時刻が食い違っているかどうかです。 */
  hasTimeConflict: boolean;
  /** 同じ出来事に束ねた他の主張と、述べる場所が異なるかどうかです。 */
  hasPlaceConflict: boolean;
};

/**
 * 時系列ボードの1項目です。
 *
 * - event: 出来事の束。when・places・persons は束ねた主張から導出した値です。
 * - claim: 出来事に束ねていない主張。
 */
export type TimelineItem =
  | {
      kind: 'event';
      event: Event;
      /** 束ねた主張が述べる日時のうち、最も早いものです。ボード上の位置を決めます。 */
      when?: TimeRef;
      /** 束ねた主張が述べる場所です（重複なし）。 */
      places: Place[];
      /** 束ねた主張が言及している人物です（重複なし）。 */
      persons: Person[];
      claims: ClaimView[];
    }
  | { kind: 'claim'; when?: TimeRef; view: ClaimView };

/** 時系列ビュー全体です。 */
export type Timeline = {
  /** 日時の早い順に並べた項目です。 */
  items: TimelineItem[];
  /** 並べるための日時（earliest または order）を持たない項目です。 */
  undatedItems: TimelineItem[];
};

/** 証言者別ビューの1グループです。 */
export type SpeakerGroup = {
  key: string;
  kind: 'person' | 'source' | 'user';
  label: string;
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

/** 主張の参照先を解決し、同じ出来事に束ねた他の主張との食い違いを判定します。 */
function toClaimView(target: Case, claim: Claim): ClaimView {
  const source = claim.sourceId === undefined ? undefined : findOrThrow(target.sources, claim.sourceId, 'ソース');
  const event = claim.eventId === undefined ? undefined : findOrThrow(target.events, claim.eventId, '出来事');
  const place = claim.placeId === undefined ? undefined : findOrThrow(target.places, claim.placeId, '場所');

  let speakerLabel: string;
  if (claim.speaker.kind === 'person') {
    speakerLabel = findOrThrow(target.persons, claim.speaker.personId, '人物').name;
  } else if (claim.speaker.kind === 'source') {
    speakerLabel = source?.title ?? 'ソース不明の記述';
  } else {
    speakerLabel = USER_SPEAKER_LABEL;
  }

  const siblings =
    claim.eventId === undefined
      ? []
      : target.claims.filter((other) => other.eventId === claim.eventId && other.id !== claim.id);

  return {
    claim,
    contentSegments: resolveContent(claim.content, target),
    speakerLabel,
    source,
    event,
    place,
    mentionedPersons: claim.mentionedPersonIds.map((id) => findOrThrow(target.persons, id, '人物')),
    hasTimeConflict: siblings.some((other) => isTimeConflict(claim.when, other.when)),
    hasPlaceConflict:
      claim.placeId !== undefined &&
      siblings.some((other) => other.placeId !== undefined && other.placeId !== claim.placeId),
  };
}

/** 主張を、述べられた時点の早い順に並べます。 */
function sortByStatedAt(claims: ClaimView[]): ClaimView[] {
  return [...claims].sort((a, b) => compareTimeRef(a.claim.statedAt, b.claim.statedAt));
}

/** 時刻参照が、時系列に並べるための情報（earliest または order）を持つかどうかを返します。 */
function isSortable(ref: TimeRef | undefined): boolean {
  return ref?.earliest !== undefined || ref?.order !== undefined;
}

/** 重複を除いた配列を返します。順序は最初に現れた順です。 */
function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** 出来事と、その出来事に束ねた主張から、ボードの項目を組み立てます。 */
function toEventItem(event: Event, claims: ClaimView[]): TimelineItem {
  // 述べる日時の早い順。日時が同じ、または日時を述べない主張同士は、述べられた時点の早い順
  const sorted = [...claims].sort(
    (a, b) => compareTimeRef(a.claim.when, b.claim.when) || compareTimeRef(a.claim.statedAt, b.claim.statedAt)
  );
  return {
    kind: 'event',
    event,
    when: sorted.map((view) => view.claim.when).find(isSortable),
    places: unique(sorted.flatMap((view) => (view.place ? [view.place] : []))),
    persons: unique(sorted.flatMap((view) => view.mentionedPersons)),
    claims: sorted,
  };
}

/**
 * 時系列ビューを組み立てます。
 * 出来事の束と、出来事に束ねていない主張を、主張が述べる日時の早い順に並べます。
 * 並べるための日時を持たない項目は undatedItems に、出来事、主張の順でまとめます。
 */
export function buildTimeline(target: Case): Timeline {
  const claimViews = target.claims.map((claim) => toClaimView(target, claim));

  const all: TimelineItem[] = [
    ...target.events.map((event) =>
      toEventItem(
        event,
        claimViews.filter((view) => view.claim.eventId === event.id)
      )
    ),
    ...sortByStatedAt(claimViews.filter((view) => view.claim.eventId === undefined)).map(
      (view): TimelineItem => ({ kind: 'claim', when: view.claim.when, view })
    ),
  ];

  return {
    items: all.filter((item) => isSortable(item.when)).sort((a, b) => compareTimeRef(a.when, b.when)),
    undatedItems: all.filter((item) => !isSortable(item.when)),
  };
}

/**
 * 証言者別ビューを組み立てます。
 * 人物（案件への登録順）、ソース自体の記述（ソースの登録順）、ユーザーの推測の順にグループを並べます。
 * 主張が1件も無い発言者のグループは作りません。
 */
export function groupClaimsBySpeaker(target: Case): SpeakerGroup[] {
  const claimViews = target.claims.map((claim) => toClaimView(target, claim));

  const personGroups: SpeakerGroup[] = target.persons.map((person) => ({
    key: `person:${person.id}`,
    kind: 'person',
    label: person.name,
    claims: claimViews.filter(
      (view) => view.claim.speaker.kind === 'person' && view.claim.speaker.personId === person.id
    ),
  }));

  const sourceGroups: SpeakerGroup[] = target.sources.map((source) => ({
    key: `source:${source.id}`,
    kind: 'source',
    label: source.title,
    claims: claimViews.filter((view) => view.claim.speaker.kind === 'source' && view.claim.sourceId === source.id),
  }));

  const userGroup: SpeakerGroup = {
    key: 'user',
    kind: 'user',
    label: USER_SPEAKER_LABEL,
    claims: claimViews.filter((view) => view.claim.speaker.kind === 'user'),
  };

  return [...personGroups, ...sourceGroups, userGroup]
    .filter((group) => group.claims.length > 0)
    .map((group) => ({ ...group, claims: sortByStatedAt(group.claims) }));
}
