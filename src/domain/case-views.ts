/**
 * 案件データから時系列ビュー・証言者別ビューを導出するロジック
 *
 * ビューは一次データ（Case）から毎回計算する派生物であり、保存しません。
 * 参照先（出来事・人物・場所・ソース）が見つからない場合は、データ破損として例外を投げます。
 * 参照の整合性は、ストアの操作と読み込み時の検証（case-schema.ts）で担保する前提です。
 */
import { compareTimeRef, isTimeConflict } from './time-ref';
import type { Case, Claim, Event, Id, Person, Place, Source } from './types';

/** 表示用に参照先を解決した主張です。 */
export type ClaimView = {
  claim: Claim;
  speakerLabel: string;
  source?: Source;
  event?: Event;
  /** この主張が述べる場所です。 */
  place?: Place;
  mentionedPersons: Person[];
  /** 主張が述べる時刻が、出来事の見立ての時刻と食い違っているかどうかです。 */
  hasTimeConflict: boolean;
  /** 主張が述べる場所が、出来事の見立ての場所と異なるかどうかです。 */
  hasPlaceConflict: boolean;
};

/** 時系列ビューの1行（1つの出来事）です。 */
export type TimelineEntry = {
  event: Event;
  place?: Place;
  participants: Person[];
  claims: ClaimView[];
};

/** 時系列ビュー全体です。 */
export type Timeline = {
  entries: TimelineEntry[];
  /** 出来事に紐づかない主張（人物評、ユーザーの推測など）です。 */
  unlinkedClaims: ClaimView[];
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

/** 主張の参照先を解決し、見立てとの食い違いを判定します。 */
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

  return {
    claim,
    speakerLabel,
    source,
    event,
    place,
    mentionedPersons: claim.mentionedPersonIds.map((id) => findOrThrow(target.persons, id, '人物')),
    hasTimeConflict: isTimeConflict(claim.when, event?.when),
    hasPlaceConflict:
      claim.placeId !== undefined && event?.placeId !== undefined && claim.placeId !== event.placeId,
  };
}

/** 主張を、述べられた時点の早い順に並べます。 */
function sortByStatedAt(claims: ClaimView[]): ClaimView[] {
  return [...claims].sort((a, b) => compareTimeRef(a.claim.statedAt, b.claim.statedAt));
}

/**
 * 時系列ビューを組み立てます。
 * 出来事は起きた時点の早い順に、各出来事の主張は述べられた時点の早い順に並べます。
 */
export function buildTimeline(target: Case): Timeline {
  const claimViews = target.claims.map((claim) => toClaimView(target, claim));

  const entries = [...target.events]
    .sort((a, b) => compareTimeRef(a.when, b.when))
    .map((event) => ({
      event,
      place: event.placeId === undefined ? undefined : findOrThrow(target.places, event.placeId, '場所'),
      participants: event.participantIds.map((id) => findOrThrow(target.persons, id, '人物')),
      claims: sortByStatedAt(claimViews.filter((view) => view.claim.eventId === event.id)),
    }));

  return {
    entries,
    unlinkedClaims: sortByStatedAt(claimViews.filter((view) => view.claim.eventId === undefined)),
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
