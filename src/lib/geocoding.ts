/**
 * 住所・地名から座標を調べる処理（国土地理院の住所検索API・OpenStreetMap の Nominatim）
 *
 * 2つの検索先に同時に問い合わせ、候補をまとめて返します。国土地理院の候補（日本国内の細かい住所に強い）を先に、
 * Nominatim の候補（世界の住所・地名が対象）を後に並べます。どちらも無料でキーが不要で、ブラウザから直接呼び出せます。
 * - 国土地理院: 応答は GeoJSON の Feature の配列で、座標は [経度, 緯度] の順です。
 * - Nominatim: 応答は検索結果の配列で、緯度・経度は文字列です。
 * 注意: Nominatim の利用ルールでは、呼び出しは1秒に1回までで、入力のたびに呼び出す使い方（自動補完）は禁止されています。
 * そのため、利用者が「検索」を押したときだけ呼び出す前提で、続けて検索した場合も前回の呼び出しから1秒あけます。
 * また、候補を表示する画面には OpenStreetMap の出典を表示する必要があります（CoordinateField.tsx）。
 * 応答しない検索先は GEOCODING_TIMEOUT_MS で打ち切り、その検索先だけの失敗として扱います。
 */
import { z } from 'zod';

const GSI_SEARCH_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

/** 検索先ごとに使う候補の件数の上限です。地名だけの検索（例:「中央」）は数百件の候補が返るため、先頭だけを扱います。 */
export const GEOCODING_MAX_RESULTS = 10;

/** 1つの検索先の応答を待つ上限（ミリ秒）です。 */
const GEOCODING_TIMEOUT_MS = 10_000;

/** Nominatim を呼び出す間隔の下限（ミリ秒）です。利用ルールの「1秒に1回まで」に合わせます。 */
export const NOMINATIM_MIN_INTERVAL_MS = 1_000;

/** 座標の候補です。 */
export type GeocodingResult = {
  /** 候補の名前（APIが返す住所・地名の表記）です。 */
  title: string;
  latitude: number;
  longitude: number;
};

/** 検索の結果です。 */
export type GeocodingSearch = {
  /** 座標の候補です。 */
  results: GeocodingResult[];
  /** 一部の検索先で失敗した場合に、利用者へ知らせる文です。すべて成功した場合は空の配列です。 */
  warnings: string[];
};

const gsiResponseSchema = z.array(
  z.object({
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.object({ title: z.string() }),
  }),
);

const nominatimResponseSchema = z.array(
  z.object({
    // 緯度・経度は文字列で返るため、空でないことを確かめてから数値に直し、範囲を確かめる
    lat: z.string().trim().min(1).transform(Number).pipe(z.number().min(-90).max(90)),
    lon: z.string().trim().min(1).transform(Number).pipe(z.number().min(-180).max(180)),
    display_name: z.string(),
  }),
);

/**
 * 住所・地名から、座標の候補を調べます。候補が無い場合は results が空の配列になります。
 * 片方の検索先だけで失敗した場合は、もう片方の候補を返し、失敗の理由を warnings に入れます。
 * 検索語が空の場合と、両方の検索先で失敗した場合は、例外を投げます。
 */
export async function searchCoordinates(query: string): Promise<GeocodingSearch> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('検索する住所・地名を入力してください');
  }

  const settled = await Promise.allSettled([searchGsi(trimmed), searchNominatim(trimmed)]);
  const results = settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? outcome.value : []));
  const failures = settled.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));

  if (failures.length === settled.length) {
    throw new Error(failures.map(errorMessage).join('。'), { cause: failures });
  }
  return { results, warnings: failures.map((failure) => `${errorMessage(failure)}。見つかった候補だけを表示しています。`) };
}

/** 国土地理院の住所検索APIで検索します。 */
async function searchGsi(query: string): Promise<GeocodingResult[]> {
  const body = await fetchJson('国土地理院', `${GSI_SEARCH_URL}?q=${encodeURIComponent(query)}`);
  const parsed = gsiResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error('国土地理院の応答を読み取れませんでした', { cause: parsed.error });
  }
  return parsed.data.slice(0, GEOCODING_MAX_RESULTS).map((feature) => {
    // GeoJSON の座標は [経度, 緯度] の順
    const [longitude, latitude] = feature.geometry.coordinates;
    return { title: feature.properties.title, latitude, longitude };
  });
}

/** OpenStreetMap の Nominatim で検索します。候補の名前は日本語の表記を求めます（日本語の表記が無い地名は現地の表記になります）。 */
async function searchNominatim(query: string): Promise<GeocodingResult[]> {
  await waitForNominatimTurn();
  const url = `${NOMINATIM_SEARCH_URL}?format=jsonv2&limit=${GEOCODING_MAX_RESULTS}&accept-language=ja&q=${encodeURIComponent(query)}`;
  const parsed = nominatimResponseSchema.safeParse(await fetchJson('OpenStreetMap', url));
  if (!parsed.success) {
    throw new Error('OpenStreetMapの応答を読み取れませんでした', { cause: parsed.error });
  }
  return parsed.data.map((place) => ({ title: place.display_name, latitude: place.lat, longitude: place.lon }));
}

/** Nominatim の呼び出しの順番待ちです。前回の呼び出しから NOMINATIM_MIN_INTERVAL_MS が過ぎると解決します。 */
let nominatimTurn: Promise<void> = Promise.resolve();

/**
 * Nominatim を呼び出してよい順番になるまで待ちます。
 * 呼び出すたびに「今回の順番の NOMINATIM_MIN_INTERVAL_MS 後」を次の順番として予約するため、続けて呼び出しても間隔があきます。
 * 注意: 間隔をあけるのは、この画面（ブラウザのタブ）の中の呼び出しどうしだけです。
 */
function waitForNominatimTurn(): Promise<void> {
  const turn = nominatimTurn;
  nominatimTurn = turn.then(() => new Promise((resolve) => setTimeout(resolve, NOMINATIM_MIN_INTERVAL_MS)));
  return turn;
}

/**
 * URL を呼び出し、応答の JSON を返します。
 * 通信に失敗した場合、GEOCODING_TIMEOUT_MS 以内に応答が無い場合、HTTP のエラーの場合、応答が JSON として読めない場合は、
 * 検索先の名前を含む例外を投げます。
 */
async function fetchJson(sourceName: string, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(GEOCODING_TIMEOUT_MS) });
  } catch (caught) {
    // AbortSignal.timeout による打ち切りは、名前が TimeoutError の例外になる（実行環境ごとに DOMException の実体が異なるため、名前で判定する）
    if (typeof caught === 'object' && caught !== null && 'name' in caught && caught.name === 'TimeoutError') {
      throw new Error(`${sourceName}で検索できませんでした（応答がありませんでした）`, { cause: caught });
    }
    throw new Error(`${sourceName}で検索できませんでした（通信に失敗しました）`, { cause: caught });
  }
  if (!response.ok) {
    throw new Error(`${sourceName}で検索できませんでした（HTTP ${response.status}）`);
  }
  try {
    return await response.json();
  } catch (caught) {
    throw new Error(`${sourceName}の応答を読み取れませんでした`, { cause: caught });
  }
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : String(caught);
}
