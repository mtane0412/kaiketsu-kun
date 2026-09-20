/**
 * 読み込んだ案件データの検証
 *
 * JSONから読み込んだデータは型の保証が無いため、次の3点を検証してから Case として扱います。
 * 1. 形式（必須項目と値の型）
 * 2. 時刻表記（earliest / latest が解釈でき、区間が逆転していないこと）
 * 3. 参照の整合性（IDの参照先と、主張の本文のメンションの参照先が案件内に存在すること）と、主張のソース必須の規則
 *
 * 時系列ボードの並び順（timelineOrder）を持たない頃のデータは、当時の表示順を並び順として補います。
 *
 * 注意: 検証に失敗した場合は、問題点を列挙した例外を投げます。不正なデータを部分的に受け入れることはしません。
 */
import { z } from 'zod';
import { parseContent, type MentionKind } from './mention';
import { isValidPartialIso, toInterval } from './time-ref';
import { legacyTimelineOrder } from './timeline-order';
import type { Case } from './types';

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
    z.object({ kind: z.literal('source') }),
    z.object({ kind: z.literal('user') }),
  ])
);

const caseSchema = z.object({
  id: idSchema,
  name: z.string(),
  sources: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      kind: z.enum(['article', 'book', 'court-record', 'broadcast', 'web', 'fiction-episode', 'other']),
      url: z.string().optional(),
      publishedAt: timeRefSchema.optional(),
      note: z.string().optional(),
    })
  ),
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
      sourceId: idSchema.optional(),
      locator: z.string().optional(),
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
 * 案件内の規則違反（参照切れ、ソースの無い証言）を列挙します。
 * 違反が無い場合は空の配列を返します。ストアの操作時と読み込み時の両方で使用します。
 */
export function findCaseViolations(target: Case): string[] {
  const violations: string[] = [];
  const idsOf = (items: { id: string }[]) => new Set(items.map((item) => item.id));
  const sourceIds = idsOf(target.sources);
  const personIds = idsOf(target.persons);
  const placeIds = idsOf(target.places);
  const eventIds = idsOf(target.events);
  const claimIds = idsOf(target.claims);

  const mentionTargets: Record<MentionKind, { ids: Set<string>; name: string }> = {
    person: { ids: personIds, name: '人物' },
    place: { ids: placeIds, name: '場所' },
    event: { ids: eventIds, name: '出来事' },
    source: { ids: sourceIds, name: 'ソース' },
  };

  const check = (known: Set<string>, id: string | undefined, entityName: string) => {
    if (id !== undefined && !known.has(id)) {
      violations.push(`存在しない${entityName}を参照しています: ${id}`);
    }
  };

  for (const claim of target.claims) {
    if (claim.speaker.kind === 'person') claim.speaker.personIds.forEach((id) => check(personIds, id, '人物'));
    if (claim.speaker.kind !== 'user' && claim.sourceId === undefined) {
      violations.push(`ユーザーの推測以外の主張にはソースが必要です: ${claim.id}`);
    }
    check(sourceIds, claim.sourceId, 'ソース');
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

  const parsed: Case = { ...result.data, timelineOrder: result.data.timelineOrder ?? legacyTimelineOrder(result.data) };
  const violations = findCaseViolations(parsed);
  if (violations.length > 0) {
    throw new Error(`案件データの参照に問題があります\n${violations.join('\n')}`);
  }
  return parsed;
}
