/**
 * OpenRouter のモデルの一覧の取得と、料金の表記のテスト
 *
 * fetch はテスト用の関数で置き換え、実際の通信は行いません。
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchOpenRouterModels, formatModelPrice, OPENROUTER_MODELS_URL } from './openrouter-models';

/** OpenRouter のモデルの一覧の API が返す形式のモデルです（使わない項目は省いています）。 */
function apiModel(id: string, name: string, supportedParameters: string[], prompt = '0.0000001', completion = '0.0000005') {
  return {
    id,
    name,
    context_length: 400000,
    pricing: { prompt, completion },
    architecture: { output_modalities: ['text'] },
    supported_parameters: supportedParameters,
  };
}

/** 指定した状態コードと JSON を返す fetch の代役です。 */
function fetchReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe('fetchOpenRouterModels', () => {
  it('構造化出力に対応するモデルだけを、名前の順に返す（バッチ版と、文章を出力しないモデルを除く）', async () => {
    const fetcher = fetchReturning(200, {
      data: [
        apiModel('openai/gpt-6-luna', 'OpenAI: GPT-6 Luna', ['structured_outputs', 'response_format']),
        apiModel('openai/gpt-6-luna:batch', 'OpenAI: GPT-6 Luna (batch)', ['structured_outputs']),
        apiModel('anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5', ['structured_outputs'], '0.000003', '0.000015'),
        apiModel('example/old-model', 'Example: 構造化出力に対応しないモデル', ['temperature']),
        { ...apiModel('example/image-model', 'Example: 画像のモデル', ['structured_outputs']), architecture: { output_modalities: ['image'] } },
      ],
    });

    const models = await fetchOpenRouterModels(fetcher);

    expect(fetcher).toHaveBeenCalledWith(OPENROUTER_MODELS_URL);
    expect(models).toEqual([
      { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', promptPrice: 0.000003, completionPrice: 0.000015, contextLength: 400000 },
      { id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', promptPrice: 0.0000001, completionPrice: 0.0000005, contextLength: 400000 },
    ]);
  });

  it('一覧を取得できない場合は、理由を示すエラーにする', async () => {
    await expect(fetchOpenRouterModels(fetchReturning(503, {}))).rejects.toThrow('OpenRouter のモデルの一覧を取得できませんでした（503）');
  });

  it('一覧の形式が想定と異なる場合は、エラーにする', async () => {
    await expect(fetchOpenRouterModels(fetchReturning(200, { models: [] }))).rejects.toThrow('形式');
  });
});

describe('formatModelPrice', () => {
  it('1トークンあたりの料金を、100万トークンあたりのドルで示す', () => {
    expect(
      formatModelPrice({ id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', promptPrice: 0.0000001, completionPrice: 0.0000005, contextLength: 400000 })
    ).toBe('入力 $0.10 / 出力 $0.50（100万トークンあたり）');
  });
});
