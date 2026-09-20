/**
 * メンション（主張の本文中の @ によるエンティティ参照）
 *
 * 主張の本文（Claim.content）は、人物・場所・出来事・ソースへの参照を
 * `@[表示名](種類:ID)` の形式のトークンとして含みます。
 * Claim の speaker・sourceId・eventId・placeId・mentionedPersonIds は、このトークンから導出します。
 *
 * 導出の規則:
 * - 本文の先頭が人物のメンションで、その直後がコロン（: または ：）の場合、その人物が発言者です。
 *   人物のメンションを空白または読点（、）で区切って並べた場合は、全員が発言者です。
 *   並びの途中に文章（「と」など）を挟んだ場合は、発言者として扱いません。
 * - 発言者の人物がいない場合、ソースのメンションがあれば「ソース自体の記述」、無ければ「ユーザーの推測」です。
 * - ソース・出来事・場所は、それぞれ最初のメンションを採用します。
 * - 発言者以外の人物のメンションは、言及している人物です。
 *
 * 入力欄（textarea）では、トークンの代わりに `@表示名` の素の文字列を表示します。
 * この入力欄の状態を「下書き（ClaimDraft）」と呼び、保存時に draftToContent で本文に変換します。
 */
import type { Case, Claim, Id, Speaker } from './types';

/** メンションで参照できるエンティティの種類です。 */
export type MentionKind = 'person' | 'place' | 'event' | 'source';

/** メンションの種類の一覧です。新規作成の選択肢は、この順序で表示します。 */
export const MENTION_KINDS: MentionKind[] = ['person', 'place', 'event', 'source'];

/** 本文を分解した1要素です。 */
export type ContentSegment =
  { type: 'text'; text: string } | { type: 'mention'; kind: MentionKind; id: Id; label: string };

/** 下書きの中で「@表示名」として書かれているメンションです。 */
export type DraftMention = { kind: MentionKind; id: Id; label: string };

/** 入力欄の状態です。text 中の「@表示名」のうち、mentions に登録されたものだけがメンションになります。 */
export type ClaimDraft = { text: string; mentions: DraftMention[] };

/** 本文のトークンから導出した、主張の参照です。 */
export type ClaimLinks = Pick<Claim, 'speaker' | 'sourceId' | 'eventId' | 'placeId' | 'mentionedPersonIds'>;

const TOKEN_PATTERN = /@\[([^\]]*)\]\((person|place|event|source):([^)\s]+)\)/g;
const SPEAKER_DELIMITER_PATTERN = /^\s*[:：]/;
/** 発言者の人物を並べるときの区切り（空白と読点）だけで構成された文字列です。 */
const SPEAKER_SEPARATOR_PATTERN = /^[\s、,，]*$/;

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
    case 'source':
      return target.sources.find((source) => source.id === id)?.title;
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

/**
 * 本文の先頭に並んだ発言者の人物のIDを、書かれた順に（重複を含めて）返します。発言者がいない場合は空の配列を返します。
 * 先頭から「人物のメンション」と「区切りだけの文字列」が交互に続き、最後の人物の直後がコロンで始まる場合に限り、発言者とみなします。
 */
function findSpeakerPersonIds(segments: ContentSegment[]): Id[] {
  const personIds: Id[] = [];
  for (const segment of segments) {
    if (segment.type === 'mention') {
      if (segment.kind !== 'person') return [];
      personIds.push(segment.id);
    } else if (SPEAKER_DELIMITER_PATTERN.test(segment.text)) {
      return personIds;
    } else if (personIds.length === 0 || !SPEAKER_SEPARATOR_PATTERN.test(segment.text)) {
      return [];
    }
  }
  return [];
}

/** 本文のトークンから、主張の参照を導出します。規則はこのファイル冒頭のコメントを参照してください。 */
export function deriveClaimLinks(content: string): ClaimLinks {
  const segments = parseContent(content);
  const speakerPersonIds = findSpeakerPersonIds(segments);

  const mentions = segments.filter((segment) => segment.type === 'mention').slice(speakerPersonIds.length);
  const firstIdOf = (kind: MentionKind) => mentions.find((mention) => mention.kind === kind)?.id;
  const sourceId = firstIdOf('source');
  const eventId = firstIdOf('event');
  const placeId = firstIdOf('place');

  let speaker: Speaker;
  if (speakerPersonIds.length > 0) {
    speaker = { kind: 'person', personIds: [...new Set(speakerPersonIds)] };
  } else {
    speaker = sourceId === undefined ? { kind: 'user' } : { kind: 'source' };
  }

  // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
  const links: ClaimLinks = {
    speaker,
    mentionedPersonIds: [
      ...new Set(mentions.filter((mention) => mention.kind === 'person').map((mention) => mention.id)),
    ],
  };
  if (sourceId !== undefined) links.sourceId = sourceId;
  if (eventId !== undefined) links.eventId = eventId;
  if (placeId !== undefined) links.placeId = placeId;
  return links;
}

/**
 * 下書きを本文に変換します。
 * text 中の「@表示名」のうち mentions に登録されたものをトークンに置き換え、それ以外の「@」は文字のまま残します。
 */
export function draftToContent(draft: ClaimDraft): string {
  // 「山田」と「山田花子」のように前方一致で重なる表示名は、長いものを先に照合する
  const mentions = [...draft.mentions].sort((a, b) => b.label.length - a.label.length);
  let content = '';
  let index = 0;
  while (index < draft.text.length) {
    const matched =
      draft.text[index] === '@'
        ? mentions.find((mention) => draft.text.startsWith(mention.label, index + 1))
        : undefined;
    if (matched) {
      content += formatMention(matched);
      index += 1 + matched.label.length;
    } else {
      content += draft.text[index];
      index += 1;
    }
  }
  return content;
}

/**
 * 保存済みの主張を下書きに変換します。
 *
 * メンション導入前に保存された主張は、参照を項目（speaker・sourceId など）にだけ持ち、本文にトークンを持ちません。
 * そのまま編集して保存すると参照が失われるため、本文から導出できない参照を、発言者は先頭に、
 * それ以外は末尾にメンションとして補います。
 */
export function claimToDraft(claim: Claim, target: Case): ClaimDraft {
  const segments = resolveContent(claim.content, target);
  const mentions: DraftMention[] = segments
    .filter((segment) => segment.type === 'mention')
    .map(({ kind, id, label }) => ({ kind, id, label }));
  let text = contentToPlainText(claim.content, target);

  const derived = deriveClaimLinks(claim.content);
  const supplement = (kind: MentionKind, id: Id): DraftMention => {
    const label = findEntityName(target, kind, id);
    if (label === undefined) throw new Error(`主張が存在しない参照を持っています: ${kind}:${id}`);
    const mention = { kind, id, label };
    mentions.push(mention);
    return mention;
  };

  if (claim.speaker.kind === 'person' && derived.speaker.kind !== 'person') {
    const speakers = claim.speaker.personIds.map((id) => `@${supplement('person', id).label}`);
    text = `${speakers.join(' ')}: ${text}`;
  }
  const missing: [MentionKind, Id | undefined][] = [
    ...claim.mentionedPersonIds
      .filter((id) => !derived.mentionedPersonIds.includes(id))
      .map((id): [MentionKind, Id] => ['person', id]),
    ['event', derived.eventId === undefined ? claim.eventId : undefined],
    ['place', derived.placeId === undefined ? claim.placeId : undefined],
    ['source', derived.sourceId === undefined ? claim.sourceId : undefined],
  ];
  for (const [kind, id] of missing) {
    if (id !== undefined) text += ` @${supplement(kind, id).label}`;
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
