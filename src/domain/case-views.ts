/**
 * 案件データから時系列ビュー・証言者別ビュー・エンティティ同士の関連を導出するロジック
 *
 * ビューは一次データ（Case）から毎回計算する派生物であり、保存しません。
 * 時系列ボードには証言だけを並べます。ボード上の位置は案件の並び順（Case.timelineOrder、src/domain/timeline-order.ts）で決まります。
 * 証言同士の食い違いは判定しません。並んだ証言を見比べて判断するのは読み手です。
 * 地図ビューは、時系列の並び順のうち、座標のある場所を述べる証言だけをたどります（buildMapTrail）。
 * エンティティ同士の関連は、人物・場所のメモに書かれたメンションから導出します（findRelatedEntities）。
 * 人物・場所の詳細では、その人物・場所から証言を逆引きします（buildPersonDetail・buildPlaceDetail）。
 * 逆引きした証言は、証言の詳細と同じく時系列の並び順に並べます。
 * 参照先（人物・場所）が見つからない場合は、データ破損として例外を投げます。
 * 参照の整合性は、ストアの操作と読み込み時の検証（case-schema.ts）で担保する前提です。
 */
import { parseContent, resolveContent, type ContentSegment, type MentionKind } from './mention';
import { personIconText } from './person-icon';
import { resolveTimelineOrder, timelineKeyOf, type TimelineKey } from './timeline-order';
import type { Case, Claim, Coordinates, Id, Person, Place } from './types';

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
  /** 発言者の人物の、画像が無い場合にアイコンへ表示する1文字です。ユーザーの推測には載りません。 */
  iconText?: string;
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

/** 見出しの無い証言の名前として使う、本文の冒頭の文字数です。 */
const CLAIM_LABEL_LENGTH = 20;

/**
 * 証言の名前（見出し、見出しが無ければ本文の冒頭）を返します。ボタンやリンクの名前と、読み上げに使います。
 *
 * 注意: 本文の日時のメンションは名前に含めません。日時は時系列の並びと、カードの上の表示で分かるため、
 * 短い名前の文字数を日時で使ってしまうと、証言を見分けにくくなるためです。
 */
export function claimLabelOf(view: ClaimView): string {
  if (view.claim.title) return view.claim.title;
  const text = view.contentSegments
    .filter((segment) => segment.type !== 'mention' || segment.kind !== 'date')
    .map((segment) => (segment.type === 'text' ? segment.text : `@${segment.label}`))
    .join('');
  return text.length > CLAIM_LABEL_LENGTH ? `${text.slice(0, CLAIM_LABEL_LENGTH)}…` : text;
}

/**
 * 証言を、時系列ボードの並び順（resolveTimelineOrder）で並べます。
 * 証言者別ビューの中の順番を、時系列ビューで見える順番と一致させるためです。
 */
