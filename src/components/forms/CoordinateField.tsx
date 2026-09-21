/**
 * 座標の入力欄（住所・地名の検索、地図のクリック、座標の削除）
 *
 * 座標は、住所・地名の検索（国土地理院の住所検索API）の候補から選ぶか、地図をクリックして決めます。
 * 住所の無い地点や架空の場所は検索で見つからないため、地図のクリックだけでも座標を決められます。
 * 検索は「検索」を押したとき（または検索欄で Enter を押したとき）だけ行います。
 */
'use client';

import dynamic from 'next/dynamic';
import { useId, useState, type KeyboardEvent } from 'react';
import type { Coordinates } from '@/domain/types';
import { searchCoordinates, type GeocodingResult } from '@/lib/geocoding';
import { FormError, INPUT_CLASS, LABEL_CLASS } from './fields';

/** 地図を表示する領域の高さです。地図を読み込む前から同じ高さを確保し、読み込み後に画面がずれないようにします。 */
const MAP_HEIGHT_CLASS = 'h-56';

/** 座標の表示の小数点以下の桁数です。5桁で約1mの精度になります。 */
const COORDINATE_FRACTION_DIGITS = 5;

const SUB_BUTTON_CLASS = 'shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50';

// Leaflet は window を前提にしており、サーバー側では読み込めないため、ブラウザでのみ読み込む
const CoordinateMap = dynamic(() => import('./CoordinateMap'), {
  ssr: false,
  loading: () => <p className="p-2 text-xs text-slate-500">地図を読み込んでいます…</p>,
});

type CoordinateFieldProps = {
  label: string;
  /** 登録する座標です。座標が無い場合は undefined です。 */
  value: Coordinates | undefined;
  onChange: (value: Coordinates | undefined) => void;
};

/**
 * ラベル付きの座標の入力欄です。
 * 検索の候補を選んだとき、地図をクリックしたときに、その地点の座標を onChange に渡します。
 * 検索に失敗した場合は、理由を欄の下に表示し、値を変えません。
 */
export function CoordinateField({ label, value, onChange }: CoordinateFieldProps) {
  const labelId = useId();
  const [query, setQuery] = useState('');
  /** 検索の候補です。検索していない場合と、候補を選んだ後は null です。 */
  const [results, setResults] = useState<GeocodingResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setError(null);
    setResults(null);
    setSearching(true);
    try {
      setResults(await searchCoordinates(query));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSearching(false);
    }
  };

  const handleQueryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 日本語入力の変換を確定する Enter では検索しない
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    // 場所のフォームの中に置くため、Enter でフォームを送信しない
    event.preventDefault();
    void handleSearch();
  };

  const handleSelect = (result: GeocodingResult) => {
    onChange({ latitude: result.latitude, longitude: result.longitude });
    setResults(null);
  };

  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className={LABEL_CLASS}>
        {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <input
            type="search"
            aria-label="住所・地名で検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleQueryKeyDown}
            placeholder="住所・地名で検索（日本国内）"
            className={INPUT_CLASS}
          />
          <button type="button" onClick={() => void handleSearch()} disabled={searching} className={SUB_BUTTON_CLASS}>
            検索
          </button>
        </div>
        {results?.length === 0 && (
          <p className="text-xs text-slate-500">候補が見つかりませんでした。地図をクリックして座標を決めてください。</p>
        )}
        {results && results.length > 0 && (
          <ul aria-label="座標の候補" className="max-h-40 space-y-1 overflow-y-auto">
            {results.map((result, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => handleSelect(result)}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-left text-xs hover:bg-slate-50"
                >
                  {result.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={`overflow-hidden rounded border border-slate-300 bg-slate-100 ${MAP_HEIGHT_CLASS}`}>
          <CoordinateMap value={value} onPick={onChange} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
          {value ? (
            <>
              <span>
                緯度 {value.latitude.toFixed(COORDINATE_FRACTION_DIGITS)}・経度 {value.longitude.toFixed(COORDINATE_FRACTION_DIGITS)}
              </span>
              <button type="button" onClick={() => onChange(undefined)} className="py-1 text-red-600 hover:underline">
                座標を削除
              </button>
            </>
          ) : (
            <span>座標は未設定です。</span>
          )}
          <span className="text-[11px] text-slate-500">地図をクリックすると、その地点を座標にします。</span>
        </div>
      </div>
      <FormError message={error} />
    </div>
  );
}
