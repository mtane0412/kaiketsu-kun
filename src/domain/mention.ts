/**
 * メンション（文章中の @ によるエンティティ参照）
 *
 * 証言の本文（Claim.content）と、人物・場所のメモ（Person.note・Place.note）は、人物・場所への参照を
 * `@[表示名](種類:ID)` の形式のトークンとして含みます。
 * メモのメンションは、エンティティ同士の関連（case-views.ts の findRelatedEntities）の元になります。
 * Claim の placeId・mentionedPersonIds は、本文のトークンから導出します。
 * 発言者（Claim.speaker）と経由（Claim.viaPersonIds）は本文から導出しません。入力欄の「発言者」で選びます。
 *
 * 本文には、ケースのエンティティ（人物・場所）のほかに、日時のメンションも書けます。
 * 日時のメンションはケースのエンティティを指さず、時刻参照（TimeRef）そのものをIDとして持ちます
 * （例: `@[1998年8月12日 19:00](date:1998-08-12T19:00)`）。証言の日時を本文の中で書けるようにするためです。
 *
 * 導出の規則:
 * - 場所は、最初のメンションを採用します。
 * - 人物のメンションは、言及している人物です。
 * - 日時は、最初の日時のメンションを採用します。
 *
 * 以前の版では、本文の先頭を「@人物:」と書くとその人物を発言者として導出していました。
 * その頃に保存した本文に残っている発言者の記法は、読み込み時に stripLegacySpeakerPrefix で取り除きます。
 *
 * 入力欄（textarea）では、トークンの代わりに `@表示名` の素の文字列を表示します。
 * この入力欄の状態を「下書き（ClaimDraft）」と呼び、保存時に draftToContent で本文に変換します。
 * 注意: 下書きの型は名前に Claim を含みますが、メモの入力欄でも同じ型を使用します。
 */
import { personIconText } from './person-icon';
import { formatTimeRef, isValidTimeRef } from './time-ref';
import type { Case, Claim, Id, Speaker, TimeRef } from './types';

/** メンションで参照できるエンティティの種類です。 */
export type MentionKind = 'person' | 'place';

/**
 * 本文に書けるメンションの種類です。
 * date はケースのエンティティではなく、日時そのもの（TimeRef）を指します。
 */
export type SegmentKind = MentionKind | 'date';

/** メンションの種類の一覧です。新規作成の選択肢は、この順序で表示します。 */
export const MENTION_KINDS: MentionKind[] = ['person', 'place'];

/** 本文を分解した1要素です。 */
export type ContentSegment =
  | { type: 'text'; text: string }
  /**
   * imageDataUrl と iconText は、ケースを参照して解決した場合（resolveContent）にだけ載ります。
   * iconText は、画像が無い場合にアイコンへ表示する1文字で、人物のメンションにだけ載ります。
   */
  | { type: 'mention'; kind: SegmentKind; id: Id; label: string; imageDataUrl?: string; iconText?: string };

/** 下書きの中で「@表示名」として書かれているメンションです。日時のメンションでは、id が時刻参照そのものです。 */
export type DraftMention = { kind: SegmentKind; id: Id; label: string };

/** 入力欄の状態です。text 中の「@表示名」のうち、mentions に登録されたものだけがメンションになります。 */
export type ClaimDraft = { text: string; mentions: DraftMention[] };

/** 本文のトークンから導出した、証言の参照です。 */
export type ClaimLinks = Pick<Claim, 'placeId' | 'mentionedPersonIds' | 'when'>;

const TOKEN_PATTERN = /@\[([^\]]*)\]\((person|place|date):([^)\s]+)\)/g;
/**
 * 以前の版の発言者の記法です。本文の先頭に人物のメンションを空白または読点で区切って並べ、コロン（: または ：）で閉じます。
 */
const LEGACY_SPEAKER_PREFIX_PATTERN = /^(?:@\[[^\]]*\]\(person:[^)\s]+\)[\s、,，]*)+[:：]\s*/;

