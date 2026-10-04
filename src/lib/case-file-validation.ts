/**
 * ケースのJSONファイルの検証
 *
 * AIエージェントなどがアプリの外で作ったケースのJSONを、アプリに読み込む前に確かめます。
 * 確かめる内容は次の3点です。
 * 1. アプリの読み込み（parseCase）で受け付けられること
 * 2. 現在の形式のまま書かれていること。parseCase は古い形式のデータも変換して受け付け、
 *    未知の項目は黙って捨てるため、読み込みの前後でデータが変わる場合は誤りとして扱います。
 *    書いた内容が読み込みで失われたり、書き換えられたりするのを防ぐためです。
 * 3. アプリの画面からの入力では起こらない状態でないこと。parseCase は次の状態を受け付けますが、画面では作れないため誤りとして扱います。
 *    - 証言の言及・場所・日時が、本文のメンションから導いたもの（deriveClaimLinks）と食い違う
 *    - 時系列の並び順（timelineOrder）に、証言が過不足なく1回ずつ載っていない
 *    - 時系列の並び順が、証言の日時と矛盾する（src/domain/timeline-order.ts の矛盾の定義）
 *    - 証言の引用が、ひもづけた資料の本文に一字一句含まれていない（checkClaimQuote）。
 *      アプリは本文の書き換えに備えて受け付けますが、新しく作るデータでは、原文に裏付けられない引用になるためです。
 *
 * 注意: 内容の正しさ（証言が資料に基づくかどうか）は確かめません。
 */
import { parseCase } from '@/domain/case-schema';
import { deriveClaimLinks } from '@/domain/mention';
import { toInterval } from '@/domain/time-ref';
import { timelineKeyOf } from '@/domain/timeline-order';
import { checkClaimQuote } from '@/domain/transcript';
import type { Case } from '@/domain/types';

/** 検証の結果です。受け付けた場合は件数の要約を、受け付けない場合は誤りの一覧を持ちます。 */
export type CaseFileValidation = { ok: true; summary: string } | { ok: false; errors: string[] };

/**
 * ケースのJSONの文字列を検証します。
 *
 * @param text - JSONファイルの内容です。
 * @returns 検証の結果です。
 */
export function validateCaseFile(text: string): CaseFileValidation {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, errors: [`JSONとして読めません: ${(error as Error).message}`] };
  }

  let parsed: Case;
  try {
    parsed = parseCase(data);
  } catch (error) {
    return { ok: false, errors: (error as Error).message.split('\n') };
  }

  // 読み込み後のデータを、JSONの書き出しを経た形にそろえて比べる
  const differences = findDifferences(data, JSON.parse(JSON.stringify(parsed)), '');
  if (differences.length > 0) {
    return { ok: false, errors: differences };
  }
  const inconsistencies = [...findLinkMismatches(parsed), ...findTimelineOrderProblems(parsed), ...findUnbackedQuotes(parsed)];
  if (inconsistencies.length > 0) {
    return { ok: false, errors: inconsistencies };
  }
  return { ok: true, summary: summarize(parsed) };
}

/** ケースの件数の要約を作ります。 */
function summarize(target: Case): string {
  return [
    `人物 ${target.persons.length}件`,
    `場所 ${target.places.length}件`,
    `資料 ${target.interviews.length}件`,
    `証言 ${target.claims.length}件`,
    `関係 ${target.relationships.length}件`,
    `照合 ${target.crossChecks.length}件`,
    `仮説 ${target.hypotheses.length}件`,
    `未了事項 ${target.tasks.length}件`,
  ].join(' / ');
}

/** 証言の言及・場所・日時のうち、本文のメンションから導いたものと食い違う証言を列挙します。 */
function findLinkMismatches(target: Case): string[] {
  return target.claims.flatMap((claim) => {
    const derived = deriveClaimLinks(claim.content);
    const stored = { mentionedPersonIds: claim.mentionedPersonIds, placeId: claim.placeId, when: claim.when };
    const expected = { placeId: undefined, when: undefined, ...derived };
    return (['mentionedPersonIds', 'placeId', 'when'] as const)
      .filter((key) => JSON.stringify(stored[key]) !== JSON.stringify(expected[key]))
      .map(
        (key) =>
          `${claim.id}: ${key} が本文のメンションと食い違います（${JSON.stringify(stored[key]) ?? '省略'}。本文からは ${JSON.stringify(expected[key]) ?? '省略'}）`
      );
  });
}

