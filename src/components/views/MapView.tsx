/**
 * 地図ビュー
 *
 * 時系列の並び順のうち、座標のある場所を述べる証言を、地図上で1件ずつたどります。
 * 地図には場所ごとの番号付きのピンと、地点を順に結ぶ線を表示し、「前へ」「次へ」またはピンの選択で、証言を切り替えます。
 * 同じ場所に複数の証言がある場合は、ピンを選ぶたびに、その場所の証言を順に切り替えます。
 * 地図に表示できない証言（場所を述べていない・場所に座標が無い）は、見落とさないよう、パネルの中に理由ごとに一覧にします。
 *
 * 地図を主役にするため、地図は受け取った領域いっぱいに広げ、それ以外の要素（絞り込みの欄・人物の選択・選択中の証言・一覧）は
 * 地図の左上に重ねる操作のパネルにまとめます。パネルは隠せるため、地図だけを広く見ることもできます。
 * 地図の高さは親の高さに合わせるため、親（CaseBoard）で高さを決めてください。
 * 絞り込みの欄（BoardFilterPanel）はボード全体の部品ですが、地図の上に別の段を作らないよう、受け取ってパネルの中に置きます。
 *
 * 人物を1人選ぶと、その人物が発言者か言及された証言のうち、日時と座標のある証言だけを日時の順にたどり、
 * 隣り合う地点の間を移動できたかを確かめる一覧（TravelLegList）を表示します（src/domain/travel-check.ts）。
 * このとき、日時・場所・座標の無い証言は、移動の確認から外した証言として理由ごとに一覧にします。
 */
'use client';

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { buildMapTrail, buildPersonLanes, groupStopsByPlace, type ClaimView, type MapPin } from '@/domain/case-views';
import { buildPersonTravel, TRAVELING_PERSON_KINDS, type TravelExcludedReason } from '@/domain/travel-check';
import type { Case, Id } from '@/domain/types';
import { INPUT_CLASS, LABEL_CLASS } from '../forms/fields';
import { ClaimCard } from './ClaimCard';
import { TravelLegList } from './TravelLegList';

// Leaflet は window を前提にしているため、サーバー側では描画しない
const TrailMap = dynamic(() => import('./TrailMap'), {
  ssr: false,
  loading: () => <p className="p-2 text-xs text-muted-foreground">地図を読み込んでいます…</p>,
});

const UNMAPPED_LABEL = '地図に表示できない証言';
const TRAVEL_EXCLUDED_LABEL = '移動の確認から外した証言';

/** 表示できない（移動の確認から外した）理由ごとの見出しです。no-when は人物を選んだときだけ現れます。 */
const UNMAPPED_REASONS: { reason: TravelExcludedReason; label: string }[] = [
  { reason: 'no-coordinates', label: '場所に座標が登録されていない証言' },
  { reason: 'no-place', label: '場所を述べていない証言' },
  { reason: 'no-when', label: '日時が無い証言' },
];

/** 人物を選ばない（すべての証言を時系列の並び順にたどる）ことを表す、選択肢の値です。 */
const NO_PERSON = '';

type MapViewProps = {
  target: Case;
  /** 操作のパネルの先頭に置く、絞り込みの欄です。 */
  filterPanel?: ReactNode;
};

