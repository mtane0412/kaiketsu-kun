/**
 * 読み込んだケースデータの検証
 *
 * JSONから読み込んだデータは型の保証が無いため、次の3点を検証してから Case として扱います。
 * 1. 形式（必須項目と値の型）
 * 2. 日時の表記（ISO 8601の部分表記として解釈できること）
 * 3. 参照の整合性（IDの参照先と、証言の本文のメンションの参照先がケース内に存在すること）と、経由の規則
 *
 * 時系列ボードの並び順（timelineOrder）を持たない頃のデータは、当時の表示順を並び順として補います。
 * 出来事（Event）に証言を束ねていた頃のデータは、束を解いて証言だけを並べる形に変換します（src/domain/legacy-events.ts）。
 * 発言者を本文の先頭に「@人物:」と書いていた頃のデータは、本文から発言者の記法を取り除きます（発言者は speaker に保存済みです）。
 * ソース（Source）を人物とは別の種類で持っていた頃のデータは、ソースを人物に統合します（migrateLegacySources）。
 * 日時を区間で持っていた頃のデータは、最も早い時点だけを日時として引き継ぎます（migrateLegacyTimeRef）。
 * 証言が述べられた時点（statedAt）を持っていた頃のデータは、その時点を取り除きます（未知のキーとして捨てます）。
 *
 * 注意: 検証に失敗した場合は、問題点を列挙した例外を投げます。不正なデータを部分的に受け入れることはしません。
 */
import { z } from 'zod';
import { deriveClaimLinks, parseContent, stripLegacySpeakerPrefix, type MentionKind } from './mention';
import { migrateLegacyEvents, type LegacyClaim } from './legacy-events';
import { isValidTimeRef } from './time-ref';
import { settleTimelineItems } from './timeline-order';
import type { Case, Id, Person, Speaker } from './types';

const idSchema = z.string().min(1);

/**
 * エンティティの画像です。data URL だけを受け付けます。
 * 読み込んだファイルに外部のURLが書かれていても、表示の際に外部へ通信しないようにするためです。
 */
const imageDataUrlSchema = z.string().startsWith('data:image/', '画像は data URL（data:image/...）で指定してください');

/** 日時を区間（earliest / latest）と原文表記で持っていた頃の時刻参照です。 */
const legacyTimeRefSchema = z.object({
  text: z.string(),
  earliest: z.string().optional(),
  latest: z.string().optional(),
  order: z.number().optional(),
});

/**
 * 日時を区間で持っていた頃の時刻参照を、現在の形（ISO 8601の部分表記の文字列）に変換します。
 *
 * 引き継ぐのは最も早い時点（earliest）だけです。最も遅い時点（latest）と原文表記（text）・
 * 並び順（order）は、現在の形に変換先が無いため引き継ぎません。
 * それ以外の値は、そのまま返して後段の検証に委ねます。
 */
function migrateLegacyTimeRef(value: unknown): unknown {
  const legacy = legacyTimeRefSchema.safeParse(value);
  return legacy.success ? legacy.data.earliest : value;
}

const TIME_REF_FORMAT_EXAMPLES = '1998 / 1998-08 / 1998-08-12 / 1998-08-12T19:00';

const timeRefSchema = z.preprocess(
  migrateLegacyTimeRef,
  z
    .string()
    .refine(isValidTimeRef, `日時は ${TIME_REF_FORMAT_EXAMPLES} のいずれかの形式で指定してください`)
    .optional()
);

/**
 * 発言者を1人しか持てなかった頃のデータ（speaker.personId）を、現在の形（speaker.personIds）に変換します。
 * それ以外の値は、そのまま返して後段の検証に委ねます。
 */
function migrateLegacySpeaker(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (!('personId' in value) || 'personIds' in value) return value;
  const { personId, ...rest } = value;
  return { ...rest, personIds: [personId] };
}

const speakerSchema = z.preprocess(
  migrateLegacySpeaker,
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('person'), personIds: z.array(idSchema).min(1) }),
    // ソースを人物に統合する前のデータの「ソース自体の記述」です。migrateLegacySources で人物の発言に変換します
    z.object({ kind: z.literal('source') }),
    z.object({ kind: z.literal('user') }),
  ])
);