/**
 * メンションを本文用のトークンに変換します。
 * 注意: 表示名はエンティティを引けない場合の表示用の控えです。トークンの区切りと衝突する「]」は全角に置き換えます。
 */
export function formatMention(mention: DraftMention): string {
  return `@[${mention.label.replaceAll(']', '］')}](${mention.kind}:${mention.id})`;
}

/** 本文を、文字列とメンションの並びに分解します。 */
export function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let cursor = 0;
  for (const match of content.matchAll(TOKEN_PATTERN)) {
    if (match.index > cursor) segments.push({ type: 'text', text: content.slice(cursor, match.index) });
    segments.push({ type: 'mention', kind: match[2] as SegmentKind, id: match[3]!, label: match[1]! });
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) segments.push({ type: 'text', text: content.slice(cursor) });
  return segments;
}

/**
 * 時刻参照から、日時のメンションを作ります。
 * 表示名は、書かれた精度のままの日本語の表記です（1998-08-12T19:00 → 「1998年8月12日 19:00」）。
 */
export function dateMentionOf(when: TimeRef): DraftMention {
  return { kind: 'date', id: when, label: formatTimeRef(when) };
}

/** メンションが指すエンティティを返します。ケース内に存在しない場合は undefined を返します。 */
function findEntity(
  target: Case,
  kind: MentionKind,
  id: Id
): { name: string; imageDataUrl?: string; iconText?: string } | undefined {
  switch (kind) {
    case 'person':
      return target.persons.find((person) => person.id === id);
    case 'place':
      return target.places.find((place) => place.id === id);
  }
}

/** エンティティの現在の名前を返します。ケース内に存在しない場合は undefined を返します。 */
function findEntityName(target: Case, kind: MentionKind, id: Id): string | undefined {
  return findEntity(target, kind, id)?.name;
}

/** 時刻参照を、本文を分解した要素としての日時のメンションにします。 */
function dateMentionSegment(when: TimeRef): ContentSegment {
  return { type: 'mention', ...dateMentionOf(when) };
}

/**
 * 本文を分解し、メンションの表示名をエンティティの現在の名前に更新し、エンティティの画像と、人物のアイコンの文字を載せて返します。
 * ケース内に存在しないエンティティ（保存前の新規エンティティなど）は、トークンに控えた表示名のままにします。
 */
export function resolveContent(content: string, target: Case): ContentSegment[] {
  return parseContent(content).map((segment) => {
    if (segment.type !== 'mention') return segment;
    // 日時のメンションはケースを参照しない。表示名は、保存済みの表示名ではなく時刻参照から組み立て直す
    if (segment.kind === 'date') return isValidTimeRef(segment.id) ? dateMentionSegment(segment.id) : segment;
    const entity = findEntity(target, segment.kind, segment.id);
    if (!entity) return segment;
    const resolved = { ...segment, label: entity.name };
    if (entity.imageDataUrl !== undefined) resolved.imageDataUrl = entity.imageDataUrl;
    if (segment.kind === 'person') resolved.iconText = personIconText(entity);
    return resolved;
  });
}

/** 本文のメンションを「@現在の名前」に置き換えた文字列を返します。一覧表示や入力欄で使用します。 */
export function contentToPlainText(content: string, target: Case): string {
  return resolveContent(content, target)
    .map((segment) => (segment.type === 'mention' ? `@${segment.label}` : segment.text))
    .join('');
}

/** 本文のトークンから、証言の参照を導出します。規則はこのファイル冒頭のコメントを参照してください。 */
export function deriveClaimLinks(content: string): ClaimLinks {
  const mentions = parseContent(content).filter((segment) => segment.type === 'mention');
  const placeId = mentions.find((mention) => mention.kind === 'place')?.id;
  const when = mentions.find((mention) => mention.kind === 'date' && isValidTimeRef(mention.id))?.id;

  // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
  const links: ClaimLinks = {
    mentionedPersonIds: [
      ...new Set(mentions.filter((mention) => mention.kind === 'person').map((mention) => mention.id)),
    ],
  };
  if (placeId !== undefined) links.placeId = placeId;
  if (when !== undefined) links.when = when;
  return links;
}

