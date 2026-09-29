/**
 * 人物の動きビューの時刻軸（人物ごとの証言の帯・目盛り・表示範囲）
 *
 * 人物の動きビューの「時刻軸」の表示は、縦軸を時刻に取り、人物ごとの列に、その人物が登場する証言の日時の区間を帯として描きます。
 * 帯の無い時間帯は、その人物の所在を述べる証言が無い時間帯（アリバイの穴）です。
 * このファイルは、その表示に必要な、帯の組み立て・目盛りの位置と表記・表示する範囲の決め方を扱います。
 *
 * 列と、列の人物にとっての証言の役割（発言・言及）は、証言の順の表示（buildPersonLanes）と同じです。
 * 日時を持たない証言は、時刻軸に置けないため帯にせず、件数だけを数えます。
 *
 * 注意: 時刻は time-ref.ts と同じく、すべてUTCとして扱います。
 */
import { buildPersonLanes, type LaneRole, type PersonLane } from './case-views';
import type { ClaimView } from './case-views';
import { PERSON_KINDS } from './person-kind';
import { intervalsOverlap, toInterval, type Interval } from './time-ref';
import type { TimelineKey } from './timeline-order';
import type { Case, Id, PersonKind } from './types';

/** 時刻軸の1本の帯（ある人物の列に置いた、1件の証言の日時の区間）です。 */
export type PersonTimeBand = {
  key: TimelineKey;
  view: ClaimView;
  /** 列の人物にとっての証言の役割です。 */
  role: LaneRole;
  interval: Interval;
  /** 同じ列で重なる帯を横に並べるための位置（0始まり）です。 */
  column: number;
  /** その列の帯を横に並べる位置の数です。列の中のすべての帯で同じ値です。 */
  columnCount: number;
};

/** 人物の動きビューの時刻軸の表示全体です。 */
export type PersonTimeAxis = {
  /** 列（人物）です。並び順と顔ぶれは、証言の順の表示と同じです。 */
  lanes: PersonLane[];
  /** 列の人物ごとの帯です。帯は区間の始まりが早い順に並びます。日時を持つ証言が無い人物は、空の配列です。 */
  bandsByPerson: Record<Id, PersonTimeBand[]>;
  /** すべての帯を含む区間です。帯が1本も無い場合は null です。 */
  extent: Interval | null;
  /** 人物が登場するが日時を持たないため、帯にできなかった証言の件数です。 */
  undatedCount: number;
};

/**
 * 同じ列の帯に、重ならないよう横に並べる位置を割り当てます。
 * 帯を始まりの早い順に見て、空いている（その位置の最後の帯が、この帯の始まりより前に終わっている）最初の位置に置きます。
 */
function assignColumns(bands: Omit<PersonTimeBand, 'column' | 'columnCount'>[]): PersonTimeBand[] {
  const sorted = bands.toSorted(
    (a, b) => a.interval.start - b.interval.start || a.interval.end - b.interval.end
  );
  /** 位置ごとの、最後に置いた帯の終わりです。 */
  const columnEnds: number[] = [];
  const placed = sorted.map((band) => {
    const free = columnEnds.findIndex((end) => end < band.interval.start);
    const column = free === -1 ? columnEnds.length : free;
    columnEnds[column] = band.interval.end;
    return { ...band, column };
  });
  return placed.map((band) => ({ ...band, columnCount: columnEnds.length }));
}

/**
 * 人物の動きビューの時刻軸の表示を組み立てます。
 *
 * @param shownKinds 列にする人物の種別です。省略した場合は、すべての種別を列にします（buildPersonLanes と同じです）。
 */
export function buildPersonTimeAxis(
  target: Case,
  shownKinds: ReadonlySet<PersonKind> = new Set(PERSON_KINDS)
): PersonTimeAxis {
  const { lanes, rows } = buildPersonLanes(target, shownKinds);
  const datedRows = rows.flatMap((row) =>
    row.view.claim.when === undefined ? [] : [{ ...row, interval: toInterval(row.view.claim.when) }]
  );

  const bandsByPerson: Record<Id, PersonTimeBand[]> = {};
  for (const lane of lanes) {
    bandsByPerson[lane.personId] = assignColumns(
      datedRows.flatMap(({ key, view, roles, interval }) => {
        const role = roles[lane.personId];
        return role === undefined ? [] : [{ key, view, role, interval }];
      })
    );
  }

  const extent =
    datedRows.length === 0
      ? null
      : {
          start: Math.min(...datedRows.map((row) => row.interval.start)),
          end: Math.max(...datedRows.map((row) => row.interval.end)),
        };
  return { lanes, bandsByPerson, extent, undatedCount: rows.length - datedRows.length };
}

/**
 * 時刻軸に表示する範囲を決めます。
 * 1. 表示する範囲を指定した場合は、その範囲にします。
 * 2. 注目する時間帯（犯行の推定時刻など）を指定した場合は、その前後に、時間帯の長さの半分ずつ余白を足した範囲にします。
 *    すべての帯を含む範囲が年単位に広いと、数十分の時間帯が見えないほど細くなるためです。
 * 3. どちらも無い場合は、すべての帯を含む範囲（extent）にします。帯も無い場合は null を返します。
 */
export function resolveAxisRange(
  extent: Interval | null,
  focus: Interval | null,
  explicit: Interval | null
): Interval | null {
  if (explicit) return explicit;
  if (focus) {
    const margin = (focus.end - focus.start) / 2;
    return { start: focus.start - margin, end: focus.end + margin };
  }
  return extent;
}

/**
 * 区間を、表示する範囲の中での位置にします。top と bottom は、範囲の上端を0、下端を1とした割合です。
 * 範囲からはみ出す部分は範囲の端で切り、範囲と重ならない区間は null を返します。
 */