/** 引用が、ひもづけた資料の本文に一字一句含まれていない証言を列挙します。 */
function findUnbackedQuotes(target: Case): string[] {
  return target.claims.flatMap((claim) => {
    if (claim.quote === undefined) return [];
    switch (checkClaimQuote(target, claim)) {
      case 'found':
        return [];
      case 'notFound':
        return [`${claim.id}: 引用が資料の本文に一字一句含まれていません`];
      case 'noTranscript':
        return [`${claim.id}: 引用を持ちますが、本文を持つ資料にひもづいていません`];
    }
  });
}

/** 時系列の並び順の過不足と、日時との矛盾を列挙します。 */
function findTimelineOrderProblems(target: Case): string[] {
  const claimKeys = target.claims.map((claim) => timelineKeyOf(claim.id));
  const known = new Set(claimKeys);
  const listed = new Set(target.timelineOrder);
  const problems = [
    ...claimKeys.filter((key) => !listed.has(key)).map((key) => `timelineOrder: ${key} が載っていません`),
    ...target.timelineOrder.filter((key) => !known.has(key)).map((key) => `timelineOrder: ${key} は存在しない証言です`),
    ...target.timelineOrder
      .filter((key, index) => target.timelineOrder.indexOf(key) !== index)
      .map((key) => `timelineOrder: ${key} が2回以上載っています`),
  ];

  // 前にある証言の日時の区間が、後ろにある証言の区間より完全に後である組を探す
  const whenByKey = new Map(target.claims.map((claim) => [timelineKeyOf(claim.id), claim.when]));
  const dated = target.timelineOrder.flatMap((key) => {
    const when = whenByKey.get(key);
    return when === undefined ? [] : [{ key, interval: toInterval(when) }];
  });
  dated.forEach((earlier, index) => {
    for (const later of dated.slice(index + 1)) {
      if (earlier.interval.start > later.interval.end) {
        problems.push(`timelineOrder: ${earlier.key} が ${later.key} より前にありますが、日時は後です`);
      }
    }
  });
  return problems;
}

/** 値がオブジェクト（配列を除く）かどうかを判定します。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 書かれたデータと読み込み後のデータを比べ、食い違う箇所を「パス: 理由」の形で列挙します。
 *
 * @param written - ファイルに書かれていたデータです。
 * @param loaded - 読み込み後のデータです。
 * @param path - 比べている箇所のパスです（ルートは空文字列です）。
 */
function findDifferences(written: unknown, loaded: unknown, path: string): string[] {
  const label = path === '' ? '(ルート)' : path;
  const join = (key: string | number) => (path === '' ? String(key) : `${path}.${key}`);

  if (isRecord(written) && isRecord(loaded)) {
    const keys = new Set([...Object.keys(written), ...Object.keys(loaded)]);
    return [...keys].flatMap((key) => {
      if (!(key in loaded)) return [`${join(key)}: 現在の形式に無い項目です（読み込み時に捨てられます）`];
      if (!(key in written)) return [`${join(key)}: 省略されています（読み込み時に補われます。明示的に書いてください）`];
      return findDifferences(written[key], loaded[key], join(key));
    });
  }
  if (Array.isArray(written) && Array.isArray(loaded)) {
    if (written.length !== loaded.length) {
      return [`${label}: 読み込み時に件数が変わります（${written.length}件 → ${loaded.length}件。古い形式です）`];
    }
    return written.flatMap((item, index) => findDifferences(item, loaded[index], join(index)));
  }
  if (written !== loaded) {
    return [`${label}: 読み込み時に書き換えられます（${JSON.stringify(written)} → ${JSON.stringify(loaded)}。古い形式です）`];
  }
  return [];
}
