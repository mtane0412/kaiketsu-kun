/**
 * 座標を決めるための地図（地理院タイルの表示、クリックでの地点の選択、ピンの表示）
 *
 * Leaflet は window を前提にしているため、この部品は next/dynamic の ssr: false で読み込みます（CoordinateField.tsx）。
 * 地図の画像は国土地理院の地理院タイルです（GsiTileLayers.tsx）。地点を探しやすい標準地図を最初に表示し、右上の選択肢で淡色地図に切り替えられます。
 */
'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, useMap, useMapEvents } from 'react-leaflet';
import type { Coordinates } from '@/domain/types';
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/gsi-tiles';
import { GsiTileLayers } from '../GsiTileLayers';

/** 座標が無い場合に表示する範囲（日本全体が収まる中心とズームレベル）です。 */
const JAPAN_CENTER: [number, number] = [36.5, 137.5];
const JAPAN_ZOOM = 5;

/** 座標の地点へ地図を移すときのズームレベル（建物の並びが分かる縮尺）です。 */
const FOCUS_ZOOM = 16;

/** このズームレベル未満で選んだ地点は位置が粗いため、選んだ地点へ地図を拡大して、選び直しやすくします。 */
const COARSE_ZOOM = 12;

const PIN_RADIUS = 8;
const PIN_STYLE = { color: '#ffffff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 };

type CoordinateMapProps = {
  /** ピンを立てる座標です。座標が無い場合は undefined です。 */
  value: Coordinates | undefined;
  /** 地図をクリックした地点の座標を受け取ります。 */
  onPick: (picked: Coordinates) => void;
};

export default function CoordinateMap({ value, onPick }: CoordinateMapProps) {
  return (
    <MapContainer
      center={value ? [value.latitude, value.longitude] : JAPAN_CENTER}
      zoom={value ? FOCUS_ZOOM : JAPAN_ZOOM}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      className="h-full w-full cursor-crosshair"
    >
      <GsiTileLayers defaultStyle="standard" />
      <PickHandler onPick={onPick} />
      {value && (
        <>
          <FocusOnValue value={value} />
          {/* ピンのクリックは地図に伝え、ピンの上でも地点を選び直せるようにする */}
          <CircleMarker center={[value.latitude, value.longitude]} radius={PIN_RADIUS} pathOptions={PIN_STYLE} bubblingMouseEvents />
        </>
      )}
    </MapContainer>
  );
}

/** 地図のクリックを受け取り、その地点の座標を onPick に渡します。 */
function PickHandler({ onPick }: { onPick: (picked: Coordinates) => void }) {
  useMapEvents({
    click: (event) => onPick({ latitude: event.latlng.lat, longitude: event.latlng.lng }),
  });
  return null;
}

/**
 * 座標が変わったとき、その地点が見えていないか、地図の縮尺が粗い場合に、その地点へ地図を移します。
 * 十分に拡大した地図の中でクリックした場合は、地図を動かしません（クリックのたびに地図が動くと、選び直しにくいため）。
 */
function FocusOnValue({ value }: { value: Coordinates }) {
  const map = useMap();
  useEffect(() => {
    const point: [number, number] = [value.latitude, value.longitude];
    if (map.getBounds().contains(point) && map.getZoom() >= COARSE_ZOOM) return;
    map.setView(point, FOCUS_ZOOM);
  }, [map, value.latitude, value.longitude]);
  return null;
}
