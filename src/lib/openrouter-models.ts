/**
 * OpenRouter のモデルの一覧の取得と、料金の表記
 *
 * 証言の候補の抽出（src/components/ClaimExtraction.tsx）で、使うモデルを OpenRouter のモデルから選べるようにします。
 * 一覧の API（OPENROUTER_MODELS_URL）は API キー無しで呼べ、ブラウザからの呼び出しも許可されているため、ブラウザから直接呼びます。
 *
 * 選択肢にするのは、次の条件をすべて満たすモデルだけです。
 * - 構造化出力（supported_parameters の structured_outputs）に対応する。抽出は、出力の形式をスキーマで指定するためです。
 * - 文章（text）を出力する。
 * - バッチ版（ID の末尾が「:batch」）ではない。バッチ版は応答をすぐに返さないためです。
 */
import { z } from 'zod';

/** OpenRouter のモデルの一覧の API です。 */
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** 料金の表記に使う、トークン数の単位です（100万トークンあたりで示します）。 */
const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** バッチ版のモデルの ID の末尾です。 */
const BATCH_MODEL_SUFFIX = ':batch';

/** 一覧の API が返すモデルのうち、使う項目だけの形式です。料金は1トークンあたりのドルを文字列で持ちます。 */
const ApiModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  context_length: z.number().nullable(),
  pricing: z.object({ prompt: z.string(), completion: z.string() }),
  architecture: z.object({ output_modalities: z.array(z.string()) }),
  supported_parameters: z.array(z.string()),
});

const ApiResponseSchema = z.object({ data: z.array(ApiModelSchema) });

/** 選択肢にする OpenRouter のモデルです。料金は1トークンあたりのドルです。 */
export type OpenRouterModel = {
  id: string;
  name: string;
  promptPrice: number;
  completionPrice: number;
  /** 入力できるトークン数の上限です。一覧に無い場合は null です。 */
  contextLength: number | null;
};

/**
 * OpenRouter のモデルの一覧を取得し、抽出に使えるモデルだけを名前の順に返します（条件はこのファイル冒頭のコメントを参照）。
 * 取得に失敗した場合と、一覧の形式が想定と異なる場合は、理由を示すエラーにします。
 * @param fetcher - テストで通信を置き換えるための fetch です。
 */
export async function fetchOpenRouterModels(fetcher: typeof fetch = fetch): Promise<OpenRouterModel[]> {
  const response = await fetcher(OPENROUTER_MODELS_URL);
  if (!response.ok) throw new Error(`OpenRouter のモデルの一覧を取得できませんでした（${response.status}）。`);
  const parsed = ApiResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('OpenRouter のモデルの一覧が、想定した形式と異なります。');

  return parsed.data.data
    .filter(
      (model) =>
        model.supported_parameters.includes('structured_outputs') &&
        model.architecture.output_modalities.includes('text') &&
        !model.id.endsWith(BATCH_MODEL_SUFFIX)
    )
    .map((model) => ({
      id: model.id,
      name: model.name,
      promptPrice: Number(model.pricing.prompt),
      completionPrice: Number(model.pricing.completion),
      contextLength: model.context_length,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/** モデルの料金を「入力 $0.10 / 出力 $0.50（100万トークンあたり）」の形で示します。 */
export function formatModelPrice(model: OpenRouterModel): string {
  const perUnit = (price: number) => `$${(price * TOKENS_PER_PRICE_UNIT).toFixed(2)}`;
  return `入力 ${perUnit(model.promptPrice)} / 出力 ${perUnit(model.completionPrice)}（100万トークンあたり）`;
}