export function MapView({ target, filterPanel }: MapViewProps) {
  const personFieldId = useId();
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [personId, setPersonId] = useState<Id>(NO_PERSON);
  // 選べる人物は、いずれかの証言に発言者か言及された人物として登場する、個人と物です（TRAVELING_PERSON_KINDS）
  const persons = useMemo(() => buildPersonLanes(target, TRAVELING_PERSON_KINDS).lanes, [target]);
  // 選んだ人物が削除されたり、証言に登場しなくなったりした場合は、人物を選ばない表示に戻す
  const selectedPersonId = persons.some((person) => person.personId === personId) ? personId : NO_PERSON;

  const trail = useMemo(() => buildMapTrail(target), [target]);
  const travel = useMemo(
    () => (selectedPersonId === NO_PERSON ? undefined : buildPersonTravel(target, selectedPersonId)),
    [target, selectedPersonId]
  );
  const stops = travel ? travel.stops : trail.stops;
  const unmapped: { view: ClaimView; reason: TravelExcludedReason }[] = travel
    ? travel.excluded
    : trail.unmapped;
  const unmappedLabel = travel ? TRAVEL_EXCLUDED_LABEL : UNMAPPED_LABEL;
  const pins = useMemo(() => groupStopsByPlace(stops), [stops]);
  const path = useMemo(() => stops.map((stop) => stop.coordinates), [stops]);
  const [activeIndex, setActiveIndex] = useState(0);

  // 証言の編集や削除で地点が減った場合に、範囲外を指さないようにする
  const lastIndex = stops.length - 1;
  const currentIndex = Math.min(activeIndex, lastIndex);
  const activeStop = stops[currentIndex];

  /** ピンの証言を選択します。選択中の証言がそのピンにある場合は、同じ場所の次の証言（最後の次は最初）へ切り替えます。 */
  const selectPin = (pin: MapPin) => {
    if (!activeStop) return;
    const nextOrder = pin.orders[(pin.orders.indexOf(activeStop.order) + 1) % pin.orders.length];
    if (nextOrder !== undefined) setActiveIndex(nextOrder - 1);
  };

  return (
    // 地図は広げた領域の背面に置き、パネルはその上に重ねる。
    // 地図の側を z-0 で1つの重なりの単位にし、Leaflet の内部の重なり順（ピンや操作ボタン）がパネルより手前に出ないようにする
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0 z-0 bg-muted">
        {activeStop && <TrailMap pins={pins} path={path} activeOrder={activeStop.order} onSelectPin={selectPin} />}
      </div>

      {/* パネルの外側の余白では、地図をそのまま操作できるよう、クリックを地図へ通す */}
      <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={isPanelOpen}
          onClick={() => setIsPanelOpen((current) => !current)}
          className="pointer-events-auto shadow-md"
        >
          {isPanelOpen ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
          {isPanelOpen ? 'パネルを隠す' : 'パネルを表示'}
        </Button>

        {isPanelOpen && (
          // 画面の狭い端末では、パネルが地図を覆い尽くさないよう、高さを地図の半分までにする
          <section
            aria-label="地図の操作"
            className="pointer-events-auto flex max-h-[50%] min-h-0 w-full max-w-md md:max-h-full flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-background/95 p-3 shadow-lg backdrop-blur"
          >
            {filterPanel}

            <div>
              <label htmlFor={personFieldId} className={LABEL_CLASS}>
                移動を確かめる人物
              </label>
              <select
                id={personFieldId}
                value={selectedPersonId}
                onChange={(event) => {
                  setPersonId(event.target.value);
                  setActiveIndex(0);
                }}
                className={`${INPUT_CLASS} max-w-xs`}
              >
                <option value={NO_PERSON}>人物を選ばない（すべての証言）</option>
                {persons.map((person) => (
                  <option key={person.personId} value={person.personId}>
                    {person.label}
                  </option>
                ))}
              </select>
            </div>

            {activeStop ? (
              <section aria-label="地図でたどる" className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    disabled={currentIndex === 0}
                    onClick={() => setActiveIndex(currentIndex - 1)}
                    className="rounded border border-border px-3 py-1 text-foreground hover:bg-muted disabled:opacity-40"
                  >
                    前へ
                  </button>
                  <button
                    type="button"
                    disabled={currentIndex === lastIndex}
                    onClick={() => setActiveIndex(currentIndex + 1)}
                    className="rounded border border-border px-3 py-1 text-foreground hover:bg-muted disabled:opacity-40"
                  >
                    次へ
                  </button>
                  <p aria-live="polite" className="font-medium text-foreground">
                    {`${activeStop.order} / ${stops.length} ${activeStop.place.name}`}
                  </p>
                </div>
                <ul aria-label="選択中の証言">
                  <ClaimCard view={activeStop.view} showSpeaker tab="map" />
                </ul>
              </section>
            ) : travel ? (
              <p className="text-sm text-muted-foreground">
                この人物には、日時と座標のある証言がありません。証言に日時を入れ、場所に座標を登録してください。
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                地図に表示できる証言がまだありません。場所に座標を登録し、証言の本文で「@」からその場所に言及してください。
              </p>
            )}

            {travel && <TravelLegList legs={travel.legs} />}

            {unmapped.length > 0 && (
              <section aria-label={unmappedLabel} className="rounded-lg border border-border bg-muted/40 p-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {unmappedLabel}（{unmapped.length}件）
                </h3>
                {UNMAPPED_REASONS.map(({ reason, label }) => {
                  const items = unmapped.filter((item) => item.reason === reason);
                  if (items.length === 0) return null;
                  return (
                    <div key={reason} className="mt-2">
                      <h4 className="mb-1 text-xs font-medium text-muted-foreground">{label}</h4>
                      <ul aria-label={label} className="space-y-2">
                        {items.map((item) => (
                          <ClaimCard key={item.view.claim.id} view={item.view} showSpeaker tab="map" />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
