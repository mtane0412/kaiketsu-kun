/**
 * 時系列の並び順をたどるための地図（地図の画像の表示、番号付きのピン、地点を順に結ぶ線）
 *
 * Leaflet は window を前提にしているため、この部品は next/dynamic の ssr: false で読み込みます（MapView.tsx）。
 * 地図の画像（OpenStreetMap）は MapTileLayer.tsx が表示します。
 * ピンは場所ごとに1つで、その場所を述べる証言の順番（例「1・3」）を表示します。順番が多い場合のまとめ方は map-pin-label.ts にあります。選択中の証言のピンは赤で示します。
 * 拡大・縮小のボタンは、地図の左上に重ねる操作のパネル（MapView.tsx）と重ならないよう、右上に置きます。
 * ピンがそのパネルの裏に隠れないよう、すべてのピンを収める表示と、選択中のピンへ移る処理では、パネルが覆う幅（obscured）を除いた領域を使います。
 * 注意: Leaflet の既定のピン画像はバンドラー経由では読み込めないため、画像を使わない divIcon でピンを描きます。
 */
'use client';

import 'leaflet/dist/leaflet.css';
import { divIcon, latLngBounds, type LatLngTuple } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, useMap, ZoomControl } from 'react-leaflet';
import type { MapPin } from '@/domain/case-views';
import type { Coordinates } from '@/domain/types';
import type { ObscuredInset } from '@/lib/map-obscured-inset';
import { pinLabel } from '@/lib/map-pin-label';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/map-tiles';
import { MapTileLayer } from '../MapTileLayer';

/**
 * ピンを地図の端に寄せすぎないための余白（px）です。最初にすべてのピンを収めるときと、選択中のピンへ移るときに使います。
 * パネルが覆う側は、パネルが覆う幅にこの余白を足します。
 */
const EDGE_PADDING = 40;

/** 最初にすべてのピンを収めるときの、拡大の上限です（地点が1つだけの場合に拡大しすぎないため）。 */
const FIT_MAX_ZOOM = 16;

const PATH_STYLE = { color: '#0284c7', weight: 3, opacity: 0.7, dashArray: '6 6' };

/** 選択中のピンを、ほかのピンより手前に表示するための重なり順です。 */
const ACTIVE_PIN_Z_INDEX_OFFSET = 1000;

const PIN_LABEL_CLASS =
  'absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-2 border-background px-2 py-0.5 text-xs font-bold text-background shadow';

type TrailMapProps = {
  /** 場所ごとのピンです。1つ以上が必要です。 */
  pins: MapPin[];
  /** 地点を時系列の並び順に結ぶ線の頂点です。 */
  path: Coordinates[];
  /** 選択中の証言の順番（MapStop.order）です。 */
  activeOrder: number;
  /** ピンが選ばれたときに呼び出します。 */
  onSelectPin: (pin: MapPin) => void;
  /** 地図に重ねたパネルが地図を覆う幅です。ピンをこの部分に置かないようにします。 */
  obscured: ObscuredInset;
};

function toLatLng(coordinates: Coordinates): LatLngTuple {
  return [coordinates.latitude, coordinates.longitude];
}

/** パネルが覆う部分と端の余白を除いた領域に収めるための、Leaflet の余白の指定を返します。 */
function paddingOptions(obscured: ObscuredInset) {
  return {
    paddingTopLeft: [obscured.left + EDGE_PADDING, obscured.top + EDGE_PADDING] satisfies [number, number],
    paddingBottomRight: [EDGE_PADDING, EDGE_PADDING] satisfies [number, number],
  };
}

export default function TrailMap({ pins, path, activeOrder, onSelectPin, obscured }: TrailMapProps) {
  const activePin = pins.find((pin) => pin.orders.includes(activeOrder));

  return (
    <MapContainer
      bounds={latLngBounds(pins.map((pin) => toLatLng(pin.coordinates)))}
      // 注意: bounds は地図を作るときにだけ使われるため、パネルが覆う幅は、地図を作る前に測っておく（MapView）
      boundsOptions={{ ...paddingOptions(obscured), maxZoom: FIT_MAX_ZOOM }}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      zoomControl={false}
      className="h-full w-full"
    >
      <ZoomControl position="topright" />
      <MapTileLayer />
      <Polyline positions={path.map(toLatLng)} pathOptions={PATH_STYLE} />
      {pins.map((pin) => (
        <PinMarker
          key={pin.place.id}
          pin={pin}
          label={pinLabel(pin.orders, activeOrder)}
          isActive={pin === activePin}
          onSelectPin={onSelectPin}
        />
      ))}
      {activePin && <FocusOnActive coordinates={activePin.coordinates} obscured={obscured} />}
    </MapContainer>
  );
}

type PinMarkerProps = {
  pin: MapPin;
  /** ピンに表示するラベルです（pinLabel で作ります）。 */
  label: string;
  isActive: boolean;
  onSelectPin: (pin: MapPin) => void;
};

/**
 * 1つの場所のピンです。
 * ラベルの幅が番号の数で変わるため、大きさ0の基準点の中央にラベルを重ねます。
 * 注意: Marker はアイコンの参照が変わるたびにピンの DOM を作り直すため、ラベルか色が変わったときだけアイコンを作り直します。
 * 大きなケースでは、証言を選ぶたびにすべてのピンを作り直すと重くなるためです。
 */
function PinMarker({ pin, label, isActive, onSelectPin }: PinMarkerProps) {
  const icon = useMemo(
    () =>
      divIcon({
        className: '',
        iconSize: [0, 0],
        // 注意: html に入れるのは順番の数値と固定の文言だけです（ユーザーが入力した文字列は入れません）
        html: `<span class="${PIN_LABEL_CLASS} ${isActive ? 'bg-primary' : 'bg-muted-foreground'}">${label}</span>`,
      }),
    [label, isActive],
  );
  return (
    <Marker
      position={toLatLng(pin.coordinates)}
      icon={icon}
      title={pin.place.name}
      alt={`${pin.place.name}（${label}）`}
      zIndexOffset={isActive ? ACTIVE_PIN_Z_INDEX_OFFSET : 0}
      eventHandlers={{ click: () => onSelectPin(pin) }}
    />
  );
}

/**
 * 選択中の地点が、パネルが覆う部分と端の余白を除いた領域の外にある場合に、縮尺を変えずに、その領域に入るまで地図を移します。
 * パネルを開いたり大きさが変わったりして、選択中の地点がパネルの裏に入った場合も移します。
 */
function FocusOnActive({ coordinates, obscured }: { coordinates: Coordinates; obscured: ObscuredInset }) {
  const map = useMap();
  useEffect(() => {
    map.panInside([coordinates.latitude, coordinates.longitude], paddingOptions(obscured));
  }, [map, coordinates.latitude, coordinates.longitude, obscured]);
  return null;
}