function sortByTimelineOrder(target: Case, claims: ClaimView[]): ClaimView[] {
  const indexByKey = new Map(resolveTimelineOrder(target).map((key, index) => [key, index]));
  const indexOf = (view: ClaimView) => indexByKey.get(timelineKeyOf(view.claim.id)) ?? Number.MAX_SAFE_INTEGER;
  return [...claims].sort((a, b) => indexOf(a) - indexOf(b));
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
 * グループの中の証言は、時系列ボードの並び順で並べます。
 */
export function groupClaimsBySpeaker(target: Case): SpeakerGroup[] {
  const claimViews = target.claims.map((claim) => toClaimView(target, claim));

  const personGroups: SpeakerGroup[] = target.persons.map((person) => ({
    key: `person:${person.id}`,
    kind: 'person',
    label: person.name,
    imageDataUrl: person.imageDataUrl,
    iconText: personIconText(person),
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
    .map((group) => ({ ...group, claims: sortByTimelineOrder(target, group.claims) }));
}

/** 地図ビューでたどる1地点（座標のある場所を述べる証言）です。 */
export type MapStop = {
  /** 地図に表示できる証言の中での順番（1始まり）です。時系列の並び順に従います。 */
  order: number;
  view: ClaimView;
  place: Place;
  coordinates: Coordinates;
};

/** 証言を地図に表示できない理由です。no-place は証言が場所を述べていないこと、no-coordinates は場所に座標が無いことを表します。 */
export type UnmappedReason = 'no-place' | 'no-coordinates';

/** 地図ビュー全体です。 */
export type MapTrail = {
  /** 時系列の並び順のとおりに並べた地点です。 */
  stops: MapStop[];
  /** 地図に表示できない証言です。時系列の並び順のとおりに並びます。 */
  unmapped: { view: ClaimView; reason: UnmappedReason }[];
};

/** 地図上の1つのピン（同じ場所を述べる証言のまとまり）です。 */
export type MapPin = {
  place: Place;
  coordinates: Coordinates;
  /** この場所を述べる証言の順番（MapStop.order）です。小さい順に並びます。 */
  orders: number[];
};

/** 場所の座標を返します。緯度と経度が揃っていない場合は undefined を返します。 */
function coordinatesOf(place: Place): Coordinates | undefined {
  return place.latitude === undefined || place.longitude === undefined
    ? undefined
    : { latitude: place.latitude, longitude: place.longitude };
}

/**
 * 地図ビューを組み立てます。
 * 時系列の並び順（buildTimeline）のうち、座標のある場所を述べる証言だけを地点として取り出します。
 * 注意: 地図に表示できない証言は捨てずに、理由と共に unmapped に入れます（表示されない証言があることを読み手が見落とさないようにするためです）。
 */
export function buildMapTrail(target: Case): MapTrail {
  const trail: MapTrail = { stops: [], unmapped: [] };
  for (const { view } of buildTimeline(target).items) {
    const coordinates = view.place && coordinatesOf(view.place);
    if (view.place && coordinates) {
      trail.stops.push({ order: trail.stops.length + 1, view, place: view.place, coordinates });
    } else {
      trail.unmapped.push({ view, reason: view.place ? 'no-coordinates' : 'no-place' });
    }
  }
  return trail;
}

/** 地点を場所ごとのピンにまとめます。同じ場所のピンが重なって番号が隠れることを避けるためです。ピンは最初に登場する順に並びます。 */
export function groupStopsByPlace(stops: MapStop[]): MapPin[] {
  const pinByPlaceId = new Map<Id, MapPin>();
  for (const stop of stops) {
    const pin = pinByPlaceId.get(stop.place.id);
    if (pin) {
      pin.orders.push(stop.order);
    } else {
      pinByPlaceId.set(stop.place.id, { place: stop.place, coordinates: stop.coordinates, orders: [stop.order] });
    }
  }
  return [...pinByPlaceId.values()];
}

/** あるエンティティに関連するエンティティです。 */
export type RelatedEntity = {
  kind: MentionKind;
  id: Id;
  name: string;
  imageDataUrl?: string;
  /** 画像が無い場合にアイコンへ表示する1文字です。人物にだけ載ります。 */
  iconText?: string;
  /** 対象のエンティティのメモが、このエンティティに言及しているかどうかです。 */
  mentions: boolean;
  /** このエンティティのメモが、対象のエンティティに言及しているかどうかです。 */
  mentionedBy: boolean;
};

/**
 * 指定したエンティティに関連するエンティティを、人物・場所の登録順に返します。
 *
 * 関連とは、メモのメンションでつながっていることです。対象のメモが言及しているエンティティ（mentions）と、
 * 対象に言及しているメモを持つエンティティ（mentionedBy）の両方を含みます。
 * 注意: 自分自身へのメンションは関連に含めません。証言の本文のメンションも関連に含めません。
 */
export function findRelatedEntities(target: Case, kind: MentionKind, id: Id): RelatedEntity[] {
  const entities: { kind: MentionKind; entity: Person | Place }[] = [
    ...target.persons.map((entity) => ({ kind: 'person' as const, entity })),
    ...target.places.map((entity) => ({ kind: 'place' as const, entity })),
  ];
  /** メモが、指定したエンティティに言及しているかどうかを返します。 */
  const noteMentions = (note: string | undefined, mentionKind: MentionKind, mentionId: Id) =>
    note !== undefined &&
    parseContent(note).some(
      (segment) => segment.type === 'mention' && segment.kind === mentionKind && segment.id === mentionId
    );

  const self = entities.find((item) => item.kind === kind && item.entity.id === id);
  if (!self) {
    throw new Error(`エンティティが見つかりません: ${kind}:${id}`);
  }

  return entities.flatMap((item) => {
    if (item === self) return [];
    const mentions = noteMentions(self.entity.note, item.kind, item.entity.id);
    const mentionedBy = noteMentions(item.entity.note, kind, id);
    if (!mentions && !mentionedBy) return [];

    const related: RelatedEntity = { kind: item.kind, id: item.entity.id, name: item.entity.name, mentions, mentionedBy };
    if (item.entity.imageDataUrl !== undefined) related.imageDataUrl = item.entity.imageDataUrl;
    if (item.kind === 'person') related.iconText = personIconText(item.entity);
    return [related];
  });
}

/** 証言が触れているエンティティ1つと、同じエンティティに触れている他の証言です。 */
export type RelatedClaimGroup = {
  kind: MentionKind;
  id: Id;
  /** エンティティの現在の名前です。 */
  label: string;
  /** 同じエンティティに触れている他の証言です。時系列の並び順に並びます。 */
  claims: ClaimView[];
};

/** 証言の詳細ページに表示する内容です。 */
export type ClaimDetail = {
  view: ClaimView;
  /** 時系列の並び順で、この証言の1つ前の証言です。 */
  previous?: ClaimView;
  /** 時系列の並び順で、この証言の1つ後の証言です。 */
  next?: ClaimView;
  relatedClaimGroups: RelatedClaimGroup[];
};

/** 証言が触れている人物（発言者・経由した人物・言及している人物）のIDを、重複なく返します。 */
function personIdsOf(claim: Claim): Id[] {
  const speakerIds = claim.speaker.kind === 'person' ? claim.speaker.personIds : [];
  return [...new Set([...speakerIds, ...claim.viaPersonIds, ...claim.mentionedPersonIds])];
}

/**
 * 証言の詳細ページの内容を組み立てます。
 *
 * 証言から連想して次の証言へ進めるよう、時系列の前後の証言と、同じ人物・場所に触れている他の証言をまとめます。
 * グループは、発言者・経由した人物・言及している人物・場所の順に並べます。他の証言が無いエンティティのグループは作りません。
 * 注意: 案件に無いIDを渡すと undefined を返します。URLの直接入力や、削除済みの証言のURLを開いた場合に、
 * 呼び出し側が「見つからない」表示を出すためです。
 */
export function buildClaimDetail(target: Case, claimId: Id): ClaimDetail | undefined {
  const views = buildTimeline(target).items.map((item) => item.view);
  const index = views.findIndex((view) => view.claim.id === claimId);
  const view = views[index];
  if (!view) return undefined;

  const others = views.filter((other) => other !== view);
  const persons = [...view.speakerPersons, ...view.viaPersons, ...view.mentionedPersons];
  const groups: RelatedClaimGroup[] = [
    ...personIdsOf(view.claim).map((id) => ({
      kind: 'person' as const,
      id,
      label: findOrThrow(persons, id, '人物').name,
      claims: others.filter((other) => personIdsOf(other.claim).includes(id)),
    })),
    ...(view.place
      ? [
          {
            kind: 'place' as const,
            id: view.place.id,
            label: view.place.name,
            claims: others.filter((other) => other.claim.placeId === view.place?.id),
          },
        ]
      : []),
  ];

  return {
    view,
    previous: views[index - 1],
    next: views[index + 1],
    relatedClaimGroups: groups.filter((group) => group.claims.length > 0),
  };
}

/** 人物・場所の詳細に並べる、証言のまとまりです。 */
export type EntityClaimGroup = {
  /** このまとまりが、対象の人物・場所とどう関わる証言かを示す見出しです。 */
  label: string;
  /** 関わる証言です。時系列の並び順に並びます。 */
  claims: ClaimView[];
};

/** 人物の詳細ページに表示する内容です。 */
export type PersonDetail = {
  person: Person;
  /** この人物から逆引きした証言のまとまりです。1件も無いまとまりは含みません。 */
  claimGroups: EntityClaimGroup[];
  /** メモのメンションでつながったエンティティです（findRelatedEntities）。 */
  relatedEntities: RelatedEntity[];
};

/** 場所の詳細ページに表示する内容です。 */
export type PlaceDetail = {
  place: Place;
  /** この場所から逆引きした証言のまとまりです。1件も無いまとまりは含みません。 */
  claimGroups: EntityClaimGroup[];
  /** メモのメンションでつながったエンティティです（findRelatedEntities）。 */
  relatedEntities: RelatedEntity[];
};

/** 1件も証言が無いまとまりを取り除きます。関わる証言が無い見出しだけが並ぶことを避けるためです。 */
function withoutEmptyGroups(groups: EntityClaimGroup[]): EntityClaimGroup[] {
  return groups.filter((group) => group.claims.length > 0);
}

/**
 * 人物の詳細ページの内容を組み立てます。
 *
 * 証言から人物へ、人物から別の証言へとたどれるよう、この人物が述べた証言・経由して伝わった証言・
 * 言及している証言を、時系列の並び順（buildTimeline）で逆引きします。
 * 注意: 案件に無いIDを渡すと undefined を返します。呼び出し側が「見つからない」表示を出すためです。
 */
export function buildPersonDetail(target: Case, personId: Id): PersonDetail | undefined {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (!person) return undefined;

  const views = buildTimeline(target).items.map((item) => item.view);
  return {
    person,
    claimGroups: withoutEmptyGroups([
      {
        label: 'この人物が述べた証言',
        claims: views.filter(
          (view) => view.claim.speaker.kind === 'person' && view.claim.speaker.personIds.includes(personId)
        ),
      },
      {
        label: 'この人物を経由して伝わった証言',
        claims: views.filter((view) => view.claim.viaPersonIds.includes(personId)),
      },
      {
        label: 'この人物に言及している証言',
        claims: views.filter((view) => view.claim.mentionedPersonIds.includes(personId)),
      },
    ]),
    relatedEntities: findRelatedEntities(target, 'person', personId),
  };
}

/**
 * 場所の詳細ページの内容を組み立てます。
 *
 * 証言から場所へ、場所から別の証言へとたどれるよう、この場所を述べている証言を、
 * 時系列の並び順（buildTimeline）で逆引きします。
 * 注意: 案件に無いIDを渡すと undefined を返します。呼び出し側が「見つからない」表示を出すためです。
 */
export function buildPlaceDetail(target: Case, placeId: Id): PlaceDetail | undefined {
  const place = target.places.find((candidate) => candidate.id === placeId);
  if (!place) return undefined;

  const views = buildTimeline(target).items.map((item) => item.view);
  return {
    place,
    claimGroups: withoutEmptyGroups([
      {
        label: 'この場所を述べている証言',
        claims: views.filter((view) => view.claim.placeId === placeId),
      },
    ]),
    relatedEntities: findRelatedEntities(target, 'place', placeId),
  };
}
