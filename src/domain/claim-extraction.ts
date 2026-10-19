/**
 * LLM が聴取の本文から抽出した証言の候補を、原文とケースに照らし合わせるロジック
 *
 * 記事の本文や動画の文字起こしから、誰が・何を・いつ・どこで述べたかを拾う作業を助けるため、LLM に証言の候補を出させます。
 * LLM の出力はそのまま保存せず、候補として示し、ユーザーが1件ずつ証言の入力欄で確かめてから保存します。
 *
 * 候補の扱いの規則:
 * - 引用（原文）が本文に一字一句ない候補は示さず、捨てた件数だけを返します。
 *   LLM がでっち上げた発言を、原文に裏付けられた証言として登録しないためです（照らし合わせは src/domain/transcript.ts の findQuoteRange）。
 * - 動画の位置（秒数）は LLM に出させず、引用の位置から補います（quoteSecondsAt）。
 * - 人物の名前は登録済みの人物の名前・別名（Person.name・Person.aliases）と、場所の名前は登録済みの場所の名前と、
 *   正規化した完全一致で照らし合わせます（normalizeName）。一致しない名前は、新規作成の候補として示します。
 * - 日時は、本文のメンションと同じ表記（src/domain/date-input.ts の parseDateInput）で解釈します。
 *   解釈できない日時は時刻参照を持たせず、LLM が出した文字列（whenText）だけを参考として示します。
 * - 同じ聴取で書き起こし済みの引用（この聴取の出典の ClaimSource.quote）と範囲が重なる候補は、捨てずに印（overlapsTranscribed）を付けます。
 *   同じ範囲から別の人物の発言を拾い直す場合もあるため、判断はユーザーに任せます。
 * - 別の資料から登録済みの証言と同じ事柄を述べていそうな候補は、LLM にその証言のIDを示させます（sameClaimIds）。
 *   LLM に渡す既存の証言は、本文に名前が出てくる人物・場所に触れる証言に絞ります（selectExistingClaimsForExtraction）。
 *   ケースに無いIDは捨てます。同じ証言として出典を書き足すか、新しい証言にして照合でつなぐかは、ユーザーが決めます。
 *
 * 候補を証言の入力欄の初期値に直すとき（candidateToClaimDraft）は、聴取の媒体（聴取者）を発言者か経由に含めます
 * （記事の地の文は媒体の記述であり、記事に載った発言は媒体を通じて伝わったものであるためです）。
 */
import { z } from 'zod';
import { parseDateInput } from './date-input';
import { buildTimeline, describeClaimAttribution } from './case-views';
import { interviewIdsOf, sourceForInterview, viaPersonIdsOf } from './claim-sources';
import { dateMentionOf, resolveContent, type ClaimDraft, type DraftMention, type MentionKind } from './mention';
import { findQuoteRange, quoteSecondsAt, type TextRange } from './transcript';
import type { Case, Claim, ClaimQuote, Id, Interview, TimeRef } from './types';

/**
 * LLM に出させる証言の候補1件の形式です。人物と場所は、IDではなく名前で受け取ります。
 * 注意: 構造化出力の strict モード（OpenAI など）は省略可能な項目を受け付けないため、任意の項目も null で表します。
 */
export const ExtractedClaimSchema = z.object({
  speakerName: z
    .string()
    .nullable()
    .describe('発言者の名前。記者の地の文など、資料そのものの記述の場合は null'),
  viaNames: z
    .array(z.string())
    .describe('発言が伝わった経由の人物・組織・媒体の名前。発言者に近い順。直接の発言なら空配列'),
  title: z.string().nullable().describe('内容が長い場合の短い見出し。不要なら null'),
  content: z.string().describe('証言の内容。発言者が述べた事柄を、資料の言葉に沿って簡潔にまとめた文'),
  quote: z
    .string()
    .describe('証言の根拠となる本文の原文。本文から一字一句そのまま（改行・記号を含めて）抜き出した、連続した範囲'),
  when: z
    .string()
    .nullable()
    .describe('証言が述べている出来事の日時。「1998年8月12日21時」「1998年8月」のように年を含めた表記。分からなければ null'),
  placeName: z.string().nullable().describe('証言が述べている出来事の場所の名前。分からなければ null'),
  mentionedPersonNames: z
    .array(z.string())
    .describe('証言の内容の中で言及している人物・組織・物の名前（発言者と経由を除く）'),
  sameClaimIds: z
    .array(z.string())
    .describe('「既存の証言」のうち、この候補と同じ事柄を述べていそうな証言のID。一覧にあるIDだけを使う。無ければ空配列'),
});

