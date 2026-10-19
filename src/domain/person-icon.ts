/**
 * 人物のアイコンに表示する文字の決定
 *
 * 画像を登録していない人物は、1文字のアイコンで表示します。
 * 文字は、人物に指定したアイコンの文字（Person.iconText）を優先し、指定が無ければ名前の先頭の文字にします。
 * 先頭の文字が重なる人物（「管理人」と「管財人」など）を見分けられるよう、任意の文字を指定できるようにしています。
 *
 * ケースの中でアイコンの文字が重なる人物を調べる関数（findIconTextCollisions）と、
 * 重ならない文字の候補を名前から選ぶ関数（suggestIconTexts）も、ここに置きます。
 * 人物のフォームで、アイコンの文字の指定を促すために使います。
 * 注意: 見分ける手段に色は使いません。色だけに頼ると、色の見え方によっては区別できないためです（WCAG 1.4.1）。
 */
import type { Person } from './types';

/** 見た目の1文字（書記素）ごとに区切ります。絵文字や結合文字を途中で切らないためです。 */
const GRAPHEME_SEGMENTER = new Intl.Segmenter('ja', { granularity: 'grapheme' });

/**
 * 文字列の、前後の空白を除いた先頭の1文字を返します。空白だけの文字列は空文字列を返します。
 * 注意: 文字列の添字（text[0]）は、絵文字などを符号の途中で切ってしまうため使用しません。
 */
export function firstCharacter(text: string): string {
  const [first] = GRAPHEME_SEGMENTER.segment(text.trim());
  return first?.segment ?? '';
}

/**
 * 人物のアイコンに表示する1文字を返します。
 * 名前が空でアイコンの文字の指定も無い人物は、空文字列を返します。
 */
export function personIconText(person: Pick<Person, 'name' | 'iconText'>): string {
  return firstCharacter(person.iconText ?? '') || firstCharacter(person.name);
}

/** アイコンの文字の重なりを調べる対象の人物です。保存前の人物は ID を持ちません。 */
type IconTarget = Pick<Person, 'name' | 'iconText' | 'imageDataUrl'> & { id?: Person['id'] };

/** アイコンの文字の候補の、既定の上限の数です。フォームに並べたときに選びやすい数にしています。 */
const DEFAULT_SUGGESTION_LIMIT = 3;

/**
 * アイコンに文字を表示する人物かどうかを返します。
 * 画像を登録した人物は画像を表示し、名前も指定も空の人物は何も表示しないため、どちらも文字の重なりの対象外です。
 */
function showsIconText(target: IconTarget): boolean {
  return !target.imageDataUrl && personIconText(target) !== '';
}

/**
 * 対象の人物とアイコンの文字が同じになる、ケースの中の他の人物を返します（並びは persons の順）。
 * 対象の人物自身（同じ ID）は含めません。対象の人物が文字を表示しない場合は、空の配列を返します。
 */
export function findIconTextCollisions(persons: readonly Person[], target: IconTarget): Person[] {
  if (!showsIconText(target)) return [];
  const text = personIconText(target);
  return persons.filter(
    (other) => other.id !== target.id && showsIconText(other) && personIconText(other) === text,
  );
}

/**
 * アイコンの文字の候補にできる1文字かどうかを返します。
 * ひらがな（「の」など）・長音符・記号・空白は、人物を表す文字になりにくいため候補にしません。
 */
function isIconCandidate(character: string): boolean {
  return /^[\p{L}\p{N}]$/u.test(character) && !/\p{Script=Hiragana}/u.test(character) && character !== 'ー';
}

/**
 * 名前に含まれる文字のうち、他の人物のアイコンの文字と重ならないものを、名前の順に返します。
 * 同じ文字は1回だけ返し、上限（limit）の数までに切り詰めます。
 * 画像を登録した人物のアイコンの文字は表示されないため、避ける対象にしません。
 */
export function suggestIconTexts(
  name: string,
  otherPersons: readonly Person[],
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): string[] {
  const taken = new Set(otherPersons.filter(showsIconText).map(personIconText));
  const suggestions: string[] = [];
  for (const { segment } of GRAPHEME_SEGMENTER.segment(name)) {
    if (suggestions.length >= limit) break;
    if (!isIconCandidate(segment) || taken.has(segment) || suggestions.includes(segment)) continue;
    suggestions.push(segment);
  }
  return suggestions;
}
