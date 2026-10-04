/**
 * 証言の候補の抽出 API のリクエストの検証と、ブラウザから API を呼ぶ処理のテスト
 *
 * fetch はテスト用の関数で置き換え、実際の通信は行いません。
 */
import { describe, expect, it, vi } from 'vitest';
import { ExtractionRequestSchema, MAX_EXTRACTION_TEXT_LENGTH, requestClaimExtraction, type ExtractionRequest } from './claim-extraction-api';

const request: ExtractionRequest = {
  text: '近くに住む山田花子さんは「庭に黒い車が止まっていた」と話した。',
  sourceName: '別荘の事件の記事・1998年8月13日・湖畔新聞',
  personNames: ['山田 花子'],
  placeNames: [],
  apiKey: 'sk-or-テスト用のキー',
  model: 'anthropic/claude-sonnet-5',
};

const extractedClaim = {
  speakerName: '山田花子',
  viaNames: [],
  title: null,
  content: '庭に黒い車が止まっていた',
  quote: '庭に黒い車が止まっていた',
  when: null,
  placeName: null,
  mentionedPersonNames: [],
};

/** 指定した状態コードと JSON を返す fetch の代役です。 */
function fetchReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe('ExtractionRequestSchema', () => {
  it('本文が空のリクエストと、上限を超えるリクエストを受け付けない', () => {
    expect(ExtractionRequestSchema.safeParse(request).success).toBe(true);
    expect(ExtractionRequestSchema.safeParse({ ...request, text: '' }).success).toBe(false);
    expect(ExtractionRequestSchema.safeParse({ ...request, text: 'あ'.repeat(MAX_EXTRACTION_TEXT_LENGTH + 1) }).success).toBe(false);
  });

  it('API キーかモデルが空のリクエストを受け付けない', () => {
    expect(ExtractionRequestSchema.safeParse({ ...request, apiKey: '' }).success).toBe(false);
    expect(ExtractionRequestSchema.safeParse({ ...request, model: ' ' }).success).toBe(false);
  });
});

describe('requestClaimExtraction', () => {
  it('抽出 API にリクエストを送り、証言の候補の一覧を返す', async () => {
    const fetcher = fetchReturning(200, { claims: [extractedClaim] });

    await expect(requestClaimExtraction(request, fetcher)).resolves.toEqual([extractedClaim]);
    expect(fetcher).toHaveBeenCalledWith('/api/extract-claims', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }));
  });

  it('API が失敗を返した場合は、API が示した理由でエラーにする', async () => {
    const fetcher = fetchReturning(401, { error: 'OpenRouter が API キーを受け付けませんでした。キーを確かめてください。' });

    await expect(requestClaimExtraction(request, fetcher)).rejects.toThrow('OpenRouter が API キーを受け付けませんでした');
  });

  it('API の応答が形式に合わない場合はエラーにする', async () => {
    const fetcher = fetchReturning(200, { claims: [{ content: '引用が無い' }] });

    await expect(requestClaimExtraction(request, fetcher)).rejects.toThrow('形式');
  });
});
