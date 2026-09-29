/**
 * 時刻参照（TimeRef）の解釈・表示・並べ替え
 *
 * TimeRef は、精度の異なるISO 8601の部分表記の文字列です。
 * - 年: '1998'
 * - 月: '1998-08'
 * - 日: '1998-08-12'
 * - 分: '1998-08-12T19:00'
 *
 * 部分表記は「その期間全体」を表す区間として解釈します。
 * 例: '1998' は 1998年1月1日0時 から 1998年12月31日23時59分59.999秒 まで。
 * 曖昧な日時は、分かっている精度までを書くことで表します（「1995年7月頃」→ '1995-07'）。
 *
 * 「19:10から19:40の間」のような幅は、ISO 8601の区間表記（始まり/終わり）で表します。
 * - '2026-09-28T19:10/2026-09-28T19:40'
 * - 終わりは、始まりと同じ部分を省略できます（'2026-09-28T19:10/19:40'、'1998-08-12/15'、'1998-08/10'）。
 *   省略した終わりは、ISO 8601のとおり始まりの末尾の部分を置き換えたものとして読むため、始まりと同じ精度で書きます。
 *   省略しない終わりは、始まりと異なる精度でも構いません（'1998/1998-06'）。
 * 区間表記は、始まりの期間の最初から、終わりの期間の最後までを表します。終わりが始まりより前の表記は受け付けません。
 *
 * 注意: タイムゾーンは扱わず、すべてUTCとして計算します。目的は並べ替えと重なり判定であり、
 * 同じケースの中で一貫していれば足りるためです。
 */
import type { TimeRef } from './types';

/** 1分・1時間・1日のミリ秒です。 */
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** 時刻参照が表す区間です（UTCのエポックミリ秒）。 */
export type Interval = { start: number; end: number };

const PARTIAL_ISO_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/;

/** 表記を、年・月・日・時・分に分解した結果です。指定の無い部分は undefined です。 */
type TimeParts = { year: number; month?: number; day?: number; hour?: number; minute?: number };

/** ISO 8601の部分表記を分解します。解釈できない表記の場合は null を返します。 */
function parsePartialIso(value: string): TimeParts | null {
  const match = PARTIAL_ISO_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts: TimeParts = {
    year: Number(yearText),
    month: monthText === undefined ? undefined : Number(monthText) - 1,
    day: dayText === undefined ? undefined : Number(dayText),
    hour: hourText === undefined ? undefined : Number(hourText),
    minute: minuteText === undefined ? undefined : Number(minuteText),
  };
  const { year, month, day, hour, minute } = parts;

  // Date.UTC は '02-30' のような存在しない日付を翌月に繰り上げるため、往復して一致するかを確かめる
  const roundTrip = new Date(Date.UTC(year, month ?? 0, day ?? 1, hour ?? 0, minute ?? 0));
  const isRealDate =
    roundTrip.getUTCFullYear() === year &&
    (month === undefined || roundTrip.getUTCMonth() === month) &&
    (day === undefined || roundTrip.getUTCDate() === day) &&
    (hour === undefined || roundTrip.getUTCHours() === hour) &&
    (minute === undefined || roundTrip.getUTCMinutes() === minute);

  return isRealDate ? parts : null;
}

/** 区間表記の始まりと終わりを分けて解釈した結果です。区間表記でない場合、end は undefined です。 */
type ParsedTimeRef = { start: TimeParts; end?: TimeParts };

/**
 * 省略した終わりの表記です。年から始まる表記は、省略していない終わりです。
 * - 時刻だけ: '19:40'
 * - 日付の末尾（と時刻）: '15'、'09-02'、'15T20:00'
 */
const ABBREVIATED_END_PATTERNS = [/^()()(\d{2}:\d{2})$/, /^(\d{2})(?:-(\d{2}))?(?:T(\d{2}:\d{2}))?$/];

/**
 * 始まりの表記を、年・月・日・時刻（'HH:MM'）の部分に分けます。省略した終わりを補うために使います。
 * 例: '1998-08-12T19:10' → ['1998', '08', '12', '19:10']
 */
function componentsOf(value: string): string[] {
  const [date = '', time] = value.split('T');
  return time === undefined ? date.split('-') : [...date.split('-'), time];
}

/**
 * 省略した終わりを、始まりの末尾の部分を置き換えた表記に戻します。
 * 始まりと精度が異なる（部分の数が合わない、時刻の有無が違う）場合は null を返します。
 */
function expandAbbreviatedEnd(startText: string, endText: string): string | null {
  const match = ABBREVIATED_END_PATTERNS.map((pattern) => pattern.exec(endText)).find((result) => result !== null);
  if (!match) return null;
  const [, first, second, time] = match;
  const endComponents = [first, second, time].filter((component) => component !== undefined && component !== '');

  const startComponents = componentsOf(startText);
  const startHasTime = startText.includes('T');
  // 年は必ず始まりから補うため、終わりの部分の数は始まりより少ない
  if (startHasTime !== (time !== undefined) || endComponents.length >= startComponents.length) return null;

  const components = [...startComponents.slice(0, startComponents.length - endComponents.length), ...endComponents];
  if (!startHasTime) return components.join('-');
  return `${components.slice(0, -1).join('-')}T${components.at(-1)}`;
}

/**
 * 表記を解釈します。区間表記の場合は、省略した終わりを補ってから解釈します。
 * 解釈できない表記と、終わりが始まりより前の区間表記の場合は null を返します。
 */
