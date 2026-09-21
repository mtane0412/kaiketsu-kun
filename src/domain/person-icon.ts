/**
 * 人物のアイコンに表示する文字の決定
 *
 * 画像を登録していない人物は、1文字のアイコンで表示します。
 * 文字は、人物に指定したアイコンの文字（Person.iconText）を優先し、指定が無ければ名前の先頭の文字にします。
 * 先頭の文字が重なる人物（「管理人」と「管財人」など）を見分けられるよう、任意の文字を指定できるようにしています。
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
