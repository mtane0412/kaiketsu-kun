/**
 * 記事の本文の取得 API（POST /api/fetch-article）のリクエストの検証と、ブラウザから API を呼ぶ処理のテスト
 */
import { describe, expect, it, vi } from 'vitest';
import { describeArticleUrlProblem, requestArticleFetch } from './article-fetch-api';

/** 指定した状態コードと JSON を返す fetch の代役を作ります。 */
function fetcherReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

describe('describeArticleUrlProblem', () => {
  it('http か https の記事のURLは、問題なし（null）とする', () => {
    expect(describeArticleUrlProblem('https://example.com/news/kohan-1998')).toBeNull();
  });

  it('URLが空のときは、URLを入れるよう示す', () => {
    expect(describeArticleUrlProblem('  ')).toBe('本文を取得する記事のURLを入力してください。');
  });

  it('http か https でないURLは、理由を示す', () => {
    expect(describeArticleUrlProblem('ftp://example.com/news')).toBe('URLは http か https のURLで指定してください: ftp://example.com/news');
  });

  it('YouTube のURLは取得せず、文字起こしを貼り付けるよう案内する', () => {
    expect(describeArticleUrlProblem('https://www.youtube.com/watch?v=abc')).toBe(
      'YouTube の動画の字幕は取得できません。YouTube の「文字起こしを表示」の内容を、本文の欄に貼り付けてください。'
    );
  });
});

describe('requestArticleFetch', () => {
  it('取得した本文・題名・公開日時を返す', async () => {
    const fetcher = fetcherReturning(200, { text: '湖畔の別荘で火事があった。', title: '湖畔の別荘で火事', publishedAt: '1998-08-13T06:30' });

    const article = await requestArticleFetch('https://example.com/news/kohan-1998', fetcher);

    expect(article).toEqual({ text: '湖畔の別荘で火事があった。', title: '湖畔の別荘で火事', publishedAt: '1998-08-13T06:30' });
    const [input, init] = fetcher.mock.calls[0]!;
    expect(input).toBe('/api/fetch-article');
    expect(JSON.parse(String(init?.body))).toEqual({ url: 'https://example.com/news/kohan-1998' });
  });

  it('API が失敗を返した場合は、API が示した理由のエラーにする', async () => {
    const fetcher = fetcherReturning(504, { error: '記事のページが時間内に応答しませんでした。' });

    await expect(requestArticleFetch('https://example.com/news/kohan-1998', fetcher)).rejects.toThrow('記事のページが時間内に応答しませんでした。');
  });

  it('API が理由の無い失敗を返した場合は、状態コードを示すエラーにする', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('Internal Server Error', { status: 500 }));

    await expect(requestArticleFetch('https://example.com/news/kohan-1998', fetcher)).rejects.toThrow('記事の本文を取得できませんでした（500）。');
  });

  it('応答が本文の形式に合わない場合は、エラーにする', async () => {
    const fetcher = fetcherReturning(200, { text: '' });

    await expect(requestArticleFetch('https://example.com/news/kohan-1998', fetcher)).rejects.toThrow(
      '本文の取得 API の応答が、本文の形式に合いませんでした。'
    );
  });
});
