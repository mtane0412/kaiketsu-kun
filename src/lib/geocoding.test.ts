/**
 * 住所・地名から座標を調べる処理（国土地理院の住所検索API・OpenStreetMap の Nominatim）のテスト
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GEOCODING_MAX_RESULTS, NOMINATIM_MIN_INTERVAL_MS, searchCoordinates } from './geocoding';

const gsiUrl = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const nominatimUrl = 'https://nominatim.openstreetmap.org/search';

type StubResponse = { body: unknown; ok?: boolean; status?: number } | Error | DOMException;

/**
 * fetch を差し替えます。呼び出されたURLが国土地理院か Nominatim かで、返す応答を切り替えます。
 * Error・DOMException を渡した検索先は、その例外で fetch が失敗したものとして扱います。
 */
const stubResponses = (responses: { gsi: StubResponse; Nominatim: StubResponse }) => {
  const fetchMock = vi.fn(async (url: string) => {
    const selectedResponse = url.startsWith(gsiUrl) ? responses.gsi : responses.Nominatim;
    // 注意: jsdom の DOMException は Error を継承していないため、両方を確かめる
    if (selectedResponse instanceof Error || selectedResponse instanceof DOMException) throw selectedResponse;
    return { ok: selectedResponse.ok ?? true, status: selectedResponse.status ?? 200, json: async () => selectedResponse.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/** 国土地理院の応答（GeoJSON の Feature の配列。座標は [経度, 緯度] の順）です。 */
const nagatachoResponse = [
  { geometry: { coordinates: [139.744385, 35.677414], type: 'Point' }, type: 'Feature', properties: { addressCode: '', title: '東京都千代田区永田町一丁目７番' } },
];

/** Nominatim の応答（緯度・経度は文字列）です。 */
const eiffelTowerResponse = [{ lat: '48.8582599', lon: '2.2945006', display_name: 'エッフェル塔, パリ, フランス' }];

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
    stubResponses({ gsi: { body: nagatachoResponse }, Nominatim: { body: eiffelTowerResponse } });

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
    const fetchMock = stubResponses({ gsi: { body: [] }, Nominatim: { body: [] } });

    await searchCoordinates('  エッフェル塔  ');

    const searchTerm = encodeURIComponent('エッフェル塔');
    // 検証: 応答しない検索先を打ち切れるよう、中断の合図（signal）も渡している
    const abortSignal = expect.objectContaining({ signal: expect.any(AbortSignal) });
    expect(fetchMock).toHaveBeenCalledWith(`${gsiUrl}?q=${searchTerm}`, abortSignal);
    expect(fetchMock).toHaveBeenCalledWith(`${nominatimUrl}?format=jsonv2&limit=${GEOCODING_MAX_RESULTS}&accept-language=ja&q=${searchTerm}`, abortSignal);
  });

  it('候補が無い場合は、空の配列を返す', async () => {
    stubResponses({ gsi: { body: [] }, Nominatim: { body: [] } });

    expect(await searchCoordinates('存在しない地名')).toEqual({ results: [], warnings: [] });
  });

  it('国土地理院の候補が多い場合は、先頭から上限の件数だけ使う', async () => {
    const manyCandidates = Array.from({ length: GEOCODING_MAX_RESULTS + 5 }, (_, index) => ({
      geometry: { coordinates: [139 + index * 0.01, 35], type: 'Point' },
      properties: { title: `中央${index + 1}丁目` },
    }));
    stubResponses({ gsi: { body: manyCandidates }, Nominatim: { body: [] } });

    const { results } = await searchCoordinates('中央');

    expect(results).toHaveLength(GEOCODING_MAX_RESULTS);
    expect(results[0]?.title).toBe('中央1丁目');
  });

  it('検索語が空の場合は、APIを呼ばずに例外を投げる', async () => {
    const fetchMock = stubResponses({ gsi: { body: [] }, Nominatim: { body: [] } });

    await expect(searchCoordinates('   ')).rejects.toThrow('検索する住所・地名を入力してください');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('片方の検索先がエラーを返した場合は、もう片方の候補を返し、失敗したことを知らせる', async () => {
    stubResponses({ gsi: { body: nagatachoResponse }, Nominatim: { body: null, ok: false, status: 503 } });

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapで検索できませんでした（HTTP 503）。見つかった候補だけを表示しています。']);
  });

  it('片方の検索先の応答が想定した形式でない場合も、もう片方の候補を返し、失敗したことを知らせる', async () => {
    stubResponses({ gsi: { body: { message: '想定外の応答' } }, Nominatim: { body: eiffelTowerResponse } });

    const search = await searchCoordinates('エッフェル塔');

    expect(search.results.map((result) => result.title)).toEqual(['エッフェル塔, パリ, フランス']);
    expect(search.warnings).toEqual(['国土地理院の応答を読み取れませんでした。見つかった候補だけを表示しています。']);
  });

  it('片方の検索先が時間内に応答しない場合は、もう片方の候補を返し、応答が無かったことを知らせる', async () => {
    stubResponses({ gsi: { body: nagatachoResponse }, Nominatim: new DOMException('signal timed out', 'TimeoutError') });

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapで検索できませんでした（応答がありませんでした）。見つかった候補だけを表示しています。']);
  });

  it.each([
    { label: '緯度が空の文字列', candidate: { lat: '', lon: '2.2945006', display_name: '名前だけの地点' } },
    { label: '緯度が範囲外（90より大きい）', candidate: { lat: '95', lon: '2.2945006', display_name: '北極より北の地点' } },
    { label: '経度が範囲外（180より大きい）', candidate: { lat: '48.8', lon: '200', display_name: '日付変更線の先の地点' } },
  ])('Nominatim の座標が正しくない場合（$label）は、読み取れなかったことを知らせる', async ({ candidate }) => {
    stubResponses({ gsi: { body: nagatachoResponse }, Nominatim: { body: [candidate] } });

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapの応答を読み取れませんでした。見つかった候補だけを表示しています。']);
  });

  it('続けて検索した場合は、Nominatim を前回の呼び出しから決められた間隔をあけて呼び出す（利用ルールで1秒に1回までのため）', async () => {
    const fetchMock = stubResponses({ gsi: { body: [] }, Nominatim: { body: eiffelTowerResponse } });
    const countNominatimCalls = () => fetchMock.mock.calls.filter(([url]) => url.startsWith(nominatimUrl)).length;

    await searchCoordinates('エッフェル塔');
    const secondSearch = searchCoordinates('凱旋門');

    // 前提: 間隔が空くまでは、2回目の Nominatim の呼び出しを待たせる
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS - 1);
    expect(countNominatimCalls()).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    await secondSearch;
    expect(countNominatimCalls()).toBe(2);
  });

  it('片方の検索先の応答が JSON として読めない場合は、もう片方の候補を返し、どの検索先で失敗したかを知らせる', async () => {
    // 前提: Nominatim が JSON ではない応答（例: メンテナンス中の HTML ページ）を返した
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith(gsiUrl)
          ? { ok: true, status: 200, json: async () => nagatachoResponse }
          : { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } },
      ),
    );

    const search = await searchCoordinates('永田町');

    expect(search.results.map((result) => result.title)).toEqual(['東京都千代田区永田町一丁目７番']);
    expect(search.warnings).toEqual(['OpenStreetMapの応答を読み取れませんでした。見つかった候補だけを表示しています。']);
  });

  it('両方の検索先で失敗した場合は、それぞれの理由を含む例外を投げる', async () => {
    stubResponses({ gsi: new TypeError('Failed to fetch'), Nominatim: { body: null, ok: false, status: 503 } });

    await expect(searchCoordinates('永田町')).rejects.toThrow(
      '国土地理院で検索できませんでした（通信に失敗しました）。OpenStreetMapで検索できませんでした（HTTP 503）',
    );
  });
});