const caseSchema = z.object({
  id: idSchema,
  name: z.string(),
  // ソースを人物に統合する前のデータだけが持つ項目です。種類（kind）は引き継がないため、検証せずに取り除きます
  sources: z
    .array(
      z.object({
        id: idSchema,
        title: z.string(),
        url: z.string().optional(),
        publishedAt: legacyTimeRefSchema.optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
  persons: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      aliases: z.array(z.string()).optional(),
      imageDataUrl: imageDataUrlSchema.optional(),
      iconText: z.string().min(1, 'アイコンの文字を指定しない場合は、項目ごと省略してください').optional(),
      note: z.string().optional(),
    })
  ),
  places: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      imageDataUrl: imageDataUrlSchema.optional(),
      note: z.string().optional(),
    })
  ),
  // 出来事を廃止する前のデータだけが持つ項目です（migrateLegacyEvents で束を解きます）
  events: z.array(z.object({ id: idSchema, title: z.string() })).optional(),
  claims: z.array(
    // 評価（assessment）を廃止する前に保存したデータも読み込めるよう、未知のキーは拒否せずに取り除く（z.object の既定の動作）
    z.object({
      id: idSchema,
      speaker: speakerSchema,
      // ソースを人物に統合する前のデータは viaPersonIds を持たず、sourceId を持ちます
      viaPersonIds: z.array(idSchema).optional(),
      sourceId: idSchema.optional(),
      locator: z.string().optional(),
      title: z.string().optional(),
      content: z.string(),
      // 出来事を廃止する前のデータだけが持つ項目です
      eventId: idSchema.optional(),
      mentionedPersonIds: z.array(idSchema),
      when: timeRefSchema.optional(),
      placeId: idSchema.optional(),
    })
  ),
  relationships: z.array(
    z.object({
      id: idSchema,
      fromPersonId: idSchema,
      toPersonId: idSchema,
      label: z.string(),
      directed: z.boolean(),
      basisClaimIds: z.array(idSchema),
    })
  ),
  // 並び順を持たない頃に保存したデータも読み込めるよう、省略を許す（parseCase で当時の表示順を補う）
  timelineOrder: z.array(z.string()).optional(),
});

/**
 * ケース内の規則違反（参照切れ、ユーザーの推測に付いた経由）を列挙します。
 * 違反が無い場合は空の配列を返します。ストアの操作時と読み込み時の両方で使用します。
 */
export function findCaseViolations(target: Case): string[] {
  const violations: string[] = [];
  const idsOf = (items: { id: string }[]) => new Set(items.map((item) => item.id));
  const personIds = idsOf(target.persons);
  const placeIds = idsOf(target.places);
  const claimIds = idsOf(target.claims);

  const mentionTargets: Record<MentionKind, { ids: Set<string>; name: string }> = {
    person: { ids: personIds, name: '人物' },
    place: { ids: placeIds, name: '場所' },
  };

  const check = (known: Set<string>, id: string | undefined, entityName: string) => {
    if (id !== undefined && !known.has(id)) {
      violations.push(`存在しない${entityName}を参照しています: ${id}`);
    }
  };

  /**
   * 文章（証言の本文、エンティティのメモ）のトークンを検証します。
   * 人物・場所のメンションは参照先がケース内に存在すること、日時のメンションは日時として解釈できることを確かめます。
   */
  const checkMentions = (content: string) => {
    for (const segment of parseContent(content)) {
      if (segment.type !== 'mention') continue;
      if (segment.kind === 'date') {
        if (!isValidTimeRef(segment.id)) violations.push(`日時を解釈できません: ${segment.id}`);
        continue;
      }
      check(mentionTargets[segment.kind].ids, segment.id, mentionTargets[segment.kind].name);
    }
  };

  for (const entity of [...target.persons, ...target.places]) {
    if (entity.note !== undefined) checkMentions(entity.note);
  }
  for (const claim of target.claims) {
    if (claim.speaker.kind === 'person') claim.speaker.personIds.forEach((id) => check(personIds, id, '人物'));
    claim.viaPersonIds.forEach((id) => check(personIds, id, '人物'));
    if (claim.speaker.kind === 'user' && claim.viaPersonIds.length > 0) {
      violations.push(`ユーザーの推測に経由は指定できません: ${claim.id}`);
    }
    check(placeIds, claim.placeId, '場所');
    claim.mentionedPersonIds.forEach((id) => check(personIds, id, '人物'));
    // 同じ種類の2つ目以降のメンションは上記の項目に現れないため、本文のトークンも検証する
    checkMentions(claim.content);
  }
  for (const relationship of target.relationships) {
    check(personIds, relationship.fromPersonId, '人物');
    check(personIds, relationship.toPersonId, '人物');
    relationship.basisClaimIds.forEach((id) => check(claimIds, id, '証言'));
  }
  return violations;
}

type ParsedCase = z.infer<typeof caseSchema>;

/** ソースを人物に統合する前の本文が含む、ソースへのメンションです。 */
const LEGACY_SOURCE_TOKEN_PATTERN = /@\[([^\]]*)\]\(source:([^)\s]+)\)/g;
/** 本文の末尾に置かれた、ソースへのメンションです（直前の空白を含みます）。 */
const LEGACY_TRAILING_SOURCE_TOKEN_PATTERN = /\s*@\[[^\]]*\]\(source:([^)\s]+)\)\s*$/;