export function placeInRange(interval: Interval, range: Interval): { top: number; bottom: number } | null {
  if (!intervalsOverlap(interval, range)) return null;
  // 範囲の長さが0（始まりと終わりが同じ時刻）の場合も、割り算が破綻しないよう1ミリ秒として扱う
  const span = Math.max(range.end - range.start, 1);
  const ratioOf = (at: number) => (Math.min(Math.max(at, range.start), range.end) - range.start) / span;
  return { top: ratioOf(interval.start), bottom: ratioOf(interval.end) };
}

/** 時刻軸の目盛りです。at はUTCのエポックミリ秒です。 */
export type TimeTick = { at: number; label: string };

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 目盛りの数の上限の既定値です。これを超えない最も細かい間隔を選びます。 */
const DEFAULT_MAX_TICKS = 12;

/** 1日より短い間隔の候補です（ミリ秒）。 */
const CLOCK_STEPS = [1, 5, 10, 15, 30].map((minutes) => minutes * MINUTE_MS).concat(
  [1, 2, 3, 6, 12].map((hours) => hours * HOUR_MS)
);
/** 日単位の間隔の候補です（日）。 */
const DAY_STEPS = [1, 2, 7];
/** 月単位の間隔の候補です（月）。 */
const MONTH_STEPS = [1, 2, 3, 6];
/** 年単位の間隔の候補です（年）。 */
const YEAR_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/** 数値を2桁に揃えます。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 一定の長さの間隔の目盛りの時刻を、間隔の倍数に揃えて返します（UTCのため、日の間隔は日付の境目に揃います）。
 * 目盛りの数が limit を超える場合は null を返します（広い範囲に細かい間隔を試したときに、大量の時刻を作らないためです）。
 */
function fixedStepTimes(range: Interval, stepMs: number, limit: number): number[] | null {
  const first = Math.ceil(range.start / stepMs) * stepMs;
  const count = Math.floor((range.end - first) / stepMs) + 1;
  if (count > limit) return null;
  return Array.from({ length: Math.max(count, 0) }, (_, index) => first + index * stepMs);
}

/**
 * 月の間隔の目盛りの時刻を、月の初めに揃えて返します。月の通し番号（年×12＋月）が間隔の倍数の月にだけ置きます。
 * 目盛りの数が limit を超える場合は null を返します。
 */
function monthStepTimes(range: Interval, stepMonths: number, limit: number): number[] | null {
  const monthStart = (index: number) => Date.UTC(Math.floor(index / 12), index % 12, 1);
  const startDate = new Date(range.start);
  let index = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
  if (monthStart(index) < range.start) index += 1;
  index = Math.ceil(index / stepMonths) * stepMonths;
  const times: number[] = [];
  for (; monthStart(index) <= range.end; index += stepMonths) {
    if (times.length === limit) return null;
    times.push(monthStart(index));
  }
  return times;
}

/** 目盛りの間隔の単位です。表記の組み立て方が単位ごとに異なります。 */
type TickUnit = 'clock' | 'day' | 'month' | 'year';

/**
 * 目盛りの表記を組み立てます。
 * 上位の部分（時刻の目盛りの日付、日・月の目盛りの年）は、最初の目盛りと、前の目盛りから変わった目盛りにだけ添えます。
 */
function labelTicks(times: number[], unit: TickUnit): TimeTick[] {
  return times.map((at, index) => {
    const date = new Date(at);
    const previous = index === 0 ? null : new Date(times[index - 1]!);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const yearChanged = previous === null || previous.getUTCFullYear() !== year;
    switch (unit) {
      case 'clock': {
        const dateChanged = yearChanged || previous.getUTCMonth() + 1 !== month || previous.getUTCDate() !== day;
        const clock = `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
        return { at, label: dateChanged ? `${month}月${day}日 ${clock}` : clock };
      }
      case 'day':
        return { at, label: `${yearChanged ? `${year}年` : ''}${month}月${day}日` };
      case 'month':
        return { at, label: `${yearChanged ? `${year}年` : ''}${month}月` };
      case 'year':
        return { at, label: `${year}年` };
    }
  });
}

/**
 * 時刻軸の目盛りを返します。
 * 間隔は、分・時・日・月・年の候補のうち、目盛りの数が maxTicks を超えない最も細かいものを選びます。
 * 目盛りは、間隔の区切りのよい時刻（10分ごとなら毎時0分・10分…、月ごとなら月の初め）に置きます。
 */
export function buildTimeTicks(range: Interval, maxTicks: number = DEFAULT_MAX_TICKS): TimeTick[] {
  if (range.end < range.start) return [];

  const candidates: { unit: TickUnit; times: (limit: number) => number[] | null }[] = [
    ...CLOCK_STEPS.map((step) => ({ unit: 'clock' as const, times: (limit: number) => fixedStepTimes(range, step, limit) })),
    ...DAY_STEPS.map((days) => ({
      unit: 'day' as const,
      times: (limit: number) => fixedStepTimes(range, days * DAY_MS, limit),
    })),
    ...MONTH_STEPS.map((months) => ({
      unit: 'month' as const,
      times: (limit: number) => monthStepTimes(range, months, limit),
    })),
    ...YEAR_STEPS.map((years) => ({
      unit: 'year' as const,
      times: (limit: number) => monthStepTimes(range, years * 12, limit),
    })),
  ];
  for (const { unit, times } of candidates) {
    const found = times(maxTicks);
    if (found !== null) return labelTicks(found, unit);
  }
  // 最も粗い間隔でも上限を超えるほど広い範囲では、最も粗い間隔のまま、上限を設けずに返す
  const coarsest = candidates.at(-1)!;
  return labelTicks(coarsest.times(Infinity) ?? [], coarsest.unit);
}
