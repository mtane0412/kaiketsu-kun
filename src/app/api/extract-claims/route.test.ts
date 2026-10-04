/**
 * 証言の候補の抽出 API（POST /api/extract-claims）のテスト
 *
 * LLM を呼ぶ前に拒否するリクエスト（形式に合わないもの）だけを確かめます。
 * LLM の呼び出しと失敗の扱いは src/lib/claim-extraction-llm.test.ts で確かめます。
 */
import { describe, expect, it } from 'vitest';
import { POST } from './route';

/** 指定した本文の POST リクエストを作ります。 */
function postRequest(body: string): Request {
  return new Request('http://localhost/api/extract-claims', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
}

describe('POST /api/extract-claims', () => {
  it('JSON として読めない本文は 400 で拒否する', async () => {
    const response = await POST(postRequest('JSONではない本文'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'リクエストの本文を JSON として読めませんでした。' });
  });

  it('API キーの無いリクエストは、LLM を呼ばずに 400 で拒否する', async () => {
    const response = await POST(
      postRequest(
        JSON.stringify({
          text: '庭に黒い車が止まっていた',
          sourceName: '別荘の事件の記事・1998年8月13日・湖畔新聞',
          personNames: [],
          placeNames: [],
          apiKey: '',
          model: 'anthropic/claude-sonnet-5',
        })
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'リクエストの形式が正しくありません（apiKey）。' });
  });
});