/** LLM に出させる抽出結果の形式です。 */
export const ExtractionResultSchema = z.object({
  claims: z.array(ExtractedClaimSchema),
});

/** LLM が出した証言の候補1件です。 */
export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

/** 候補の中の人物・場所の名前を、登録済みのものと照らし合わせた結果です。 */
export type ResolvedName = { status: 'registered'; id: Id; name: string } | { status: 'new'; name: string };

/** 原文と照らし合わせ、人物・場所・日時を解釈した証言の候補です。 */
export type ClaimCandidate = {
  /** 候補を見分けるキーです。LLM の出力の中での順番（0始まり）を文字列にしたものです。 */
  key: string;
  title?: string;
  content: string;
  /** 本文の中に見つかった引用です。動画の文字起こしでは、引用の位置から補った秒数を持ちます。 */
  quote: ClaimQuote;
  /** 同じ聴取で書き起こし済みの引用と、範囲が重なるかどうかです。 */
  overlapsTranscribed: boolean;
  /**
   * LLM が「同じ事柄を述べていそう」と示した既存の証言のIDです。ケースに無いIDは捨て、重複は1つにまとめます。
   * 同じ証言かどうか（出典を書き足すか、新しい証言にして照合でつなぐか）は、ユーザーが確かめて決めます。
   */
  sameClaimIds: Id[];
  /** 日時を本文のメンションと同じ表記で解釈できた場合の時刻参照です。 */
  when?: TimeRef;
  /** LLM が出した日時の文字列です。解釈できなかった場合に、参考として示します。 */
  whenText?: string;
  /** 発言者です。LLM が発言者を出さなかった場合（記者の地の文など）は undefined です。 */
  speaker?: ResolvedName;
  via: ResolvedName[];
  place?: ResolvedName;
  mentioned: ResolvedName[];
};

/** 抽出結果を照らし合わせた結果です。 */
export type ClaimCandidates = {
  candidates: ClaimCandidate[];
  /** 引用が本文に見つからず、捨てた候補の件数です。 */
  discardedCount: number;
};

/**
 * 名前を照らし合わせ用に正規化します。
 * 前後の空白を除き、連続する空白（全角の空白を含みます）を半角の空白1つにし、大文字小文字を区別しないよう小文字にします。
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 名前を、登録済みの名前の一覧（IDと、照らし合わせる名前の組）と照らし合わせます。 */
function resolveName(name: string, entries: { id: Id; name: string; keys: string[] }[]): ResolvedName {
  const normalized = normalizeName(name);
  const matched = entries.find((entry) => entry.keys.some((key) => normalizeName(key) === normalized));
  return matched ? { status: 'registered', id: matched.id, name: matched.name } : { status: 'new', name: name.trim() };
}

/** 本文を持つ聴取を返します。聴取が無いか、本文が無い場合は、照らし合わせられないためエラーにします。 */
function interviewWithTranscript(target: Case, interviewId: Id): Interview & { transcript: string } {
  const interview = target.interviews.find((item) => item.id === interviewId);
  if (interview === undefined) throw new Error(`資料が見つかりません: ${interviewId}`);
  const { transcript } = interview;
  if (transcript === undefined) throw new Error(`本文の無い資料の候補は照らし合わせられません: ${interviewId}`);
  return { ...interview, transcript };
}

