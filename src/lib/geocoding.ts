/**
 * 住所・地名から座標を調べる処理（国土地理院の住所検索API）
 *
 * 国土地理院の住所検索APIは、無料でキーが不要で、ブラウザから直接呼び出せます（日本国内の住所・地名が対象です）。
 * 応答は GeoJSON の Feature の配列で、座標は [経度, 緯度] の順です。
 * 利用者が「検索」を押したときだけ呼び出す前提です（入力のたびに呼び出す使い方はしません）。
 */
import { z } from 'zod';

const ADDRESS_SEARCH_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

/** 返す候補の件数の上限です。地名だけの検索（例:「中央」）は数百件の候補が返るため、先頭だけを扱います。 */
export const GEOCODING_MAX_RESULTS = 10;

/** 座標の候補です。 */
export type GeocodingResult = {
  /** 候補の名前（APIが返す住所・地名の表記）です。 */
  title: string;
  latitude: number;
  longitude: number;
};

const responseSchema = z.array(
  z.object({
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.object({ title: z.string() }),
  }),
);

/**
 * 住所・地名から、座標の候補を調べます（先頭から GEOCODING_MAX_RESULTS 件まで）。候補が無い場合は空の配列を返します。
 * 検索語が空の場合、通信に失敗した場合、応答が想定した形式でない場合は、例外を投げます。
 */
export async function searchCoordinates(query: string): Promise<GeocodingResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('検索する住所・地名を入力してください');
  }

  let response: Response;
  try {
    response = await fetch(`${ADDRESS_SEARCH_URL}?q=${encodeURIComponent(trimmed)}`);
  } catch (caught) {
    throw new Error('住所を検索できませんでした（通信に失敗しました）', { cause: caught });
  }
  if (!response.ok) {
    throw new Error(`住所を検索できませんでした（HTTP ${response.status}）`);
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('住所検索の応答を読み取れませんでした', { cause: parsed.error });
  }
  return parsed.data.slice(0, GEOCODING_MAX_RESULTS).map((feature) => {
    // GeoJSON の座標は [経度, 緯度] の順
    const [longitude, latitude] = feature.geometry.coordinates;
    return { title: feature.properties.title, latitude, longitude };
  });
}
