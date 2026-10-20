/**
 * 証言の候補の抽出 API のリクエストの検証と、ブラウザから API を呼ぶ処理のテスト
 *
 * fetch はテスト用の関数で置き換え、実際の通信は行いません。
 */
import { describe, expect, it, vi } from 'vitest';
import { MAX_EXISTING_CLAIM_SUMMARY_LENGTH, MAX_EXISTING_CLAIMS_FOR_EXTRACTION } from '@/domain/claim-extraction';
import {
  ExtractionRequestSchema,
  MAX_EXTRACTION_NAMES,
  MAX_EXTRACTION_TEXT_LENGTH,
  requestClaimExtraction,
  selectExtractionNames,
  type ExtractionRequest,
} from './claim-extraction-api';

const request: ExtractionRequest = {
  text: '近くに住む山田花子さんは「庭に黒い車が止まっていた」と話した。',
  sourceName: '別荘の事件の記事・1998年8月13日・湖畔新聞',
  personNames: ['山田 花子'],
  placeNames: [],
  existingClaims: [],
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
  sameClaimIds: [],
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

  it(`既存の証言が上限の ${MAX_EXISTING_CLAIMS_FOR_EXTRACTION} 件を超えるリクエストと、要約が上限の文字数を超えるリクエストを受け付けない`, () => {
    const existingClaim = { id: 'claim-hanako', summary: '山田 花子: 庭に黒い車が止まっていた' };
    const tooMany = Array.from({ length: MAX_EXISTING_CLAIMS_FOR_EXTRACTION + 1 }, (_, index) => ({ ...existingClaim, id: `claim-${index}` }));

    expect(ExtractionRequestSchema.safeParse({ ...request, existingClaims: [existingClaim] }).success).toBe(true);
    expect(ExtractionRequestSchema.safeParse({ ...request, existingClaims: tooMany }).success).toBe(false);
    expect(
      ExtractionRequestSchema.safeParse({
        ...request,
        existingClaims: [{ ...existingClaim, summary: 'あ'.repeat(MAX_EXISTING_CLAIM_SUMMARY_LENGTH + 2) }],
      }).success
    ).toBe(false);
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

describe('selectExtractionNames', () => {
  /** 本文に出てこない、登録済みの人物の名前を count 件作ります。 */
  function unrelatedNames(count: number): string[] {
    return Array.from({ length: count }, (_, index) => `無関係の住民${index + 1}`);
  }

  it('上限以内なら、重なる名前を1つにまとめて、すべて送る', () => {
    const result = selectExtractionNames('山田花子さんは話した。', ['男'], ['山田 花子', '県警', '県警']);

    expect(result).toEqual({ names: ['男', '山田 花子', '県警'], omittedCount: 0 });
  });

  it('上限を超える場合は、この資料での呼び方と本文に出てくる名前を優先し、送らない件数を返す', () => {
    // 前提: 本文に出てこない名前が上限ちょうどあり、ほかに本文に出てくる「山田 花子」と、この資料での呼び方「男」がある
    const others = [...unrelatedNames(MAX_EXTRACTION_NAMES), '山田 花子'];

    const result = selectExtractionNames('山田花子さんは「男を見た」と話した。', ['男'], others);

    // 検証: 優先する2件を先頭に置き、上限に収まらない2件を送らない
    expect(result.names).toHaveLength(MAX_EXTRACTION_NAMES);
    expect(result.names.slice(0, 2)).toEqual(['男', '山田 花子']);
    expect(result.omittedCount).toBe(2);
  });

  it('上限の文字数を超える長い名前は送らず、送らない件数に数える', () => {
    const result = selectExtractionNames('本文', [], ['県警', 'あ'.repeat(201)]);

    expect(result).toEqual({ names: ['県警'], omittedCount: 1 });
  });
});
