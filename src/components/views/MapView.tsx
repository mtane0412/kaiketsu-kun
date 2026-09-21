/**
 * 地図ビュー
 *
 * 時系列の並び順のうち、座標のある場所を述べる証言を、地図上で1件ずつたどります。
 * 地図には場所ごとの番号付きのピンと、地点を順に結ぶ線を表示し、「前へ」「次へ」またはピンの選択で、証言を切り替えます。
 * 同じ場所に複数の証言がある場合は、ピンを選ぶたびに、その場所の証言を順に切り替えます。
 * 地図に表示できない証言（場所を述べていない・場所に座標が無い）は、見落とさないよう、地図の下に理由ごとに一覧にします。
 */
'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { buildMapTrail, groupStopsByPlace, type MapPin, type UnmappedReason } from '@/domain/case-views';
import type { Case, Id } from '@/domain/types';
import { ClaimCard } from './ClaimCard';

/** 地図の高さです。読み込み中の表示にも同じ高さを確保し、読み込みの前後で画面が動かないようにします。 */
const MAP_HEIGHT_CLASS = 'h-96';

// Leaflet は window を前提にしているため、サーバー側では描画しない
const TrailMap = dynamic(() => import('./TrailMap'), {
  ssr: false,
  loading: () => <p className="p-2 text-xs text-slate-500">地図を読み込んでいます…</p>,
});

const UNMAPPED_LABEL = '地図に表示できない証言';

const UNMAPPED_REASONS: { reason: UnmappedReason; label: string }[] = [
  { reason: 'no-coordinates', label: '場所に座標が登録されていない証言' },
  { reason: 'no-place', label: '場所を述べていない証言' },
];

type MapViewProps = {
  target: Case;
  /** 詳細を開いている証言のIDです。その証言のカードを強調します。 */
  activeClaimId?: Id;
};

export function MapView({ target, activeClaimId }: MapViewProps) {
  const trail = useMemo(() => buildMapTrail(target), [target]);
  const pins = useMemo(() => groupStopsByPlace(trail.stops), [trail]);
  const path = useMemo(() => trail.stops.map((stop) => stop.coordinates), [trail]);
  const [activeIndex, setActiveIndex] = useState(0);

  // 証言の編集や削除で地点が減った場合に、範囲外を指さないようにする
  const lastIndex = trail.stops.length - 1;
  const currentIndex = Math.min(activeIndex, lastIndex);
  const activeStop = trail.stops[currentIndex];

  /** ピンの証言を選択します。選択中の証言がそのピンにある場合は、同じ場所の次の証言（最後の次は最初）へ切り替えます。 */
  const selectPin = (pin: MapPin) => {
    if (!activeStop) return;
    const nextOrder = pin.orders[(pin.orders.indexOf(activeStop.order) + 1) % pin.orders.length];
    if (nextOrder !== undefined) setActiveIndex(nextOrder - 1);
  };

  return (
    <div className="space-y-4">
      {activeStop ? (
        <section aria-label="地図でたどる" className="space-y-2">
          <div className={`${MAP_HEIGHT_CLASS} overflow-hidden rounded border border-slate-200`}>
            <TrailMap pins={pins} path={path} activeOrder={activeStop.order} onSelectPin={selectPin} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setActiveIndex(currentIndex - 1)}
              className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              前へ
            </button>
            <button
              type="button"
              disabled={currentIndex === lastIndex}
              onClick={() => setActiveIndex(currentIndex + 1)}
              className="rounded border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              次へ
            </button>
            <p aria-live="polite" className="font-medium text-slate-800">
              {`${activeStop.order} / ${trail.stops.length} ${activeStop.place.name}`}
            </p>
          </div>
          <ul aria-label="選択中の証言">
            <ClaimCard view={activeStop.view} showSpeaker tab="map" isActive={activeStop.view.claim.id === activeClaimId} />
          </ul>
        </section>
      ) : (
        <p className="text-sm text-slate-500">
          地図に表示できる証言がまだありません。場所に座標を登録し、証言の本文で「@」からその場所に言及してください。
        </p>
      )}

      {trail.unmapped.length > 0 && (
        <section aria-label={UNMAPPED_LABEL} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-800">
            {UNMAPPED_LABEL}（{trail.unmapped.length}件）
          </h3>
          {UNMAPPED_REASONS.map(({ reason, label }) => {
            const items = trail.unmapped.filter((item) => item.reason === reason);
            if (items.length === 0) return null;
            return (
              <div key={reason} className="mt-2">
                <h4 className="mb-1 text-xs font-medium text-slate-600">{label}</h4>
                <ul aria-label={label} className="space-y-2">
                  {items.map((item) => (
                    <ClaimCard
                      key={item.view.claim.id}
                      view={item.view}
                      showSpeaker
                      tab="map"
                      isActive={item.view.claim.id === activeClaimId}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
