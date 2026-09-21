/**
 * 住所・地名から座標を調べる処理（国土地理院の住所検索API）のテスト
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEOCODING_MAX_RESULTS, searchCoordinates } from './geocoding';

/** 住所検索APIの応答（GeoJSON の Feature の配列。座標は [経度, 緯度] の順）を返す fetch に差し替えます。 */
const 応答を差し替える = (body: unknown, init: { ok?: boolean; status?: number } = {}) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const 永田町の応答 = [
  { geometry: { coordinates: [139.744385, 35.677414], type: 'Point' }, type: 'Feature', properties: { addressCode: '', title: '東京都千代田区永田町一丁目７番' } },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('searchCoordinates', () => {
  it('住所を検索すると、候補の名前と緯度・経度を返す（APIの座標は経度が先のため、入れ替える）', async () => {
    const fetchMock = 応答を差し替える(永田町の応答);

    const results = await searchCoordinates('東京都千代田区永田町1-7-1');

    expect(results).toEqual([{ title: '東京都千代田区永田町一丁目７番', latitude: 35.677414, longitude: 139.744385 }]);
    // 検証: 検索語をURLエンコードして、国土地理院の住所検索APIに渡している
    expect(fetchMock).toHaveBeenCalledWith(
      `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent('東京都千代田区永田町1-7-1')}`,
    );
  });

  it('検索語の前後の空白は取り除く', async () => {
    const fetchMock = 応答を差し替える(永田町の応答);

    await searchCoordinates('  永田町  ');

    expect(fetchMock).toHaveBeenCalledWith(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent('永田町')}`);
  });

  it('候補が無い場合は、空の配列を返す', async () => {
    応答を差し替える([]);

    expect(await searchCoordinates('存在しない地名')).toEqual([]);
  });

  it('候補が多い場合は、先頭から上限の件数だけ返す', async () => {
    const 多数の候補 = Array.from({ length: GEOCODING_MAX_RESULTS + 5 }, (_, index) => ({
      geometry: { coordinates: [139 + index * 0.01, 35], type: 'Point' },
      properties: { title: `中央${index + 1}丁目` },
    }));
    応答を差し替える(多数の候補);

    const results = await searchCoordinates('中央');

    expect(results).toHaveLength(GEOCODING_MAX_RESULTS);
    expect(results[0]?.title).toBe('中央1丁目');
  });

  it('検索語が空の場合は、APIを呼ばずに例外を投げる', async () => {
    const fetchMock = 応答を差し替える([]);

    await expect(searchCoordinates('   ')).rejects.toThrow('検索する住所・地名を入力してください');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('APIがエラーを返した場合は、ステータスを含む例外を投げる', async () => {
    応答を差し替える(null, { ok: false, status: 503 });

    await expect(searchCoordinates('永田町')).rejects.toThrow('住所を検索できませんでした（HTTP 503）');
  });

  it('通信に失敗した場合は、例外を投げる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(searchCoordinates('永田町')).rejects.toThrow('住所を検索できませんでした（通信に失敗しました）');
  });

  it('応答が想定した形式でない場合は、例外を投げる', async () => {
    応答を差し替える({ message: '想定外の応答' });

    await expect(searchCoordinates('永田町')).rejects.toThrow('住所検索の応答を読み取れませんでした');
  });
});
