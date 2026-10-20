/**
 * 資料（聴取）の短い表示を組み立てるロジック
 *
 * 証言のカードや照合の一覧で、どの媒体のいつの資料か（転載なら原典）と資料の格を、資料を開かずに見分けるための
 * 短い文字列（例「架空日報 朝刊 1998年8月14日・主要報道・転載」）を作ります。
 *
 * 注意: 証言の表示（case-views.ts の ClaimView）と資料の表示（interviews.ts）の両方から使うため、
 * どちらにも依存しない独立したモジュールにしています（interviews.ts は case-views.ts に依存しているため、
 * ここに置かないと循環して import することになります）。
 * 注意: 参照先の人物が見つからない場合は、データ破損として例外を投げます（case-views.ts と同じ扱いです）。
 */
import { INTERVIEW_GRADE_LABELS } from './labels';
import { formatTimeRef } from './time-ref';
import type { Case, Id, Interview, Person } from './types';

/** タイトルもURLも無い聴取の名前に使う言葉です。 */
export const UNTITLED_INTERVIEW_LABEL = '無題の資料';

/** 原典を持つ（転載の）資料の短い表示に添える言葉です。 */
export const REPRINT_LABEL = '転載';

/** IDから人物を引きます。見つからない場合はデータ破損として例外を投げます。 */
function personOf(target: Case, personId: Id): Person {
  const person = target.persons.find((candidate) => candidate.id === personId);
  if (!person) throw new Error(`資料が存在しない人物を参照しています: ${personId}`);
  return person;
}

/**
 * 資料の短い表示を返します（例「架空日報 朝刊 1998年8月14日・主要報道・転載」）。
 *
 * - 媒体と日時は、転載の原典を持つ資料では原典の媒体・発行日を優先します。同じ媒体が日によって違う内容を報じる場合に、
 *   判断の材料になるのは原典の日付だからです。原典に無い項目は、資料自身の媒体（聴取者）・日時で補います。
 * - 媒体も日時も無い資料は、資料の名前（タイトル、無ければURL、それも無ければ「無題の資料」）を先頭に置きます。
 * - 資料の格を持つ資料は格の表示名を、原典を持つ資料は「転載」を「・」でつないで添えます。
 */
export function formatInterviewSourceLabel(target: Case, interview: Interview): string {
  const publisherId = interview.origin?.publisherPersonId ?? interview.interviewerPersonId;
  const time = interview.origin?.publishedAt ?? interview.at;
  const head = [
    ...(publisherId === undefined ? [] : [personOf(target, publisherId).name]),
    ...(time === undefined ? [] : [formatTimeRef(time)]),
  ].join(' ');
  return [
    head === '' ? (interview.title ?? interview.url ?? UNTITLED_INTERVIEW_LABEL) : head,
    ...(interview.grade === undefined ? [] : [INTERVIEW_GRADE_LABELS[interview.grade]]),
    ...(interview.origin === undefined ? [] : [REPRINT_LABEL]),
  ].join('・');
}
