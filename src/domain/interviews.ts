/**
 * 聴取（Interview）を、人物の詳細の「供述の変遷」と証言のフォームに表示する形へ導出するロジック
 *
 * 聴取は、証言を得た機会としてユーザーが登録する一次データです（src/domain/types.ts の Interview）。
 * このファイルが担うのは次の2つです。
 * - 供述の変遷: ある人物が相手の聴取を日時の順に並べ、各聴取で得た証言を添えます。
 *   同じ人物の初回の供述と後の供述を、並べて見比べられるようにするためです。
 * - 聴取の名前: 証言のフォームの選択肢で、聴取を見分けるための短い名前を組み立てます。
 *
 * 注意: 参照先の人物・場所が見つからない場合は、データ破損として例外を投げます（case-views.ts と同じ扱いです）。
 * 参照の整合性は、ストアの操作と読み込み時の検証（case-schema.ts）で担保する前提です。
 */
import { buildTimeline, type ClaimView } from './case-views';
import { compareTimeRef, formatTimeRef } from './time-ref';
import type { Case, Id, Interview, Person, Place } from './types';

/** 日時の分からない聴取の名前に使う言葉です。 */
export const UNKNOWN_INTERVIEW_TIME_LABEL = '日時不明';

/** 供述の変遷の1件（1回の聴取）です。 */
export type PersonInterviewView = {
  interview: Interview;
  /** 聴き取った人物、または媒体です。 */
  interviewer?: Person;
  place?: Place;
  /** この聴取で得た証言です。時系列ボードの並び順に並びます。 */
  claims: ClaimView[];
};

/** IDから人物を引きます。見つからない場合はデータ破損として例外を投げます。 */
function personOf(target: Case, personId: Id): Person {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (!person) throw new Error(`聴取が存在しない人物を参照しています: ${personId}`);
  return person;
}

/** IDから場所を引きます。見つからない場合はデータ破損として例外を投げます。 */
function placeOf(target: Case, placeId: Id): Place {
  const place = target.places.find((candidate) => candidate.id === placeId);
  if (!place) throw new Error(`聴取が存在しない場所を参照しています: ${placeId}`);
  return place;
}

/**
 * 人物 personId が相手の聴取を、日時の早い順に並べて返します（供述の変遷）。
 *
 * 日時の分からない聴取は最後に並べます。日時が同じ聴取と、日時の分からない聴取どうしは、登録順に並べます。
 * 各聴取の証言は、時系列ボードの並び順（buildTimeline）に並べます。一覧のどこで証言を見ても同じ順番になるようにするためです。
 */
export function buildPersonInterviews(target: Case, personId: Id): PersonInterviewView[] {
  const views = buildTimeline(target).items.map((item) => item.view);
  return target.interviews
    .filter((interview) => interview.subjectPersonId === personId)
    // Array.prototype.sort は安定ソートのため、比較が等しい聴取は登録順を保つ
    .toSorted((a, b) => compareTimeRef(a.at, b.at))
    .map((interview) => ({
      interview,
      ...(interview.interviewerPersonId !== undefined && { interviewer: personOf(target, interview.interviewerPersonId) }),
      ...(interview.placeId !== undefined && { place: placeOf(target, interview.placeId) }),
      claims: views.filter((view) => view.claim.interviewId === interview.id),
    }));
}

/**
 * 聴取を見分けるための名前を返します（例「管理人・1998年8月13日 10:00・県警」）。
 * 相手・日時・聴取者の名前を「・」でつなぎます。日時の分からない聴取は「日時不明」と示し、聴取者の無い聴取は聴取者を省きます。
 */
export function formatInterviewLabel(target: Case, interview: Interview): string {
  return [
    personOf(target, interview.subjectPersonId).name,
    interview.at === undefined ? UNKNOWN_INTERVIEW_TIME_LABEL : formatTimeRef(interview.at),
    ...(interview.interviewerPersonId === undefined ? [] : [personOf(target, interview.interviewerPersonId).name]),
  ].join('・');
}
