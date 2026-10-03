// @vitest-environment node
/**
 * 記事の本文の取得 API（POST /api/fetch-article）のテスト
 *
 * ページを取得する前に拒否するリクエスト（別のオリジンからの呼び出し・形式に合わないもの・内部のアドレス）だけを確かめます。
 * 取得と本文の取り出しは src/lib/article-download.test.ts と src/lib/article-extraction.test.ts で確かめます。
 */
import { describe, expect, it } from 'vitest';
import { POST } from './route';

/** 指定した本文とオリジンの POST リクエストを作ります。origin を null にすると Origin ヘッダーを付けません。 */
function postRequest(body: string, origin: string | null = 'http://localhost'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin !== null) headers.Origin = origin;
  return new Request('http://localhost/api/fetch-article', { method: 'POST', body, headers });
}

describe('POST /api/fetch-article', () => {
  it('別のオリジンのページからの呼び出しは 403 で拒否する', async () => {
    const response = await POST(postRequest(JSON.stringify({ url: 'https://news.example.com/kohan' }), 'https://evil.example.com'));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'このアプリの画面からだけ呼び出せます。' });
  });

  it('Origin ヘッダーの無い呼び出しは 403 で拒否する', async () => {
    const response = await POST(postRequest(JSON.stringify({ url: 'https://news.example.com/kohan' }), null));

    expect(response.status).toBe(403);
  });

  it('JSON として読めない本文は 400 で拒否する', async () => {
    const response = await POST(postRequest('JSONではない本文'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'リクエストの本文を JSON として読めませんでした。' });
  });

  it('YouTube のURLは取得せず、文字起こしを貼り付けるよう案内する', async () => {
    const response = await POST(postRequest(JSON.stringify({ url: 'https://youtu.be/abc' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'YouTube の動画の字幕は取得できません。YouTube の「文字起こしを表示」の内容を、本文の欄に貼り付けてください。',
    });
  });

  it('URLの無いリクエストは 400 で拒否する', async () => {
    const response = await POST(postRequest(JSON.stringify({})));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'リクエストの形式が正しくありません（url）。' });
  });

  it('内部のアドレスのURLは、取得せずに 400 で拒否する', async () => {
    const response = await POST(postRequest(JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data/' })));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '内部のネットワークのアドレス（169.254.169.254）からは取得できません。' });
  });
});
