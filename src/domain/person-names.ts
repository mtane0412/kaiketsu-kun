/**
 * 人物の呼び方（名前・別名・資料ごとの呼び方）の照らし合わせ
 *
 * 人物は、現在の名前（Person.name）・別名（Person.aliases）・資料ごとの呼び方（Interview.personNames）で呼ばれます。
 * 資料ごとの呼び方は、その資料の中でだけ通じる呼び方です（ブログの「Aさん」と週刊誌の「Aさん」が別人を指すなど）。
 *
 * 照らし合わせの規則:
 * - 名前は正規化して比べます（normalizeName）。
 * - 資料の中の名前は、その資料での呼び方を、人物の名前・別名より優先します。ほかの資料での呼び方は使いません。
 * - 名前・別名が複数の人物に一致した場合（同姓同名など）は、一致した人物をすべて返し、どの人物かは呼び出し側（ユーザー）が決めます。
 */
import type { Case, Id } from './types';

/** 名前の照らし合わせで一致した人物です。 */
export type PersonNameMatch = { id: Id; name: string };

/**
 * 名前を照らし合わせ用に正規化します。
 * 前後の空白を除き、連続する空白（全角の空白を含みます）を半角の空白1つにし、大文字小文字を区別しないよう小文字にします。
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 資料 interviewId の中に現れた名前 name が指す人物の候補を返します。
 *
 * - その資料での呼び方に一致すれば、呼び方が指す人物1人だけを返します。
 * - そうでなければ、名前・別名が一致する人物をすべて、人物の一覧の順に返します。一致しなければ空の配列です。
 * 2人以上を返した場合に1人に決めないのは、同姓同名や共通の別名で、黙って別人に結び付けないためです。
 */
export function findPersonsByName(target: Case, interviewId: Id, name: string): PersonNameMatch[] {
  const normalized = normalizeName(name);
  const interview = target.interviews.find((item) => item.id === interviewId);
  const sourceName = interview?.personNames?.find((personName) => normalizeName(personName.name) === normalized);
  if (sourceName !== undefined) {
    const person = target.persons.find((item) => item.id === sourceName.personId);
    if (person === undefined) throw new Error(`資料での呼び方が存在しない人物を指しています: ${sourceName.personId}`);
    return [{ id: person.id, name: person.name }];
  }
  return target.persons
    .filter((person) => [person.name, ...(person.aliases ?? [])].some((key) => normalizeName(key) === normalized))
    .map((person) => ({ id: person.id, name: person.name }));
}

/**
 * 人物 personId を指す、現在の名前以外の呼び方（別名と、すべての資料での呼び方）を返します。
 * 証言を探すとき（本文に呼び方が出てくるか）や、本文の表記が資料での表記かどうかを判定するときに使います。
 */
export function sourceNamesOf(target: Case, personId: Id): string[] {
  const person = target.persons.find((item) => item.id === personId);
  const interviewNames = target.interviews.flatMap((interview) =>
    (interview.personNames ?? []).filter((personName) => personName.personId === personId).map((personName) => personName.name)
  );
  return [...(person?.aliases ?? []), ...interviewNames];
}

/**
 * 本文のメンションに残っている表記 label が、人物 personId の資料での表記（別名か、いずれかの資料での呼び方）かどうかを返します。
 *
 * 現在の名前と同じ表記は、資料での表記として示す必要がないため false です。
 * どこにも登録されていない表記（改名する前の名前など）も false です。古い表示名を、資料での表記と取り違えないためです。
 */
export function isSourceNameOf(target: Case, personId: Id, label: string): boolean {
  const person = target.persons.find((item) => item.id === personId);
  if (person === undefined) return false;
  const normalized = normalizeName(label);
  if (normalizeName(person.name) === normalized) return false;
  return sourceNamesOf(target, personId).some((name) => normalizeName(name) === normalized);
}
