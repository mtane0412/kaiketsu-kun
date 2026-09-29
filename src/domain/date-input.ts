/**
 * 入力欄に書かれた日時の表記の解釈
 *
 * 証言の本文で「@」に続けて日時を書くと、日時のメンション（src/domain/mention.ts）の候補を示します。
 * このファイルは、その入力を時刻参照（TimeRef、ISO 8601の部分表記）に整えます。
 *
 * 「@」に続けて「date」「datetime」（日本語では「日付」「日時」）と書いた場合は、日時のピッカーの候補を示します。
 * ピッカーは日（date）または分（datetime）の精度でしか選べないため、年だけ・月までの粗い日時は、下記の表記を直接書きます。
 *
 * 受け付ける表記:
 * - ISO 8601の部分表記: 1998 / 1998-08 / 1998-08-12 / 1998-08-12T19:00
 * - スラッシュ区切り: 1998/8 / 1998/8/12 / 1998/8/12T19:05
 * - 日本語: 1998年 / 1998年8月 / 1998年8月12日 / 1998年8月12日19時 / 1998年8月12日19時05分
 * - 上記の数字が全角の表記
 * - 区間（「19:10から19:40の間」のような幅）:
 *   - ISO 8601の区間表記: 2026-09-28T19:10/2026-09-28T19:40 / 2026-09-28T19:10/19:40
 *   - 上記の表記を「〜」（「～」「~」も可）でつないだもの: 2026年9月28日19時10分〜2026年9月28日19時40分
 *   - 「〜」の後ろは、時刻だけ（19:40 / 19時40分 / 19時）か、日だけ（15日）に省略できます。
 *     省略した部分は「〜」の前から補います（1998年8月12日〜15日 → 1998-08-12/15）。
 *
 * 注意:
 * - 年を省略した表記（「8月12日」など）は受け付けません。年が分からないと、他の証言と並べる基準が決まらないためです。
 * - 「19時」のように分を省略した表記は、19時00分（1998-08-12T19:00）として扱います。
 *   時刻参照は分までの精度しか持たず、「19時台」を表す書き方が無いためです。
 * - メンションの検索語は空白を含めないため（findMentionQuery）、時刻は「T」または「時」で日付につなげて書きます。
 */
import { isValidTimeRef } from './time-ref';

/**
 * 日時のピッカーの種類です。
 * - date: 日までを選ぶピッカー（input[type=date]）
 * - datetime: 分までを選ぶピッカー（input[type=datetime-local]）
 */
export type DatePickerKind = 'date' | 'datetime';

/** ピッカーを呼び出すトリガー語です。日本語入力のままでも書けるよう、日本語の別名も受け付けます。 */
const PICKER_TRIGGERS: { kind: DatePickerKind; words: string[] }[] = [
  { kind: 'date', words: ['date', '日付'] },
  { kind: 'datetime', words: ['datetime', '日時'] },
];

/**
 * 検索語に前方一致するトリガー語のピッカーを、date・datetime の順に返します。
 * 入力の途中でも候補を示すため、前方一致で照合します（「dat」は date と datetime の両方に一致します）。
 * 大文字と小文字は区別しません。検索語が空の場合は、何も返しません。
 */
export function matchDatePickerTriggers(query: string): DatePickerKind[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === '') return [];
  return PICKER_TRIGGERS.filter((trigger) => trigger.words.some((word) => word.startsWith(normalized))).map(
    (trigger) => trigger.kind
  );
}

/** 年・月・日・時・分を取り出す表記の一覧です。上から順に照合します。 */
const INPUT_PATTERNS = [
  // ISO 8601の部分表記とスラッシュ区切り（1998 / 1998-08-12 / 1998/8/12T19:05）
  /^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2})(?:T(\d{1,2}):(\d{1,2}))?)?)?$/,
  // 日本語の表記（1998年8月12日19時05分）
  /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日(?:(\d{1,2})時(?:(\d{1,2})分)?)?)?)?$/,
];

/** 区間の始まりと終わりを区切る文字です。 */
const RANGE_SEPARATOR_PATTERN = /[〜～~]/;

/** 「〜」の後ろに書ける、省略した終わりの表記です（時刻だけ、日だけ）。 */
const ABBREVIATED_END_PATTERNS: { pattern: RegExp; toIso: (match: RegExpExecArray) => string }[] = [
  // 時刻だけ（19:40 / 19時40分 / 19時）
  {
    pattern: /^(\d{1,2})(?::(\d{1,2})|時(?:(\d{1,2})分)?)$/,
    toIso: ([, hour, isoMinute, jaMinute]) => `${pad(hour!)}:${pad(isoMinute ?? jaMinute ?? '0')}`,
  },
  // 日だけ（15日）
  { pattern: /^(\d{1,2})日$/, toIso: ([, day]) => pad(day!) },
];

/** 全角の数字を半角に直します。 */
function toHalfWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

/** 数値を、ISO 8601の部分表記の桁数（2桁）に揃えます。 */
function pad(value: string): string {
  return value.padStart(2, '0');
}

/**
 * 入力された日時の表記を、時刻参照（ISO 8601の部分表記、または区間表記）に整えます。
 * 受け付ける表記はこのファイル冒頭のコメントを参照してください。
 * 解釈できない表記と、実在しない日時（1998-02-30 など）、終わりが始まりより前の区間の場合は null を返します。
 */
export function parseDateInput(input: string): string | null {
  const normalized = toHalfWidthDigits(input.trim());
  const single = parseSingleDateInput(normalized);
  if (single !== null) return single;
  // スラッシュ区切りの日付（1998/8/12）と区別するため、ISO 8601の区間表記は1つの日時として読めなかった場合にだけ試す
  if (isValidTimeRef(normalized)) return normalized;

  const pieces = normalized.split(RANGE_SEPARATOR_PATTERN);
  if (pieces.length !== 2) return null;
  const [startText = '', endText = ''] = pieces;
  const start = parseSingleDateInput(startText);
  const end = parseSingleDateInput(endText) ?? parseAbbreviatedEnd(endText);
  if (start === null || end === null) return null;
  const range = `${start}/${end}`;
  return isValidTimeRef(range) ? range : null;
}

/** 「〜」の後ろに書いた、省略した終わりを、区間表記の省略した終わり（19:40 / 15）に整えます。 */
function parseAbbreviatedEnd(text: string): string | null {
  for (const { pattern, toIso } of ABBREVIATED_END_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return toIso(match);
  }
  return null;
}

/** 区間ではない1つの日時の表記を、ISO 8601の部分表記に整えます。解釈できない場合は null を返します。 */
function parseSingleDateInput(normalized: string): string | null {
  for (const pattern of INPUT_PATTERNS) {
    const match = pattern.exec(normalized);
    if (!match) continue;

    const [, year, month, day, hour, minute] = match;
    let value = year!;
    if (month !== undefined) value += `-${pad(month)}`;
    if (day !== undefined) value += `-${pad(day)}`;
    // 時刻参照は分までの精度しか持たないため、分を省略した表記は00分として扱う
    if (hour !== undefined) value += `T${pad(hour)}:${pad(minute ?? '0')}`;

    return isValidTimeRef(value) ? value : null;
  }
  return null;
}
