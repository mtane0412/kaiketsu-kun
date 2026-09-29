/**
 * 人物の移動の確認（証言の時刻の差のうちに、2地点間を移動できたか）
 *
 * 地図ビューで人物を1人選ぶと、その人物が発言者か言及された証言の地点を日時の順に結び、
 * 隣り合う2地点ごとに、直線距離・時刻の差・想定した速さでの概算所要時間を求めます（buildPersonTravel）。
 * 「その時刻にそこへ行けたか」を確かめ、証言の信用性やその人物の関与を見直す手がかりにするためです。
 *
 * 注意:
 * - 距離は2地点の直線距離（大圏距離）です。道路に沿った経路探索や、外部の経路APIは使いません。
 *   実際の道のりは直線より長いため、ここで「移動できない」とした区間は、実際にも移動できません。
 * - 日時に幅がある場合は、最も移動しやすい場合（前の証言の始まりから、次の証言の終わりまで）で判定します。
 * - 証言が言及しているだけで、その人物がその場にいたとは限りません（「車が無かった」など）。判断するのは読み手です。
 * - 時刻は time-ref.ts と同じく、すべてUTCとして扱います。
 */
import { buildPersonLanes, coordinatesOf, type ClaimView, type MapStop, type UnmappedReason } from './case-views';
import { compareTimeRef, toInterval } from './time-ref';
import type { Case, Coordinates, Id, Place, TimeRef } from './types';

/** 地球の平均半径（メートル）です。 */
const EARTH_RADIUS_METERS = 6_371_008.8;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 想定する移動手段と速さ（時速キロメートル）です。
 * 徒歩は不動産の広告で用いる分速80メートル、自転車と車は市街地での目安の速さです。
 */
export const TRAVEL_MODES = [
  { mode: 'walk', label: '徒歩', speedKmPerHour: 4.8 },
  { mode: 'bicycle', label: '自転車', speedKmPerHour: 15 },
  { mode: 'car', label: '車', speedKmPerHour: 40 },
] as const;

export type TravelMode = (typeof TRAVEL_MODES)[number]['mode'];

/** 1つの移動手段での概算所要時間です。 */
export type TravelEstimate = {
  mode: TravelMode;
  label: string;
  requiredMs: number;
  /** 所要時間が、最も移動しやすい場合の時刻の差（TravelLeg.maxGapMs）以内かどうかです。 */
  feasible: boolean;
};

/** 隣り合う2地点の間の移動区間です。 */
export type TravelLeg = {
  from: MapStop;
  to: MapStop;
  distanceMeters: number;
  /** 最も短い時刻の差（前の証言の終わりから、次の証言の始まりまで）です。日時の幅が重なる場合は0です。 */
  minGapMs: number;
  /** 最も長い時刻の差（前の証言の始まりから、次の証言の終わりまで）です。 */
  maxGapMs: number;
  /** 移動手段ごとの概算所要時間です。TRAVEL_MODES の順に並びます。 */
  estimates: TravelEstimate[];
  /** いずれかの移動手段で、時刻の差のうちに移動できるかどうかです。 */
  feasibleByAny: boolean;
};

/** 証言を移動の確認から外した理由です。no-when は証言が日時を持たないことを表します（ほかは UnmappedReason と同じです）。 */
export type TravelExcludedReason = UnmappedReason | 'no-when';

/** ある人物の移動の確認の全体です。 */
export type PersonTravel = {
  /** 日時の順に並べた地点です。 */
  stops: MapStop[];
  /** 隣り合う地点の間の移動区間です。 */
  legs: TravelLeg[];
  /** 移動の確認から外した証言です。時系列の並び順のとおりに並びます。 */
  excluded: { view: ClaimView; reason: TravelExcludedReason }[];
};

