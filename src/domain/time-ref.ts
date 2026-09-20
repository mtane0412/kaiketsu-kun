/**
 * 時刻参照（TimeRef）の解釈・並べ替え・食い違い判定
 *
 * TimeRef の earliest / latest は、精度の異なるISO 8601の部分表記を受け付けます。
 * - 年: '1998'
 * - 月: '1998-08'
 * - 日: '1998-08-12'
 * - 分: '1998-08-12T19:00'
 *
 * 部分表記は「その期間全体」を表す区間として解釈します。
 * 例: '1998' は 1998年1月1日0時 から 1998年12月31日23時59分59.999秒 まで。
 *
 * 注意: タイムゾーンは扱わず、すべてUTCとして計算します。目的は並べ替えと重なり判定であり、
 * 同じ案件の中で一貫していれば足りるためです。
 */
import type { TimeRef } from './types';

/** 時刻参照が表す区間です（UTCのエポックミリ秒）。 */
export type Interval = { start: number; end: number };

const PARTIAL_ISO_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}))?)?)?$/;

/**
 * ISO 8601の部分表記を、その期間の始まりと終わりの時点に変換します。
 * 解釈できない表記の場合は null を返します。
 */
function parsePartialIso(value: string): Interval | null {
  const match = PARTIAL_ISO_PATTERN.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = monthText === undefined ? undefined : Number(monthText) - 1;
  const day = dayText === undefined ? undefined : Number(dayText);
  const hour = hourText === undefined ? undefined : Number(hourText);
  const minute = minuteText === undefined ? undefined : Number(minuteText);

  const start = Date.UTC(year, month ?? 0, day ?? 1, hour ?? 0, minute ?? 0, 0, 0);

  // Date.UTC は '02-30' のような存在しない日付を翌月に繰り上げるため、往復して一致するかを確かめる
  const roundTrip = new Date(start);
  const isRealDate =
    roundTrip.getUTCFullYear() === year &&
    (month === undefined || roundTrip.getUTCMonth() === month) &&
    (day === undefined || roundTrip.getUTCDate() === day) &&
    (hour === undefined || roundTrip.getUTCHours() === hour) &&
    (minute === undefined || roundTrip.getUTCMinutes() === minute);
  if (!isRealDate) return null;

  // 期間の終わりは「次の期間の始まりの1ミリ秒前」として求める
  let nextStart: number;
  if (minute !== undefined && hour !== undefined) {
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

/** earliest / latest に入力できる表記かどうかを判定します。 */
export function isValidPartialIso(value: string): boolean {
  return parsePartialIso(value) !== null;
}

/**
 * 時刻参照が表す区間を求めます。
 *
 * earliest が無い場合は null を返します。latest を省略した場合は、earliest が表す期間の終わりを区間の終わりとします。
 *
 * 注意: 表記が解釈できない場合、または latest が earliest より前の場合は例外を投げます。
 * 入力フォームと読み込み時の検証で事前に弾く前提のため、ここに到達した不正値はデータ破損として扱います。
 */
export function toInterval(ref: TimeRef): Interval | null {
  if (ref.earliest === undefined) return null;

  const earliest = parsePartialIso(ref.earliest);
  if (!earliest) {
    throw new Error(`earliest を解釈できません: ${ref.earliest}`);
  }
  if (ref.latest === undefined) return earliest;

  const latest = parsePartialIso(ref.latest);
  if (!latest) {
    throw new Error(`latest を解釈できません: ${ref.latest}`);
  }
  if (latest.end < earliest.start) {
    throw new Error(`latest が earliest より前です: ${ref.earliest} 〜 ${ref.latest}`);
  }
  return { start: earliest.start, end: latest.end };
}

/** 並べ替えのグループです。日時あり、orderのみ、どちらも無い、の順に並べます。 */
function sortGroup(ref: TimeRef | undefined, interval: Interval | null): number {
  if (interval) return 0;
  if (ref?.order !== undefined) return 1;
  if (ref) return 2;
  return 3;
}

/**
 * 時刻参照を時系列順に並べるための比較関数です。
 *
 * 日時を持つものは区間の始まりが早い順（同じなら終わりが早い順）、
 * 日時を持たないものは order の小さい順に並べます。
 *
 * 注意: 日時を持つものと order だけを持つものは互いに比較できないため、日時を持つものを先に並べます。
 */
export function compareTimeRef(a: TimeRef | undefined, b: TimeRef | undefined): number {
  const intervalA = a ? toInterval(a) : null;
  const intervalB = b ? toInterval(b) : null;

  const groupDifference = sortGroup(a, intervalA) - sortGroup(b, intervalB);
  if (groupDifference !== 0) return groupDifference;

  if (intervalA && intervalB) {
    return intervalA.start - intervalB.start || intervalA.end - intervalB.end;
  }
  return (a?.order ?? 0) - (b?.order ?? 0);
}

/**
 * 2つの時刻参照が食い違っているかを判定します。
 *
 * - 両方が日時を持つ場合: 区間が重ならなければ食い違いです。
 * - 両方が日時を持たず order を持つ場合: order が異なれば食い違いです。
 * - それ以外: 比較できないため、食い違いとは判定しません。
 */
export function isTimeConflict(a: TimeRef | undefined, b: TimeRef | undefined): boolean {
  if (!a || !b) return false;

  const intervalA = toInterval(a);
  const intervalB = toInterval(b);
  if (intervalA && intervalB) {
    return intervalA.end < intervalB.start || intervalB.end < intervalA.start;
  }
  if (!intervalA && !intervalB && a.order !== undefined && b.order !== undefined) {
    return a.order !== b.order;
  }
  return false;
}
