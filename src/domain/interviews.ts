/**
 * 聴取（Interview）を、人物の詳細の「供述の変遷」と証言のフォームに表示する形へ導出するロジック
 *
 * 聴取は、証言を得た機会としてユーザーが登録する一次データです（src/domain/types.ts の Interview）。
 * 画面では「資料」と呼びます（記事・動画・調書など、証言の出どころをまとめて指すためです）。
 * このファイルが担うのは次の3つです。
 * - 供述の変遷: ある人物が相手（相手が複数の場合はそのうちの1人）の聴取を日時の順に並べ、各聴取で得た証言を添えます。
 *   同じ人物の初回の供述と後の供述を、並べて見比べられるようにするためです。
 * - 資料の一覧と詳細: ケースのすべての聴取を日時の順に並べた一覧（サイドバー）と、1件の聴取の表示（資料の詳細）を作ります。
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

/** 資料（聴取）1件の表示です。供述の変遷・資料の一覧・資料の詳細で使います。 */
export type InterviewView = {
  interview: Interview;
  /** 相手の人物です。資料が持つ順（選んだ順）に並びます。 */
  subjects: Person[];
  /** 聴き取った人物、または媒体です。 */
  interviewer?: Person;
  place?: Place;
  /** この聴取で得た証言です。時系列ボードの並び順に並びます。 */
  claims: ClaimView[];
};

/** IDから人物を引きます。見つからない場合はデータ破損として例外を投げます。 */
function personOf(target: Case, personId: Id): Person {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (!person) throw new Error(`資料が存在しない人物を参照しています: ${personId}`);
  return person;
}

/** IDから場所を引きます。見つからない場合はデータ破損として例外を投げます。 */
function placeOf(target: Case, placeId: Id): Place {
  const place = target.places.find((candidate) => candidate.id === placeId);
  if (!place) throw new Error(`資料が存在しない場所を参照しています: ${placeId}`);
  return place;
}

/** 聴取1件を表示の形にします。claimViews は時系列ボードの並び順に並んだ証言です。 */
function toInterviewView(target: Case, interview: Interview, claimViews: ClaimView[]): InterviewView {
  return {
    interview,
    subjects: interview.subjectPersonIds.map((personId) => personOf(target, personId)),
    ...(interview.interviewerPersonId !== undefined && { interviewer: personOf(target, interview.interviewerPersonId) }),
    ...(interview.placeId !== undefined && { place: placeOf(target, interview.placeId) }),
    claims: claimViews.filter((view) => view.claim.interviewId === interview.id),
  };
}

/**
 * 聴取を日時の早い順に並べ、表示の形にして返します。
 *
 * 日時の分からない聴取は最後に並べます。日時が同じ聴取と、日時の分からない聴取どうしは、登録順に並べます。
 * 各聴取の証言は、時系列ボードの並び順（buildTimeline）に並べます。一覧のどこで証言を見ても同じ順番になるようにするためです。
 */
function buildSortedInterviews(target: Case, interviews: Interview[]): InterviewView[] {
  const claimViews = buildTimeline(target).items.map((item) => item.view);
  return interviews
    // Array.prototype.sort は安定ソートのため、比較が等しい聴取は登録順を保つ
    .toSorted((a, b) => compareTimeRef(a.at, b.at))
    .map((interview) => toInterviewView(target, interview, claimViews));
}

/** 人物 personId が相手（相手が複数の場合はそのうちの1人）の聴取を、日時の早い順に並べて返します（供述の変遷）。 */
export function buildPersonInterviews(target: Case, personId: Id): InterviewView[] {
  return buildSortedInterviews(
    target,
    target.interviews.filter((interview) => interview.subjectPersonIds.includes(personId))
  );
}

/** ケースのすべての聴取を、相手を問わず日時の早い順に並べて返します（サイドバーの資料の一覧）。 */
export function buildInterviewList(target: Case): InterviewView[] {
  return buildSortedInterviews(target, target.interviews);
}

/** 聴取 interviewId を表示の形にして返します（資料の詳細）。ケースに無い場合は undefined を返します。 */
export function buildInterviewView(target: Case, interviewId: Id): InterviewView | undefined {
  const interview = target.interviews.find((candidate) => candidate.id === interviewId);
  if (interview === undefined) return undefined;
  return toInterviewView(target, interview, buildTimeline(target).items.map((item) => item.view));
}

/**
 * 聴取を見分けるための名前を返します（例「管理人・1998年8月13日 10:00・県警」）。
 * 相手・日時・聴取者の名前を「・」でつなぎます。相手が複数の場合は、相手の名前を「、」でつなぎます。日時の分からない聴取は「日時不明」と示し、聴取者の無い聴取は聴取者を省きます。
 */
export function formatInterviewLabel(target: Case, interview: Interview): string {
  return [
    interview.subjectPersonIds.map((personId) => personOf(target, personId).name).join('、'),
    interview.at === undefined ? UNKNOWN_INTERVIEW_TIME_LABEL : formatTimeRef(interview.at),
    ...(interview.interviewerPersonId === undefined ? [] : [personOf(target, interview.interviewerPersonId).name]),
  ].join('・');
}
