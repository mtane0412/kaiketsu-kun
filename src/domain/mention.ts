/**
 * メンション（主張の本文中の @ によるエンティティ参照）
 *
 * 主張の本文（Claim.content）は、人物・場所・出来事への参照を
 * `@[表示名](種類:ID)` の形式のトークンとして含みます。
 * Claim の eventId・placeId・mentionedPersonIds は、このトークンから導出します。
 * 発言者（Claim.speaker）と経由（Claim.viaPersonIds）は本文から導出しません。入力欄の「発言者」で選びます。
 *
 * 導出の規則:
 * - 出来事・場所は、それぞれ最初のメンションを採用します。
 * - 人物のメンションは、言及している人物です。
 *
 * 以前の版では、本文の先頭を「@人物:」と書くとその人物を発言者として導出していました。
 * その頃に保存した本文に残っている発言者の記法は、読み込み時に stripLegacySpeakerPrefix で取り除きます。
 *
 * 入力欄（textarea）では、トークンの代わりに `@表示名` の素の文字列を表示します。
 * この入力欄の状態を「下書き（ClaimDraft）」と呼び、保存時に draftToContent で本文に変換します。
 */
import type { Case, Claim, Id, Speaker } from './types';

/** メンションで参照できるエンティティの種類です。 */
export type MentionKind = 'person' | 'place' | 'event';

/** メンションの種類の一覧です。新規作成の選択肢は、この順序で表示します。 */
export const MENTION_KINDS: MentionKind[] = ['person', 'place', 'event'];

/** 本文を分解した1要素です。 */
export type ContentSegment =
  { type: 'text'; text: string } | { type: 'mention'; kind: MentionKind; id: Id; label: string };

/** 下書きの中で「@表示名」として書かれているメンションです。 */
export type DraftMention = { kind: MentionKind; id: Id; label: string };

/** 入力欄の状態です。text 中の「@表示名」のうち、mentions に登録されたものだけがメンションになります。 */
export type ClaimDraft = { text: string; mentions: DraftMention[] };

/** 本文のトークンから導出した、主張の参照です。 */
export type ClaimLinks = Pick<Claim, 'eventId' | 'placeId' | 'mentionedPersonIds'>;

const TOKEN_PATTERN = /@\[([^\]]*)\]\((person|place|event):([^)\s]+)\)/g;
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
    segments.push({ type: 'mention', kind: match[2] as MentionKind, id: match[3]!, label: match[1]! });
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) segments.push({ type: 'text', text: content.slice(cursor) });
  return segments;
}

/** エンティティの現在の名前を返します。案件内に存在しない場合は undefined を返します。 */
function findEntityName(target: Case, kind: MentionKind, id: Id): string | undefined {
  switch (kind) {
    case 'person':
      return target.persons.find((person) => person.id === id)?.name;
    case 'place':
      return target.places.find((place) => place.id === id)?.name;
    case 'event':
      return target.events.find((event) => event.id === id)?.title;
  }
}

/**
 * 本文を分解し、メンションの表示名をエンティティの現在の名前に更新して返します。
 * 案件内に存在しないエンティティ（保存前の新規エンティティなど）は、トークンに控えた表示名のままにします。
 */
export function resolveContent(content: string, target: Case): ContentSegment[] {
  return parseContent(content).map((segment) =>
    segment.type === 'mention'
      ? { ...segment, label: findEntityName(target, segment.kind, segment.id) ?? segment.label }
      : segment
  );
}

/** 本文のメンションを「@現在の名前」に置き換えた文字列を返します。一覧表示や入力欄で使用します。 */
export function contentToPlainText(content: string, target: Case): string {
  return resolveContent(content, target)
    .map((segment) => (segment.type === 'mention' ? `@${segment.label}` : segment.text))
    .join('');
}

/** 本文のトークンから、主張の参照を導出します。規則はこのファイル冒頭のコメントを参照してください。 */
export function deriveClaimLinks(content: string): ClaimLinks {
  const mentions = parseContent(content).filter((segment) => segment.type === 'mention');
  const firstIdOf = (kind: MentionKind) => mentions.find((mention) => mention.kind === kind)?.id;
  const eventId = firstIdOf('event');
  const placeId = firstIdOf('place');

  // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
  const links: ClaimLinks = {
    mentionedPersonIds: [
      ...new Set(mentions.filter((mention) => mention.kind === 'person').map((mention) => mention.id)),
    ],
  };
  if (eventId !== undefined) links.eventId = eventId;
  if (placeId !== undefined) links.placeId = placeId;
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
 * 保存済みの主張を下書きに変換します。
 *
 * メンション導入前に保存された主張は、参照を項目（eventId など）にだけ持ち、本文にトークンを持ちません。
 * そのまま編集して保存すると参照が失われるため、本文から導出できない参照を、末尾にメンションとして補います。
 * 発言者と経由は入力欄の「発言者」で扱うため、本文には補いません。
 */
export function claimToDraft(claim: Claim, target: Case): ClaimDraft {
  const segments = resolveContent(claim.content, target);
  const mentions: DraftMention[] = segments
    .filter((segment) => segment.type === 'mention')
    .map(({ kind, id, label }) => ({ kind, id, label }));
  let text = contentToPlainText(claim.content, target);

  const derived = deriveClaimLinks(claim.content);
  const missing: [MentionKind, Id | undefined][] = [
    ...claim.mentionedPersonIds
      .filter((id) => !derived.mentionedPersonIds.includes(id))
      .map((id): [MentionKind, Id] => ['person', id]),
    ['event', derived.eventId === undefined ? claim.eventId : undefined],
    ['place', derived.placeId === undefined ? claim.placeId : undefined],
  ];
  for (const [kind, id] of missing) {
    if (id === undefined) continue;
    const label = findEntityName(target, kind, id);
    if (label === undefined) throw new Error(`主張が存在しない参照を持っています: ${kind}:${id}`);
    mentions.push({ kind, id, label });
    text += ` @${label}`;
  }
  return { text, mentions };
}

/**
 * カーソルの直前で入力中のメンションの検索語を返します。候補を表示しない場合は null を返します。
 *
 * @param text 入力欄の文字列
 * @param caret カーソルの位置
 * @param confirmedLabels 下書きで確定済みのメンションの表示名
 *
 * 注意: 日本語の文章は単語を空白で区切らないため、確定済みの表示名に続く文字は文章の続きとみなします。
 * このため、確定済みの「山田」がある下書きでは「@山田花子」の候補を開けません（先に「山田花子」を入力してください）。
 */
export function findMentionQuery(
  text: string,
  caret: number,
  confirmedLabels: string[]
): { start: number; query: string } | null {
  if (caret === 0) return null;
  const start = text.lastIndexOf('@', caret - 1);
  if (start === -1) return null;
  const query = text.slice(start + 1, caret);
  if (/\s/.test(query)) return null;
  if (confirmedLabels.some((label) => query.startsWith(label))) return null;
  return { start, query };
}