/**
 * ソース（Source）を人物とは別の種類で持っていた頃のデータを、現在の形に変換します。
 *
 * - ソースは人物に変換します（IDは引き継ぎます）。URL・公開時点・メモは、人物のメモにまとめます。
 *   同じ名前の人物が登録済みの場合は、人物を増やさずにその人物へまとめます（同名の人物が2人いると、入力欄のメンションを区別できないためです）。
 * - 人物の証言は、ソースだった人物を経由（viaPersonIds）に移します。
 * - 「ソース自体の記述」は、ソースだった人物の発言にします。
 * - 本文の末尾の「@ソース」は、ソースを指定するための書き方だったため、発言者または経由に移した場合は取り除きます。
 *   それ以外の「@ソース」（文中のもの、ユーザーの推測のもの）は、人物のメンションに変換します。
 *
 * 変換の必要が無いデータは、そのままの内容で返します。
 */
function migrateLegacySources(data: ParsedCase): { persons: Person[]; claims: LegacyClaim[] } {
  const persons: Person[] = [...data.persons];
  const personIdBySourceId = new Map<Id, Id>();

  for (const source of data.sources ?? []) {
    const noteLines = [source.note, source.url, source.publishedAt && `公開・刊行: ${source.publishedAt.text}`].filter(
      (line): line is string => Boolean(line)
    );
    const sameNameIndex = persons.findIndex((person) => person.name === source.title);
    const sameName = persons[sameNameIndex];
    if (sameName) {
      personIdBySourceId.set(source.id, sameName.id);
      const note = [sameName.note, ...noteLines].filter(Boolean).join('\n');
      if (note) persons[sameNameIndex] = { ...sameName, note };
      continue;
    }
    if (persons.some((person) => person.id === source.id)) {
      throw new Error(`ソースを人物に変換できません。同じIDの人物が存在します: ${source.id}`);
    }
    personIdBySourceId.set(source.id, source.id);
    persons.push({ id: source.id, name: source.title, ...(noteLines.length > 0 && { note: noteLines.join('\n') }) });
  }

  const personIdOf = (sourceId: Id): Id => {
    const personId = personIdBySourceId.get(sourceId);
    if (personId === undefined) throw new Error(`ケースデータの参照に問題があります\n存在しないソースを参照しています: ${sourceId}`);
    return personId;
  };

  const claims = data.claims.map(({ speaker: parsedSpeaker, sourceId, viaPersonIds, content: parsedContent, when, ...rest }): LegacyClaim => {
    const sourcePersonId = sourceId === undefined ? undefined : personIdOf(sourceId);

    let speaker: Speaker;
    let via: Id[] = viaPersonIds ?? [];
    if (parsedSpeaker.kind === 'source') {
      if (sourcePersonId === undefined) {
        throw new Error(`ケースデータの参照に問題があります\nソース自体の記述にソースがありません: ${rest.id}`);
      }
      speaker = { kind: 'person', personIds: [sourcePersonId] };
    } else {
      speaker = parsedSpeaker;
      if (parsedSpeaker.kind === 'person' && viaPersonIds === undefined && sourcePersonId !== undefined) via = [sourcePersonId];
    }

    // 発言者または経由に移したソースは、本文の末尾のメンションを取り除く
    let content = parsedContent;
    const trailingSourceId = LEGACY_TRAILING_SOURCE_TOKEN_PATTERN.exec(content)?.[1];
    if (speaker.kind === 'person' && trailingSourceId !== undefined && trailingSourceId === sourceId) {
      content = content.replace(LEGACY_TRAILING_SOURCE_TOKEN_PATTERN, '');
    }
    content = content.replaceAll(
      LEGACY_SOURCE_TOKEN_PATTERN,
      (_token, label: string, id: Id) => `@[${label}](person:${personIdOf(id)})`
    );
    content = stripLegacySpeakerPrefix(content, speaker);

    return {
      ...rest,
      // 日時を持たない証言は、項目ごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
      ...(when !== undefined && { when }),
      speaker,
      viaPersonIds: via,
      content,
      // 人物のメンションに変換したソースを、言及している人物に加える
      mentionedPersonIds: [...new Set([...rest.mentionedPersonIds, ...deriveClaimLinks(content).mentionedPersonIds])],
    };
  });

  return { persons, claims };
}

/**
 * 型の保証が無いデータを検証し、Case として返します。
 * 検証に失敗した場合は、問題点を列挙した例外を投げます。
 */
export function parseCase(data: unknown): Case {
  const result = caseSchema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`ケースデータの形式が正しくありません\n${details}`);
  }

  const { sources: _legacySources, events, timelineOrder, ...current } = result.data;
  const { persons, claims: legacyClaims } = migrateLegacySources(result.data);
  let parsed: Case = { ...current, persons, ...migrateLegacyEvents({ events, claims: legacyClaims, timelineOrder }) };
  // 束は束ねた証言の日時の全体を区間としていたため、束を解くと、束の前後にあった証言と日時が矛盾する並びになる場合がある
  if (events && events.length > 0) {
    parsed = { ...parsed, timelineOrder: settleTimelineItems(parsed, parsed.timelineOrder) };
  }
  const violations = findCaseViolations(parsed);
  if (violations.length > 0) {
    throw new Error(`ケースデータの参照に問題があります\n${violations.join('\n')}`);
  }
  return parsed;
}