/** 2つの範囲が1文字以上重なるかどうかを返します。 */
function overlaps(a: TextRange, b: TextRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * LLM が出した証言の候補を、聴取の本文とケースに照らし合わせます。規則はこのファイル冒頭のコメントを参照してください。
 * 照らし合わせはケースの現在の状態に対して行うため、候補から証言を保存して人物が増えた後に呼び直すと、新しい人物とも一致します。
 */
export function buildClaimCandidates(target: Case, interviewId: Id, extracted: ExtractedClaim[]): ClaimCandidates {
  const { transcript } = interviewWithTranscript(target, interviewId);
  const persons = target.persons.map((person) => ({ id: person.id, name: person.name, keys: [person.name, ...(person.aliases ?? [])] }));
  const places = target.places.map((place) => ({ id: place.id, name: place.name, keys: [place.name] }));
  const transcribedRanges = target.claims.flatMap((claim) => {
    const quote = sourceForInterview(claim, interviewId)?.quote;
    if (quote === undefined) return [];
    const range = findQuoteRange(transcript, quote.text);
    return range ? [range] : [];
  });
  const claimIds = new Set(target.claims.map((claim) => claim.id));

  const candidates = extracted.flatMap((item, index): ClaimCandidate[] => {
    const range = findQuoteRange(transcript, item.quote);
    if (range === undefined) return [];

    const seconds = quoteSecondsAt(transcript, range.start);
    const title = item.title?.trim();
    const when = item.when === null ? null : parseDateInput(item.when);
    const candidate: ClaimCandidate = {
      key: String(index),
      content: item.content,
      quote: { text: item.quote, ...(seconds !== undefined && { seconds }) },
      overlapsTranscribed: transcribedRanges.some((transcribed) => overlaps(transcribed, range)),
      // LLM の出力を裏付けなしに信用しないため、ケースに無い証言のIDは捨てる
      sameClaimIds: [...new Set(item.sameClaimIds)].filter((claimId) => claimIds.has(claimId)),
      via: item.viaNames.map((name) => resolveName(name, persons)),
      mentioned: item.mentionedPersonNames.map((name) => resolveName(name, persons)),
    };
    if (title) candidate.title = title;
    if (when !== null) candidate.when = when;
    if (item.when !== null) candidate.whenText = item.when;
    if (item.speakerName !== null) candidate.speaker = resolveName(item.speakerName, persons);
    if (item.placeName !== null) candidate.place = resolveName(item.placeName, places);
    return [candidate];
  });

  return { candidates, discardedCount: extracted.length - candidates.length };
}

/** 候補から新規作成するエンティティです。名前だけを持ち、詳細はエンティティの編集画面で後から入力します。 */
export type NewEntity = { kind: MentionKind; id: Id; name: string };

/** 候補を、証言の入力欄の初期値に直したものです。 */
export type CandidateClaimDraft = {
  title?: string;
  /** 本文の下書きです。人物・場所・日時をメンションとして含みます。 */
  draft: ClaimDraft;
  speaker: { personIds: Id[]; viaPersonIds: Id[] };
  /** 一致する登録済みの人物・場所が無いため、証言とあわせて新規作成するエンティティです。 */
  newEntities: NewEntity[];
};

/**
 * 本文の中で、メンションの表示名が最初に現れる位置に「@」を付けます。本文に表示名が無いメンションは、本文の末尾に足します。
 * 表示名の長いメンションから順に探し、すでにメンションにした範囲と重なる位置は使いません（「山田」と「山田花子」が重ならないように）。
 */
function insertMentions(content: string, mentions: DraftMention[]): string {
  const marked: TextRange[] = [];
  const appended: DraftMention[] = [];
  for (const mention of mentions.toSorted((a, b) => b.label.length - a.label.length)) {
    let start = content.indexOf(mention.label);
    while (start !== -1 && marked.some((range) => overlaps(range, { start, end: start + mention.label.length }))) {
      start = content.indexOf(mention.label, start + 1);
    }
    if (start === -1) appended.push(mention);
    else marked.push({ start, end: start + mention.label.length });
  }

  // 後ろの位置から「@」を差し込み、前の位置がずれないようにする
  let text = content;
  for (const { start } of marked.toSorted((a, b) => b.start - a.start)) {
    text = `${text.slice(0, start)}@${text.slice(start)}`;
  }
  const suffix = mentions.filter((mention) => appended.includes(mention)).map((mention) => ` @${mention.label}`).join('');
  return `${text}${suffix}`;
}

/**
 * 候補を、証言の入力欄の初期値（見出し・本文の下書き・発言者と経由・新規作成するエンティティ）に直します。
 *
 * - 本文の下書きは、日時のメンションを先頭に置き、場所と言及した人物を、本文の中の名前を「@」のメンションにして表します
 *   （本文に名前が無い場合は末尾に足します）。
 * - 発言者の分からない候補は、聴取の媒体（聴取者）を発言者にします（記者の地の文は、媒体そのものの記述のためです）。
 *   発言者でない媒体は、経由の最後に置きます（媒体を通じて伝わった発言で、ユーザーが直接見聞きした相手は媒体のためです）。
 *   候補の経由に媒体が途中に挙がっていても、最後に移します。
 *   媒体の無い聴取では、経由を足さず、発言者の分からない候補は発言者を選ばずにおきます（ユーザーが入力欄で選びます）。
 * - 転載の原典を持つ聴取では、媒体は「原典の媒体 → 転載した媒体（聴取者）」の順に伝えたものとして扱います。
 *   発言者の分からない候補は原典の媒体を発言者にし、経由の最後には媒体をこの順に並べます。
 * - 一致しない名前は、同じ種類・同じ名前（正規化後）ごとに1件だけ、createId で振ったIDで新規作成します。
 */
export function candidateToClaimDraft(
  target: Case,
  interviewId: Id,
  candidate: ClaimCandidate,
  createId: () => Id
): CandidateClaimDraft {
  const interview = interviewWithTranscript(target, interviewId);
  // 発言を伝えた媒体の並び（転載の資料では、原典の媒体が先、転載した媒体が後）
  const mediaIds = [...new Set([interview.origin?.publisherPersonId, interview.interviewerPersonId].filter((id) => id !== undefined))];
  const newEntities: NewEntity[] = [];
  const idOf = (kind: MentionKind, resolved: ResolvedName): Id => {
    if (resolved.status === 'registered') return resolved.id;
    const existing = newEntities.find((entity) => entity.kind === kind && normalizeName(entity.name) === normalizeName(resolved.name));
    if (existing) return existing.id;
    const created = { kind, id: createId(), name: resolved.name };
    newEntities.push(created);
    return created.id;
  };
  const mentionOf = (kind: MentionKind, resolved: ResolvedName): DraftMention => ({ kind, id: idOf(kind, resolved), label: resolved.name });

  const speakerId = candidate.speaker ? idOf('person', candidate.speaker) : mediaIds[0];
  // 媒体は候補の経由での位置にかかわらず経由の最後に、原典の媒体 → 転載した媒体の順で並べる（伝わった順を逆に記録しないため）
  const viaPersonIds = [
    ...[...new Set(candidate.via.map((name) => idOf('person', name)))].filter((id) => !mediaIds.includes(id)),
    ...mediaIds,
  ].filter((id) => id !== speakerId);

  const entityMentions = [
    ...(candidate.place ? [mentionOf('place', candidate.place)] : []),
    ...candidate.mentioned.map((name) => mentionOf('person', name)),
  ].filter((mention, index, all) => all.findIndex((other) => other.kind === mention.kind && other.id === mention.id) === index);
  const dateMention = candidate.when === undefined ? undefined : dateMentionOf(candidate.when);
  const body = insertMentions(candidate.content, entityMentions);

  const result: CandidateClaimDraft = {
    draft: {
      text: dateMention ? `@${dateMention.label} ${body}` : body,
      mentions: dateMention ? [dateMention, ...entityMentions] : entityMentions,
    },
    speaker: { personIds: speakerId === undefined ? [] : [speakerId], viaPersonIds },
    newEntities,
  };
  if (candidate.title) result.title = candidate.title;
  return result;
}

/** 抽出のときに LLM に渡す既存の証言の、上限の件数です（プロンプトが長くなりすぎないようにするため）。 */
export const MAX_EXISTING_CLAIMS_FOR_EXTRACTION = 30;

/** LLM に渡す既存の証言1件の要約の、上限の文字数です。 */
export const MAX_EXISTING_CLAIM_SUMMARY_LENGTH = 300;

/** 抽出のときに LLM に渡す既存の証言1件です。 */
export type ExistingClaimForExtraction = {
  id: Id;
  /** 「発言者（経由）: 見出し — 本文」を1行にまとめた要約です。 */
  summary: string;
};

/** 名前を本文から探すために、空白を除いて小文字にします（「山田 花子」と本文の「山田花子」を同じとみなすため）。 */
function compactForSearch(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/** 証言を、LLM に渡す1行の要約にします。改行は空白に置き換え、上限の文字数を超える分は省きます。 */
function summarizeClaim(target: Case, claim: Claim): string {
  const body = resolveContent(claim.content, target)
    .map((segment) => (segment.type === 'mention' ? segment.label : segment.text))
    .join('');
  const text = `${describeClaimAttribution(target, claim)}: ${claim.title ? `${claim.title} — ` : ''}${body}`.replace(/\s+/g, ' ').trim();
  return text.length > MAX_EXISTING_CLAIM_SUMMARY_LENGTH ? `${text.slice(0, MAX_EXISTING_CLAIM_SUMMARY_LENGTH)}…` : text;
}

/**
 * 資料から証言を抽出するときに、「同じ事柄を述べていそうな既存の証言」を探させるため、LLM に渡す既存の証言を選びます。
 *
 * ケース全体の証言を渡すとプロンプトが長くなるため、抽出する本文 text に名前（人物は別名も含みます）が出てくる人物・場所に
 * 触れている証言（発言者・経由・言及・場所）だけを選びます。本文に出てくる名前を多く含む証言から順に、
 * 最大 MAX_EXISTING_CLAIMS_FOR_EXTRACTION 件を返します。同じ数の証言は、時系列ボードの並び順に並べます。
 * この資料（interviewId）をすでに出典に持つ証言は返しません。同じ資料の中の重なりは、書き起こし済みの印（overlapsTranscribed）で示すためです。
 */
export function selectExistingClaimsForExtraction(target: Case, interviewId: Id, text: string): ExistingClaimForExtraction[] {
  const searchText = compactForSearch(text);
  const appears = (names: string[]) => names.some((name) => compactForSearch(name) !== '' && searchText.includes(compactForSearch(name)));
  const appearingPersonIds = new Set(
    target.persons.filter((person) => appears([person.name, ...(person.aliases ?? [])])).map((person) => person.id)
  );
  const appearingPlaceIds = new Set(target.places.filter((place) => appears([place.name])).map((place) => place.id));

  const scored = buildTimeline(target).items.flatMap(({ view: { claim } }) => {
    if (interviewIdsOf(claim).includes(interviewId)) return [];
    const speakerIds = claim.speaker.kind === 'person' ? claim.speaker.personIds : [];
    const personIds = new Set([...speakerIds, ...viaPersonIdsOf(claim), ...claim.mentionedPersonIds]);
    const score =
      [...personIds].filter((personId) => appearingPersonIds.has(personId)).length +
      (claim.placeId !== undefined && appearingPlaceIds.has(claim.placeId) ? 1 : 0);
    return score > 0 ? [{ claim, score }] : [];
  });

  return scored
    // Array.prototype.sort は安定ソートのため、同じ数の証言は時系列ボードの並び順を保つ
    .toSorted((a, b) => b.score - a.score)
    .slice(0, MAX_EXISTING_CLAIMS_FOR_EXTRACTION)
    .map(({ claim }) => ({ id: claim.id, summary: summarizeClaim(target, claim) }));
}
