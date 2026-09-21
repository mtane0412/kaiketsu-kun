/**
 * 入力欄に書かれた日時の表記の解釈
 *
 * 証言の本文で「@」に続けて日時を書くと、日時のメンション（src/domain/mention.ts）の候補を示します。
 * このファイルは、その入力を時刻参照（TimeRef、ISO 8601の部分表記）に整えます。
 *
 * 受け付ける表記:
 * - ISO 8601の部分表記: 1998 / 1998-08 / 1998-08-12 / 1998-08-12T19:00
 * - スラッシュ区切り: 1998/8 / 1998/8/12 / 1998/8/12T19:05
 * - 日本語: 1998年 / 1998年8月 / 1998年8月12日 / 1998年8月12日19時 / 1998年8月12日19時05分
 * - 上記の数字が全角の表記
 *
 * 注意:
 * - 年を省略した表記（「8月12日」など）は受け付けません。年が分からないと、他の証言と並べる基準が決まらないためです。
 * - 「19時」のように分を省略した表記は、19時00分（1998-08-12T19:00）として扱います。
 *   時刻参照は分までの精度しか持たず、「19時台」を表す書き方が無いためです。
 * - メンションの検索語は空白を含めないため（findMentionQuery）、時刻は「T」または「時」で日付につなげて書きます。
 */
import { isValidTimeRef } from './time-ref';

/** 年・月・日・時・分を取り出す表記の一覧です。上から順に照合します。 */
const INPUT_PATTERNS = [
  // ISO 8601の部分表記とスラッシュ区切り（1998 / 1998-08-12 / 1998/8/12T19:05）
  /^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2})(?:T(\d{1,2}):(\d{1,2}))?)?)?$/,
  // 日本語の表記（1998年8月12日19時05分）
  /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日(?:(\d{1,2})時(?:(\d{1,2})分)?)?)?)?$/,
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
 * 入力された日時の表記を、時刻参照（ISO 8601の部分表記）に整えます。
 * 受け付ける表記はこのファイル冒頭のコメントを参照してください。
 * 解釈できない表記と、実在しない日時（1998-02-30 など）の場合は null を返します。
 */
export function parseDateInput(input: string): string | null {
  const normalized = toHalfWidthDigits(input.trim());

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
