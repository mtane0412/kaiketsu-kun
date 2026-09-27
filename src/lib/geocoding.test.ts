/**
 * 住所・地名から座標を調べる処理（国土地理院の住所検索API・OpenStreetMap の Nominatim）のテスト
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEOCODING_MAX_RESULTS, NOMINATIM_MIN_INTERVAL_MS, searchCoordinates } from './geocoding';

const 国土地理院のURL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const NominatimのURL = 'https://nominatim.openstreetmap.org/search';

type 差し替える応答 = { body: unknown; ok?: boolean; status?: number } | Error | DOMException;

/**
 * fetch を差し替えます。呼び出されたURLが国土地理院か Nominatim かで、返す応答を切り替えます。
 * Error・DOMException を渡した検索先は、その例外で fetch が失敗したものとして扱います。
 */
const 応答を差し替える = (応答: { 国土地理院: 差し替える応答; Nominatim: 差し替える応答 }) => {
  const fetchMock = vi.fn(async (url: string) => {
    const 選んだ応答 = url.startsWith(国土地理院のURL) ? 応答.国土地理院 : 応答.Nominatim;
    // 注意: jsdom の DOMException は Error を継承していないため、両方を確かめる
    if (選んだ応答 instanceof Error || 選んだ応答 instanceof DOMException) throw 選んだ応答;
    return { ok: 選んだ応答.ok ?? true, status: 選んだ応答.status ?? 200, json: async () => 選んだ応答.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/** 国土地理院の応答（GeoJSON の Feature の配列。座標は [経度, 緯度] の順）です。 */
const 永田町の応答 = [
  { geometry: { coordinates: [139.744385, 35.677414], type: 'Point' }, type: 'Feature', properties: { addressCode: '', title: '東京都千代田区永田町一丁目７番' } },
];

/** Nominatim の応答（緯度・経度は文字列）です。 */
const エッフェル塔の応答 = [{ lat: '48.8582599', lon: '2.2945006', display_name: 'エッフェル塔, パリ, フランス' }];

// Nominatim の呼び出し間隔の待ち時間を、テストの中で進められるようにする
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  // 前のテストの待ち時間が、次のテストに持ち越されないようにする
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('searchCoordinates', () => {
  it('国土地理院と Nominatim の両方で検索し、国土地理院の候補を先に並べて返す', async () => {
    応答を差し替える({ 国土地理院: { body: 永田町の応答 }, Nominatim: { body: エッフェル塔の応答 } });

    const search = await searchCoordinates('名所');

    expect(search).toEqual({
      results: [
        // 国土地理院の座標は経度が先のため、入れ替える
        { title: '東京都千代田区永田町一丁目７番', latitude: 35.677414, longitude: 139.744385 },
        // Nominatim の座標は文字列のため、数値に直す
        { title: 'エッフェル塔, パリ, フランス', latitude: 48.8582599, longitude: 2.2945006 },
      ],
      warnings: [],
    });
  });

  it('検索語の前後の空白を取り除き、URLエンコードして両方の検索先に渡す（Nominatim には日本語の地名を求める）', async () => {
    const fetchMock = 応答を差し替える({ 国土地理院: { body: [] }, Nominatim: { body: [] } });

    await searchCoordinates('  エッフェル塔  ');

    const 検索語 = encodeURIComponent('エッフェル塔');
    // 検証: 応答しない検索先を打ち切れるよう、中断の合図（signal）も渡している
    const 中断の合図 = expect.objectContaining({ signal: expect.any(AbortSignal) });
    expect(fetchMock).toHaveBeenCalledWith(`${国土地理院のURL}?q=${検索語}`, 中断の合図);
    expect(fetchMock).toHaveBeenCalledWith(`${NominatimのURL}?format=jsonv2&limit=${GEOCODING_MAX_RESULTS}&accept-language=ja&q=${検索語}`, 中断の合図);
  });

  it('候補が無い場合は、空の配列を返す', async () => {
    応答を差し替える({ 国土地理院: { body: [] }, Nominatim: { body: [] } });

    expect(await searchCoordinates('存在しない地名')).toEqual({ results: [], warnings: [] });
  });

  it('国土地理院の候補が多い場合は、先頭から上限の件数だけ使う', async () => {
    const 多数の候補 = Array.from({ length: GEOCODING_MAX_RESULTS + 5 }, (_, index) => ({
      geometry: { coordinates: [139 + index * 0.01, 35], type: 'Point' },
      properties: { title: `中央${index + 1}丁目` },
    }));
    応答を差し替える({ 国土地理院: { body: 多数の候補 }, Nominatim: { body: [] } });

    const { results } = await searchCoordinates('中央');

    expect(results).toHaveLength(GEOCODING_MAX_RESULTS);
    expect(results[0]?.title).toBe('中央1丁目');
  });

  it('検索語が空の場合は、APIを呼ばずに例外を投げる', async () => {
    const fetchMock = 応答を差し替える({ 国土地理院: { body: [] }, Nominatim: { body: [] } });

    await expect(searchCoordinates('   ')).rejects.toThrow('検索する住所・地名を入力してください');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('片方の検索先がエラーを返した場合は、もう片方の候補を返し、失敗したことを知らせる', async () => {
    応答を差し替える({ 国土地理院: { body: 永田町の応答 }, Nominatim: { body: null, ok: false, status: 503 } });

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapで検索できませんでした（HTTP 503）。見つかった候補だけを表示しています。']);
  });

  it('片方の検索先の応答が想定した形式でない場合も、もう片方の候補を返し、失敗したことを知らせる', async () => {
    応答を差し替える({ 国土地理院: { body: { message: '想定外の応答' } }, Nominatim: { body: エッフェル塔の応答 } });

    const search = await searchCoordinates('エッフェル塔');

    expect(search.results.map((result) => result.title)).toEqual(['エッフェル塔, パリ, フランス']);
    expect(search.warnings).toEqual(['国土地理院の応答を読み取れませんでした。見つかった候補だけを表示しています。']);
  });

  it('片方の検索先が時間内に応答しない場合は、もう片方の候補を返し、応答が無かったことを知らせる', async () => {
    応答を差し替える({ 国土地理院: { body: 永田町の応答 }, Nominatim: new DOMException('signal timed out', 'TimeoutError') });

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapで検索できませんでした（応答がありませんでした）。見つかった候補だけを表示しています。']);
  });

  it.each([
    { label: '緯度が空の文字列', 候補: { lat: '', lon: '2.2945006', display_name: '名前だけの地点' } },
    { label: '緯度が範囲外（90より大きい）', 候補: { lat: '95', lon: '2.2945006', display_name: '北極より北の地点' } },
    { label: '経度が範囲外（180より大きい）', 候補: { lat: '48.8', lon: '200', display_name: '日付変更線の先の地点' } },
  ])('Nominatim の座標が正しくない場合（$label）は、読み取れなかったことを知らせる', async ({ 候補 }) => {
    応答を差し替える({ 国土地理院: { body: 永田町の応答 }, Nominatim: { body: [候補] } });

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapの応答を読み取れませんでした。見つかった候補だけを表示しています。']);
  });

  it('続けて検索した場合は、Nominatim を前回の呼び出しから決められた間隔をあけて呼び出す（利用ルールで1秒に1回までのため）', async () => {
    const fetchMock = 応答を差し替える({ 国土地理院: { body: [] }, Nominatim: { body: エッフェル塔の応答 } });
    const Nominatimの呼び出し回数 = () => fetchMock.mock.calls.filter(([url]) => url.startsWith(NominatimのURL)).length;

    await searchCoordinates('エッフェル塔');
    const 二回目の検索 = searchCoordinates('凱旋門');

    // 前提: 間隔が空くまでは、2回目の Nominatim の呼び出しを待たせる
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS - 1);
    expect(Nominatimの呼び出し回数()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await 二回目の検索;
    expect(Nominatimの呼び出し回数()).toBe(2);
  });

  it('片方の検索先の応答が JSON として読めない場合は、もう片方の候補を返し、どの検索先で失敗したかを知らせる', async () => {
    // 前提: Nominatim が JSON ではない応答（例: メンテナンス中の HTML ページ）を返した
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith(国土地理院のURL)
          ? { ok: true, status: 200, json: async () => 永田町の応答 }
          : { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } },
      ),
    );

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapの応答を読み取れませんでした。見つかった候補だけを表示しています。']);
  });

  it('両方の検索先で失敗した場合は、それぞれの理由を含む例外を投げる', async () => {
    応答を差し替える({ 国土地理院: new TypeError('Failed to fetch'), Nominatim: { body: null, ok: false, status: 503 } });

    await expect(searchCoordinates('永田町')).rejects.toThrow(
      '国土地理院で検索できませんでした（通信に失敗しました）。OpenStreetMapで検索できませんでした（HTTP 503）',
    );
  });
});
