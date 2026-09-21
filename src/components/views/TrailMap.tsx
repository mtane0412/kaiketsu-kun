/**
 * 時系列の並び順をたどるための地図（地理院タイルの表示、番号付きのピン、地点を順に結ぶ線）
 *
 * Leaflet は window を前提にしているため、この部品は next/dynamic の ssr: false で読み込みます（MapView.tsx）。
 * 地図の種類は、ピンと線が見やすい淡色地図を最初に表示し、右上の選択肢で標準地図に切り替えられます。
 * ピンは場所ごとに1つで、その場所を述べる証言の順番（例「1・3」）を表示します。選択中の証言のピンは赤で示します。
 * 注意: Leaflet の既定のピン画像はバンドラー経由では読み込めないため、画像を使わない divIcon でピンを描きます。
 */
'use client';

import 'leaflet/dist/leaflet.css';
import { divIcon, latLngBounds, type LatLngTuple } from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import type { MapPin } from '@/domain/case-views';
import type { Coordinates } from '@/domain/types';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/gsi-tiles';
import { GsiTileLayers } from '../GsiTileLayers';

/** 最初にすべてのピンが収まる範囲を表示するときの余白（px）と、拡大の上限（地点が1つだけの場合に拡大しすぎないため）です。 */
const FIT_PADDING: [number, number] = [40, 40];
const FIT_MAX_ZOOM = 16;

/** 選択中の地点が、表示範囲をこの割合だけ内側に縮めた範囲から外れている場合に、その地点へ地図を移します。 */
const VISIBLE_AREA_SHRINK_RATIO = -0.1;

const PATH_STYLE = { color: '#0284c7', weight: 3, opacity: 0.7, dashArray: '6 6' };

/** 選択中のピンを、ほかのピンより手前に表示するための重なり順です。 */
const ACTIVE_PIN_Z_INDEX_OFFSET = 1000;

const PIN_LABEL_CLASS =
  'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-2 border-white px-2 py-0.5 text-xs font-bold text-white shadow';

type TrailMapProps = {
  /** 場所ごとのピンです。1つ以上が必要です。 */
  pins: MapPin[];
  /** 地点を時系列の並び順に結ぶ線の頂点です。 */
  path: Coordinates[];
  /** 選択中の証言の順番（MapStop.order）です。 */
  activeOrder: number;
  /** ピンが選ばれたときに呼び出します。 */
  onSelectPin: (pin: MapPin) => void;
};

function toLatLng(coordinates: Coordinates): LatLngTuple {
  return [coordinates.latitude, coordinates.longitude];
}

/** ピンの見た目を作ります。ラベルの幅が番号の数で変わるため、大きさ0の基準点の中央にラベルを重ねます。 */
function pinIcon(pin: MapPin, isActive: boolean) {
  return divIcon({
    className: '',
    iconSize: [0, 0],
    // 注意: html に入れるのは順番の数値だけです（ユーザーが入力した文字列は入れません）
    html: `<span class="${PIN_LABEL_CLASS} ${isActive ? 'bg-red-600' : 'bg-slate-600'}">${pin.orders.join('・')}</span>`,
  });
}

export default function TrailMap({ pins, path, activeOrder, onSelectPin }: TrailMapProps) {
  const activePin = pins.find((pin) => pin.orders.includes(activeOrder));

  return (
    <MapContainer
      bounds={latLngBounds(pins.map((pin) => toLatLng(pin.coordinates)))}
      boundsOptions={{ padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM }}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      className="h-full w-full"
    >
      <GsiTileLayers defaultStyle="pale" />
      <Polyline positions={path.map(toLatLng)} pathOptions={PATH_STYLE} />
      {pins.map((pin) => (
        <Marker
          key={pin.place.id}
          position={toLatLng(pin.coordinates)}
          icon={pinIcon(pin, pin === activePin)}
          title={pin.place.name}
          alt={`${pin.place.name}（${pin.orders.join('・')}番目）`}
          zIndexOffset={pin === activePin ? ACTIVE_PIN_Z_INDEX_OFFSET : 0}
          eventHandlers={{ click: () => onSelectPin(pin) }}
        />
      ))}
      {activePin && <FocusOnActive coordinates={activePin.coordinates} />}
    </MapContainer>
  );
}

/** 選択中の地点が表示範囲の端または外にある場合に、縮尺を変えずにその地点へ地図を移します。 */
function FocusOnActive({ coordinates }: { coordinates: Coordinates }) {
  const map = useMap();
  useEffect(() => {
    const point: LatLngTuple = [coordinates.latitude, coordinates.longitude];
    if (map.getBounds().pad(VISIBLE_AREA_SHRINK_RATIO).contains(point)) return;
    map.panTo(point);
  }, [map, coordinates.latitude, coordinates.longitude]);
  return null;
}
