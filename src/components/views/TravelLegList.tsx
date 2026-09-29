/**
 * 地図ビューの「移動の確認」（人物の移動区間ごとの、直線距離・時刻の差・概算所要時間）
 *
 * 地図ビューで人物を選んだときに、その人物の隣り合う地点の間の移動区間を一覧にします（buildPersonTravel）。
 * どの移動手段でも時刻の差のうちに移動できない区間は、枠の色と文言で、ほかの区間と区別します。
 * 注意: 距離と所要時間は直線距離と想定した速さによる概算であることを、一覧の冒頭に明示します。
 */
import { formatDistance, formatDuration, TRAVEL_MODES, type TravelLeg } from '@/domain/travel-check';

export const TRAVEL_CHECK_LABEL = '移動の確認';

/** 想定した速さの説明です（例「徒歩 時速4.8km・自転車 時速15km・車 時速40km」）。 */
const SPEEDS_TEXT = TRAVEL_MODES.map(({ label, speedKmPerHour }) => `${label} 時速${speedKmPerHour}km`).join('・');

/** 時刻の差を表示用の文字列にします。日時に幅があり、最短と最長が異なる場合は「最短〜最長」とします。 */
function formatGap(leg: TravelLeg): string {
  return leg.minGapMs === leg.maxGapMs
    ? formatDuration(leg.maxGapMs)
    : `${formatDuration(leg.minGapMs)}〜${formatDuration(leg.maxGapMs)}`;
}

type TravelLegListProps = {
  legs: TravelLeg[];
};

export function TravelLegList({ legs }: TravelLegListProps) {
  return (
    <section aria-label={TRAVEL_CHECK_LABEL} className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold text-foreground">{TRAVEL_CHECK_LABEL}</h3>
      <p className="text-xs text-muted-foreground">
        距離と所要時間は、2地点の直線距離と想定した速さによる概算です（{SPEEDS_TEXT}）。
        実際の道のりは直線より長いため、実際の所要時間はこれより長くなります。
        日時に幅がある場合は、最も移動しやすい場合（前の証言の始まりから、次の証言の終わりまで）で判定します。
      </p>
      {legs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          移動区間がありません。日時と座標のある証言が2件以上あると、移動区間を確かめられます。
        </p>
      ) : (
        <ol className="space-y-2">
          {legs.map((leg) => {
            const label = `${leg.from.order} ${leg.from.place.name} → ${leg.to.order} ${leg.to.place.name}`;
            return (
              <li
                key={leg.from.order}
                aria-label={label}
                className={`space-y-1 rounded border p-2 text-sm ${
                  leg.feasibleByAny ? 'border-border' : 'border-destructive bg-destructive/10'
                }`}
              >
                <p className="font-medium text-foreground">{label}</p>
                {!leg.feasibleByAny && (
                  <p className="font-semibold text-destructive">どの移動手段でも、時刻の差のうちに移動できません</p>
                )}
                <p className="text-foreground">{`直線距離 ${formatDistance(leg.distanceMeters)}`}</p>
                <p className="text-foreground">{`時刻の差 ${formatGap(leg)}`}</p>
                <ul aria-label="概算所要時間" className="flex flex-wrap gap-x-4 gap-y-1">
                  {leg.estimates.map((estimate) => (
                    <li key={estimate.mode} className="text-muted-foreground">
                      {`${estimate.label} ${formatDuration(estimate.requiredMs)}`}
                      {!estimate.feasible && <span className="ml-1 font-medium text-destructive">間に合わない</span>}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