/**
 * 発言者を本文の先頭に「@人物:」と書いていた頃の本文から、発言者の記法を取り除いて返します。
 *
 * 注意: 先頭に並んだ人物の全員が項目の発言者（speaker）に含まれる場合に限り、取り除きます。
 * 含まれない人物がいる場合は、発言者の記法ではなく文章とみなし、本文を変えません。
 */
export function stripLegacySpeakerPrefix(content: string, speaker: Speaker): string {
  if (speaker.kind !== 'person') return content;
  const prefix = LEGACY_SPEAKER_PREFIX_PATTERN.exec(content)?.[0];
  if (prefix === undefined) return content;
  const isSpeakerPrefix = parseContent(prefix).every(
    (segment) => segment.type !== 'mention' || speaker.personIds.includes(segment.id)
  );
  return isSpeakerPrefix ? content.slice(prefix.length) : content;
}

/**
 * 下書きを、文字列とメンションの並びに分解します。
 * text 中の「@表示名」のうち mentions に登録されたものだけをメンションとし、それ以外の「@」は文字列に含めます。
 * 注意: メンションの要素は、text の中で「@表示名」（1 + 表示名の文字数）の長さを占めます。
 */
export function parseDraft(draft: ClaimDraft): ContentSegment[] {
  // 「山田」と「山田花子」のように前方一致で重なる表示名は、長いものを先に照合する
  const mentions = [...draft.mentions].sort((a, b) => b.label.length - a.label.length);
  const segments: ContentSegment[] = [];
  let textStart = 0;
  let index = 0;
  while (index < draft.text.length) {
    const matched =
      draft.text[index] === '@'
        ? mentions.find((mention) => draft.text.startsWith(mention.label, index + 1))
        : undefined;
    if (matched) {
      if (index > textStart) segments.push({ type: 'text', text: draft.text.slice(textStart, index) });
      segments.push({ type: 'mention', kind: matched.kind, id: matched.id, label: matched.label });
      index += 1 + matched.label.length;
      textStart = index;
    } else {
      index += 1;
    }
  }
  if (textStart < draft.text.length) segments.push({ type: 'text', text: draft.text.slice(textStart) });
  return segments;
}

/**
 * 下書きを本文に変換します。
 * text 中の「@表示名」のうち mentions に登録されたものをトークンに置き換え、それ以外の「@」は文字のまま残します。
 */
export function draftToContent(draft: ClaimDraft): string {
  return parseDraft(draft)
    .map((segment) => (segment.type === 'mention' ? formatMention(segment) : segment.text))
    .join('');
}

/**
 * メンションを含む保存済みの文章（証言の本文、エンティティのメモ）を下書きに変換します。
 * メンションの表示名は、エンティティの現在の名前に更新します。
 */
export function contentToDraft(content: string, target: Case): ClaimDraft {
  const mentions: DraftMention[] = resolveContent(content, target)
    .filter((segment) => segment.type === 'mention')
    .map(({ kind, id, label }) => ({ kind, id, label }));
  return { text: contentToPlainText(content, target), mentions };
}

/**
 * 保存済みの証言を下書きに変換します。
 *
 * メンション導入前に保存された証言は、参照を項目（placeId など）にだけ持ち、本文にトークンを持ちません。
 * そのまま編集して保存すると参照が失われるため、本文から導出できない参照を、末尾にメンションとして補います。
 * 発言者と経由は入力欄の「発言者」で扱うため、本文には補いません。
 */
