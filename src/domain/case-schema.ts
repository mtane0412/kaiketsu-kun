/**
 * 読み込んだ案件データの検証
 *
 * JSONから読み込んだデータは型の保証が無いため、次の3点を検証してから Case として扱います。
 * 1. 形式（必須項目と値の型）
 * 2. 時刻表記（earliest / latest が解釈でき、区間が逆転していないこと）
 * 3. 参照の整合性（IDの参照先と、主張の本文のメンションの参照先が案件内に存在すること）と、経由の規則
 *
 * 時系列ボードの並び順（timelineOrder）を持たない頃のデータは、当時の表示順を並び順として補います。
 * 発言者を本文の先頭に「@人物:」と書いていた頃のデータは、本文から発言者の記法を取り除きます（発言者は speaker に保存済みです）。
 * ソース（Source）を人物とは別の種類で持っていた頃のデータは、ソースを人物に統合します（migrateLegacySources）。
 *
 * 注意: 検証に失敗した場合は、問題点を列挙した例外を投げます。不正なデータを部分的に受け入れることはしません。
 */
import { z } from 'zod';
import { deriveClaimLinks, parseContent, stripLegacySpeakerPrefix, type MentionKind } from './mention';
import { isValidPartialIso, toInterval } from './time-ref';
import { legacyTimelineOrder } from './timeline-order';
import type { Case, Claim, Id, Person, Speaker } from './types';

const idSchema = z.string().min(1);

const timeRefSchema = z
  .object({
    text: z.string(),
    earliest: z.string().optional(),
    latest: z.string().optional(),
    order: z.number().optional(),
  })
  .superRefine((ref, context) => {
    for (const key of ['earliest', 'latest'] as const) {
      const value = ref[key];
      if (value !== undefined && !isValidPartialIso(value)) {
        context.addIssue({ code: 'custom', message: `${key} を解釈できません: ${value}` });
        return;
      }
    }
    if (ref.latest !== undefined && ref.earliest === undefined) {
      context.addIssue({ code: 'custom', message: 'latest を指定する場合は earliest も必要です' });
      return;
    }
    try {
      toInterval(ref);
    } catch (error) {
      context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) });
    }
  });

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
        publishedAt: timeRefSchema.optional(),
        note: z.string().optional(),
      })
    )
    .optional(),
  persons: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      aliases: z.array(z.string()).optional(),
      imageDataUrl: z.string().optional(),
      note: z.string().optional(),
    })
  ),
  places: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      note: z.string().optional(),
    })
  ),
  events: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      description: z.string().optional(),
    })
  ),
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
      statedAt: timeRefSchema.optional(),
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
 * 案件内の規則違反（参照切れ、ユーザーの推測に付いた経由）を列挙します。
 * 違反が無い場合は空の配列を返します。ストアの操作時と読み込み時の両方で使用します。
 */
export function findCaseViolations(target: Case): string[] {
  const violations: string[] = [];
  const idsOf = (items: { id: string }[]) => new Set(items.map((item) => item.id));
  const personIds = idsOf(target.persons);
  const placeIds = idsOf(target.places);
  const eventIds = idsOf(target.events);
  const claimIds = idsOf(target.claims);

  const mentionTargets: Record<MentionKind, { ids: Set<string>; name: string }> = {
    person: { ids: personIds, name: '人物' },
    place: { ids: placeIds, name: '場所' },
    event: { ids: eventIds, name: '出来事' },
  };

  const check = (known: Set<string>, id: string | undefined, entityName: string) => {
    if (id !== undefined && !known.has(id)) {
      violations.push(`存在しない${entityName}を参照しています: ${id}`);
    }
  };

  for (const claim of target.claims) {
    if (claim.speaker.kind === 'person') claim.speaker.personIds.forEach((id) => check(personIds, id, '人物'));
    claim.viaPersonIds.forEach((id) => check(personIds, id, '人物'));
    if (claim.speaker.kind === 'user' && claim.viaPersonIds.length > 0) {
      violations.push(`ユーザーの推測に経由は指定できません: ${claim.id}`);
    }
    check(eventIds, claim.eventId, '出来事');
    check(placeIds, claim.placeId, '場所');
    claim.mentionedPersonIds.forEach((id) => check(personIds, id, '人物'));
    // 同じ種類の2つ目以降のメンションは上記の項目に現れないため、本文のトークンも検証する
    for (const segment of parseContent(claim.content)) {
      if (segment.type === 'mention') check(mentionTargets[segment.kind].ids, segment.id, mentionTargets[segment.kind].name);
    }
  }
  for (const relationship of target.relationships) {
    check(personIds, relationship.fromPersonId, '人物');
    check(personIds, relationship.toPersonId, '人物');
    relationship.basisClaimIds.forEach((id) => check(claimIds, id, '主張'));
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
function migrateLegacySources(data: ParsedCase): { persons: Person[]; claims: Claim[] } {
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
    if (personId === undefined) throw new Error(`案件データの参照に問題があります\n存在しないソースを参照しています: ${sourceId}`);
    return personId;
  };

  const claims = data.claims.map(({ speaker: parsedSpeaker, sourceId, viaPersonIds, content: parsedContent, ...rest }): Claim => {
    const sourcePersonId = sourceId === undefined ? undefined : personIdOf(sourceId);

    let speaker: Speaker;
    let via: Id[] = viaPersonIds ?? [];
    if (parsedSpeaker.kind === 'source') {
      if (sourcePersonId === undefined) {
        throw new Error(`案件データの参照に問題があります\nソース自体の記述にソースがありません: ${rest.id}`);
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
    throw new Error(`案件データの形式が正しくありません\n${details}`);
  }

  const { sources: _legacySources, ...current } = result.data;
  const migrated = { ...current, ...migrateLegacySources(result.data) };
  const parsed: Case = { ...migrated, timelineOrder: migrated.timelineOrder ?? legacyTimelineOrder(migrated) };
  const violations = findCaseViolations(parsed);
  if (violations.length > 0) {
    throw new Error(`案件データの参照に問題があります\n${violations.join('\n')}`);
  }
  return parsed;
}