/** 度をラジアンにします。 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 2地点間の直線距離（大圏距離、メートル）を、ハバーサインの公式で求めます。 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

/** 距離を表示用の文字列にします。1キロメートル未満は10メートル単位、以上は小数第1位までのキロメートルです。 */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** 時間の長さを表示用の文字列にします。1日以上は日と時間、1時間以上は時間と分、それ未満は分です（端数は切り捨てます）。 */
export function formatDuration(ms: number): string {
  if (ms < MINUTE_MS) return '1分未満';
  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)}日${Math.floor((ms % DAY_MS) / HOUR_MS)}時間`;
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)}時間${Math.floor((ms % HOUR_MS) / MINUTE_MS)}分`;
  return `${Math.floor(ms / MINUTE_MS)}分`;
}

/**
 * 時刻参照が表す区間の、最後の1分の始まりを求めます。
 * '19:40' や '19:10/19:40' の終わりを、19:40:59.999 ではなく 19:40 として時刻の差を求めるためです。
 */
function lastMinuteStartOf(when: TimeRef): number {
  return toInterval(when).end + 1 - MINUTE_MS;
}

/** 地点と、その証言の日時の組です。 */
type DatedStop = { stop: MapStop; when: TimeRef };

/** 隣り合う2地点の間の移動区間を求めます。from は to より日時が早い（または同じ）前提です。 */
function buildLeg({ stop: from, when: fromWhen }: DatedStop, { stop: to, when: toWhen }: DatedStop): TravelLeg {
  const distance = distanceMeters(from.coordinates, to.coordinates);
  const maxGapMs = lastMinuteStartOf(toWhen) - toInterval(fromWhen).start;
  const estimates = TRAVEL_MODES.map(({ mode, label, speedKmPerHour }) => {
    const requiredMs = (distance / (speedKmPerHour * 1000)) * HOUR_MS;
    return { mode, label, requiredMs, feasible: requiredMs <= maxGapMs };
  });
  return {
    from,
    to,
    distanceMeters: distance,
    minGapMs: Math.max(0, toInterval(toWhen).start - lastMinuteStartOf(fromWhen)),
    maxGapMs,
    estimates,
    feasibleByAny: estimates.some((estimate) => estimate.feasible),
  };
}

/**
 * 人物の移動の確認を組み立てます。
 * 対象は、その人物が発言者か言及された証言です（人物の動きビューの列と同じです。経由しただけの証言は含めません）。
 * 日時と座標のある証言を日時の順（同じ日時なら時系列の並び順）に並べ、隣り合う地点の間を移動区間にします。
 * 注意: 日時・場所・座標の無い証言は捨てずに、理由と共に excluded に入れます（計算から外れた証言を読み手が見落とさないようにするためです）。
 */
export function buildPersonTravel(target: Case, personId: Id): PersonTravel {
  const excluded: PersonTravel['excluded'] = [];
  const located: { view: ClaimView; place: Place; coordinates: Coordinates; when: TimeRef }[] = [];

  for (const { view, roles } of buildPersonLanes(target).rows) {
    if (roles[personId] === undefined) continue;
    const coordinates = view.place && coordinatesOf(view.place);
    if (!view.place) {
      excluded.push({ view, reason: 'no-place' });
    } else if (!coordinates) {
      excluded.push({ view, reason: 'no-coordinates' });
    } else if (view.claim.when === undefined) {
      excluded.push({ view, reason: 'no-when' });
    } else {
      located.push({ view, place: view.place, coordinates, when: view.claim.when });
    }
  }

  // toSorted は安定なため、同じ日時の証言は時系列の並び順のまま残る
  const datedStops = located
    .toSorted((a, b) => compareTimeRef(a.when, b.when))
    .map(({ when, ...stop }, index): DatedStop => ({ stop: { ...stop, order: index + 1 }, when }));

  const legs: TravelLeg[] = [];
  let previous: DatedStop | undefined;
  for (const current of datedStops) {
    if (previous) legs.push(buildLeg(previous, current));
    previous = current;
  }

  return { stops: datedStops.map(({ stop }) => stop), legs, excluded };
}