export function claimToDraft(claim: Claim, target: Case): ClaimDraft {
  const draft = contentToDraft(claim.content, target);
  const mentions = [...draft.mentions];
  let text = draft.text;

  const derived = deriveClaimLinks(claim.content);
  // 日時の入力欄を持っていた頃の証言は、本文にメンションが無いため、末尾に補う
  if (claim.when !== undefined && derived.when === undefined) {
    const dateMention = dateMentionOf(claim.when);
    mentions.push(dateMention);
    text += ` @${dateMention.label}`;
  }
  const missing: [MentionKind, Id | undefined][] = [
    ...claim.mentionedPersonIds
      .filter((id) => !derived.mentionedPersonIds.includes(id))
      .map((id): [MentionKind, Id] => ['person', id]),
    ['place', derived.placeId === undefined ? claim.placeId : undefined],
  ];
  for (const [kind, id] of missing) {
    if (id === undefined) continue;
    const label = findEntityName(target, kind, id);
    if (label === undefined) throw new Error(`証言が存在しない参照を持っています: ${kind}:${id}`);
    mentions.push({ kind, id, label });
    text += ` @${label}`;
  }
  return { text, mentions };
}

/** findMentionQuery が参照する、下書きとケースの語です。 */
export type MentionQueryContext = {
  /** 下書きで確定済みのメンションの表示名 */
  confirmedLabels: string[];
  /** 候補の絞り込みに使う、登録済みのエンティティの語（表示名と別名）。カーソルより後ろの語を検索語に取り込むために使用します。 */
  candidateWords: string[];
};

/** 検索語と、候補を選んだときに置き換える入力欄の範囲（start 以上 end 未満）です。 */
export type MentionQuery = { start: number; query: string; end: number };

/**
 * カーソルより後ろに続く文字列のうち、登録済みの語の一部として現れる最長の長さを返します。
 *
 * 1文字ずつ伸ばしながら、どの語にも含まれなくなった時点で止めます。
 * 例えば「小原勝幸」が登録済みで本文が「小原を梢が…」の場合、「小原」までは含まれ、「小原を」は含まれないため 2 を返します。
 *
 * @param rest 「@」の次から入力欄の終わりまでの文字列
 * @param from 伸ばし始める長さ（カーソルまでに入力済みの文字数）
 * @param candidateWords 候補の絞り込みに使う語
 */
function matchedWordLength(rest: string, from: number, candidateWords: string[]): number {
  let length = from;
  while (length < rest.length) {
    const next = rest.slice(0, length + 1);
    // 空白や改行は語の区切りとみなし、それ以上は伸ばさない
    if (/\s/.test(rest[length]!)) break;
    if (!candidateWords.some((word) => word.includes(next))) break;
    length += 1;
  }
  return length;
}

/**
 * カーソルの直前で入力中のメンションの検索語を返します。候補を表示しない場合は null を返します。
 *
 * @param text 入力欄の文字列
 * @param caret カーソルの位置
 * @param context 下書きで確定済みの表示名と、候補の絞り込みに使う語
 *
 * 日本語の文章は単語を空白で区切らないため、カーソルの位置だけでは名前の終わりが分かりません。
 * そこで、カーソルより後ろに続く文字列が登録済みの語の一部として現れる間は、その範囲を検索語と置換範囲に含めます。
 * これにより、既にある文章の中に「@」を差し込むだけで、名前を打ち直さずに候補を絞り込め、
 * 選んだときに元の名前が重複して残ることもありません
 * （「小原勝幸」「小原三男」が登録済みで「@小原を梢が…」と書いた場合、検索語は「小原」になり、候補は2人に絞られます）。
 * どの語にも含まれない場合は、カーソルまでを検索語とします（新規作成の名前は打った分だけを使います）。
 *
 * 注意: 確定済みの表示名に続く文字は文章の続きとみなします。
 * このため、確定済みの「山田」がある下書きでは「@山田花子」の候補を開けません（先に「山田花子」を入力してください）。
 */
export function findMentionQuery(text: string, caret: number, context: MentionQueryContext): MentionQuery | null {
  if (caret === 0) return null;
  const start = text.lastIndexOf('@', caret - 1);
  if (start === -1) return null;
  const typed = text.slice(start + 1, caret);
  if (/\s/.test(typed)) return null;
  if (context.confirmedLabels.some((label) => typed.startsWith(label))) return null;
  const rest = text.slice(start + 1);
  const length = matchedWordLength(rest, typed.length, context.candidateWords);
  return { start, query: rest.slice(0, length), end: start + 1 + length };
}