function parseTimeRef(value: string): ParsedTimeRef | null {
  const pieces = value.split('/');
  if (pieces.length === 1) {
    const start = parsePartialIso(value);
    return start && { start };
  }
  if (pieces.length !== 2) return null;

  const [startText = '', endText = ''] = pieces;
  const start = parsePartialIso(startText);
  if (!start) return null;
  const fullEndText = /^\d{4}/.test(endText) ? endText : expandAbbreviatedEnd(startText, endText);
  const end = fullEndText === null ? null : parsePartialIso(fullEndText);
  if (!end) return null;
  return intervalOfParts(end).start >= intervalOfParts(start).start ? { start, end } : null;
}

/** 部分表記を分解した結果が表す、その期間全体の区間を求めます。 */
function intervalOfParts({ year, month, day, hour, minute }: TimeParts): Interval {
  const start = Date.UTC(year, month ?? 0, day ?? 1, hour ?? 0, minute ?? 0);
  // 期間の終わりは「次の期間の始まりの1ミリ秒前」として求める
  let nextStart: number;
  if (hour !== undefined && minute !== undefined) {
    nextStart = Date.UTC(year, month ?? 0, day ?? 1, hour, minute + 1);
  } else if (day !== undefined) {
    nextStart = Date.UTC(year, month ?? 0, day + 1);
  } else if (month !== undefined) {
    nextStart = Date.UTC(year, month + 1, 1);
  } else {
    nextStart = Date.UTC(year + 1, 0, 1);
  }
  return { start, end: nextStart - 1 };
}

/** 入力できる表記かどうかを判定します。 */
export function isValidTimeRef(value: string): boolean {
  return parseTimeRef(value) !== null;
}

/** 表記を解釈します。解釈できない場合は例外を投げます（理由は toInterval の注意を参照してください）。 */
function parseTimeRefOrThrow(ref: TimeRef): ParsedTimeRef {
  const parsed = parseTimeRef(ref);
  if (!parsed) {
    throw new Error(`日時を解釈できません: ${ref}`);
  }
  return parsed;
}

/**
 * 時刻参照が表す区間を求めます。
 * 区間表記の場合は、始まりの期間の最初から、終わりの期間の最後までです。
 *
 * 注意: 表記が解釈できない場合は例外を投げます。
 * 入力フォームと読み込み時の検証で事前に弾く前提のため、ここに到達した不正値はデータ破損として扱います。
 */
export function toInterval(ref: TimeRef): Interval {
  const { start, end } = parseTimeRefOrThrow(ref);
  return { start: intervalOfParts(start).start, end: intervalOfParts(end ?? start).end };
}

/** 2つの区間が、一部でも重なるかどうかを判定します。接しているだけの区間同士は重なりません。 */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** 時刻を 'HH:MM' の表記にします。 */
function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * 分解した日時を、日本語の表記にします。
 * omitUntil に指定した部分（year・month・day）までは、区間の終わりで始まりと重複するため書きません。
 */
function formatParts(parts: TimeParts, omitUntil?: 'year' | 'month' | 'day'): string {
  const { year, month, day, hour, minute } = parts;
  let text = '';
  if (omitUntil === undefined) text += `${year}年`;
  if (month !== undefined && omitUntil !== 'month' && omitUntil !== 'day') text += `${month + 1}月`;
  if (day !== undefined && omitUntil !== 'day') text += `${day}日`;
  if (hour !== undefined && minute !== undefined) {
    text += text === '' ? formatClock(hour, minute) : ` ${formatClock(hour, minute)}`;
  }
  return text;
}

/**
 * 区間の終わりで、始まりと重複するため省く部分を求めます。
 * 上位の部分から順に、始まりと同じで、かつ終わりがそれより細かい部分を持つ間だけ省きます
 * （'1998/1998-06' の終わりは「1998年6月」のまま、'1998-08-12/15' の終わりは「15日」になります）。
 */
function omittedPartOf(start: TimeParts, end: TimeParts): 'year' | 'month' | 'day' | undefined {
  // 精度が異なる始まりと終わり（'1998/1998-06' など）は、読み違えないよう終わりを省略せずに書く
  const sameShape =
    (start.month === undefined) === (end.month === undefined) &&
    (start.day === undefined) === (end.day === undefined) &&
    (start.hour === undefined) === (end.hour === undefined);
  if (!sameShape || start.year !== end.year || end.month === undefined) return undefined;
  if (start.month !== end.month || end.day === undefined) return 'year';
  if (start.day !== end.day || end.hour === undefined) return 'month';
  return 'day';
}

/**
 * 時刻参照を、画面に表示する日本語の表記にします（例: '1998-08-12T19:00' → '1998年8月12日 19:00'）。
 * 書かれた精度までを表示し、書かれていない部分は補いません。
 * 区間表記は「〜」でつなぎ、終わりの始まりと重複する部分を省きます（'2026-09-28T19:10/19:40' → '2026年9月28日 19:10〜19:40'）。
 */
export function formatTimeRef(ref: TimeRef): string {
  const { start, end } = parseTimeRefOrThrow(ref);
  const startText = formatParts(start);
  return end === undefined ? startText : `${startText}〜${formatParts(end, omittedPartOf(start, end))}`;
}

/**
 * 時刻参照を時系列順に並べるための比較関数です。
 *
 * 区間の始まりが早い順（同じなら終わりが早い順）に並べ、日時を持たないものは最後に並べます。
 */
export function compareTimeRef(a: TimeRef | undefined, b: TimeRef | undefined): number {
  if (a === undefined || b === undefined) {
    return (a === undefined ? 1 : 0) - (b === undefined ? 1 : 0);
  }
  const intervalA = toInterval(a);
  const intervalB = toInterval(b);
  return intervalA.start - intervalB.start || intervalA.end - intervalB.end;
}
