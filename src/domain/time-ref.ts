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
 * 注意: タイムゾーンは扱わず、すべてUTCとして計算します。目的は並べ替えと重なり判定であり、
 * 同じ案件の中で一貫していれば足りるためです。
 */
import type { TimeRef } from './types';

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

/** 入力できる表記かどうかを判定します。 */
export function isValidTimeRef(value: string): boolean {
  return parsePartialIso(value) !== null;
}

/**
 * 時刻参照が表す区間を求めます。
 *
 * 注意: 表記が解釈できない場合は例外を投げます。
 * 入力フォームと読み込み時の検証で事前に弾く前提のため、ここに到達した不正値はデータ破損として扱います。
 */
export function toInterval(ref: TimeRef): Interval {
  const parts = parsePartialIso(ref);
  if (!parts) {
    throw new Error(`日時を解釈できません: ${ref}`);
  }
  const { year, month, day, hour, minute } = parts;

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

/**
 * 時刻参照を、画面に表示する日本語の表記にします（例: '1998-08-12T19:00' → '1998年8月12日 19:00'）。
 * 書かれた精度までを表示し、書かれていない部分は補いません。
 */
export function formatTimeRef(ref: TimeRef): string {
  const parts = parsePartialIso(ref);
  if (!parts) {
    throw new Error(`日時を解釈できません: ${ref}`);
  }
  const { year, month, day, hour, minute } = parts;

  let text = `${year}年`;
  if (month !== undefined) text += `${month + 1}月`;
  if (day !== undefined) text += `${day}日`;
  if (hour !== undefined && minute !== undefined) {
    text += ` ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  return text;
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
