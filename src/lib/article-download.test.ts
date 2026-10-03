// @vitest-environment node
/**
 * 記事のページの HTML の取得（リダイレクト・時間切れ・大きさ・種類・文字コードの扱い）のテスト
 *
 * 通信は fetch の代役に置き換えます。名前解決した結果が内部のアドレスかどうかの検証は、
 * src/lib/public-address.test.ts で確かめます。
 */
import { describe, expect, it, vi } from 'vitest';
import { ArticleFetchError, decodeHtml, downloadArticleHtml } from './article-download';

/** 「日本」を Shift_JIS で表したバイト列です。 */
const NIHON_SHIFT_JIS = [0x93, 0xfa, 0x96, 0x7b];
/** 「日本」を EUC-JP で表したバイト列です。 */
const NIHON_EUC_JP = [0xc6, 0xfc, 0xcb, 0xdc];

/** ASCII の文字列と、文字コードを指定したバイト列をつなげます。 */
function bytesOf(...parts: (string | number[])[]): Uint8Array<ArrayBuffer> {
  const chunks = parts.map((part) => (typeof part === 'string' ? Array.from(new TextEncoder().encode(part)) : part));
  return new Uint8Array(chunks.flat());
}

/** HTML のページの応答を作ります。 */
function htmlResponse(body: string | Uint8Array<ArrayBuffer>, contentType = 'text/html; charset=utf-8') {
  return new Response(body, { status: 200, headers: { 'Content-Type': contentType } });
}

/** リダイレクトの応答を作ります。 */
function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

/** 取得に失敗した理由（状態コードとメッセージ）を返します。失敗しなかった場合はテストを失敗させます。 */
async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ArticleFetchError) return { status: error.status, message: error.message };
    throw error;
  }
  throw new Error('取得が失敗しませんでした');
}

describe('downloadArticleHtml', () => {
  it('ページの HTML と、取得したURLを返す', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => htmlResponse('<html><body>湖畔の別荘</body></html>'));

    const result = await downloadArticleHtml('https://news.example.com/kohan', fetcher);

    expect(result).toEqual({ html: '<html><body>湖畔の別荘</body></html>', url: 'https://news.example.com/kohan' });
    // リダイレクト先を自分で検証するため、fetch にはリダイレクトをたどらせない
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe('manual');
  });

  it('リダイレクト先が公開のURLなら、たどって取得する（相対のURLも解決する）', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input) === 'https://news.example.com/kohan' ? redirectResponse('/articles/kohan-1998') : htmlResponse('<p>本文</p>')
    );

    const result = await downloadArticleHtml('https://news.example.com/kohan', fetcher);

    expect(result.url).toBe('https://news.example.com/articles/kohan-1998');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('内部のアドレスを直接指定したURLは、取得せずに拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const failure = await failureOf(downloadArticleHtml('http://127.0.0.1:3000/admin', fetcher));

    expect(failure).toEqual({ status: 400, message: '内部のネットワークのアドレス（127.0.0.1）からは取得できません。' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('リダイレクト先が内部のアドレスなら、たどらずに拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => redirectResponse('http://169.254.169.254/latest/meta-data/'));

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/kohan', fetcher));

    expect(failure).toEqual({ status: 400, message: '内部のネットワークのアドレス（169.254.169.254）からは取得できません。' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('リダイレクト先が http か https でないなら、たどらずに拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => redirectResponse('file:///etc/passwd'));

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/kohan', fetcher));

    expect(failure.status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('リダイレクトが続きすぎる場合は、取得をやめる', async () => {
    let count = 0;
    const fetcher = vi.fn<typeof fetch>(async () => redirectResponse(`https://news.example.com/loop/${++count}`));

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/kohan', fetcher));

    expect(failure).toEqual({ status: 502, message: 'リダイレクトが多すぎるため、取得をやめました。' });
  });

  it('ページが見つからない場合は、状態コードを示す', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('Not Found', { status: 404 }));

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/missing', fetcher));

    expect(failure).toEqual({ status: 502, message: '記事のページを取得できませんでした（404）。' });
  });

  it('HTML でないページは、種類を示して拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => htmlResponse(bytesOf('%PDF-1.7'), 'application/pdf'));

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/kohan.pdf', fetcher));

    expect(failure).toEqual({ status: 415, message: '記事のページが HTML ではありません（application/pdf）。' });
  });

  it('大きさの上限を超えると申告したページは、本文を読まずに拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('<p>本文</p>', { headers: { 'Content-Type': 'text/html', 'Content-Length': '999999999' } })
    );

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/kohan', fetcher, { maxBytes: 1000 }));

    expect(failure).toEqual({ status: 413, message: '記事のページが大きすぎます（上限 1000 バイト）。' });
  });

  it('大きさを申告せずに上限を超えたページは、読む途中で拒否する', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => htmlResponse(`<p>${'あ'.repeat(1000)}</p>`));

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/kohan', fetcher, { maxBytes: 1000 }));

    expect(failure.status).toBe(413);
  });

  it('時間内に応答しないページは、時間切れにする', async () => {
    // 中断の合図を受けるまで応答しない代役です
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
    );

    const failure = await failureOf(downloadArticleHtml('https://news.example.com/slow', fetcher, { timeoutMs: 20 }));

    expect(failure).toEqual({ status: 504, message: '記事のページが時間内に応答しませんでした。' });
  });

  it('名前解決の結果が内部のアドレスで接続を拒んだ場合は、内部のアドレスとして示す', async () => {
    const refused = Object.assign(new Error('内部のアドレスです'), { code: 'ENOTPUBLIC' });
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed', { cause: refused });
    });

    const failure = await failureOf(downloadArticleHtml('https://intranet.example.com/', fetcher));

    expect(failure).toEqual({ status: 400, message: '内部のネットワークのアドレス（intranet.example.com）からは取得できません。' });
  });

  it('接続できない場合は、理由を示す', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('見つかりません'), { code: 'ENOTFOUND' }) });
    });

    const failure = await failureOf(downloadArticleHtml('https://no-such-host.example.com/', fetcher));

    expect(failure).toEqual({ status: 502, message: '記事のページに接続できませんでした（ENOTFOUND）。' });
  });
});

describe('decodeHtml', () => {
  it('Content-Type で指定された文字コード（Shift_JIS）で読む', () => {
    expect(decodeHtml(bytesOf('<p>', NIHON_SHIFT_JIS, '</p>'), 'text/html; charset=Shift_JIS')).toBe('<p>日本</p>');
  });

  it('Content-Type に指定が無ければ、meta の charset（EUC-JP）で読む', () => {
    const html = bytesOf('<html><head><meta charset="EUC-JP"></head><body>', NIHON_EUC_JP, '</body></html>');

    expect(decodeHtml(html, 'text/html')).toContain('<body>日本</body>');
  });

  it('meta の http-equiv で指定された文字コードでも読む', () => {
    const html = bytesOf('<meta http-equiv="Content-Type" content="text/html; charset=shift_jis"><p>', NIHON_SHIFT_JIS, '</p>');

    expect(decodeHtml(html, 'text/html')).toContain('<p>日本</p>');
  });

  it('どこにも指定が無ければ UTF-8 で読む', () => {
    expect(decodeHtml(bytesOf('<p>湖畔</p>'), 'text/html')).toBe('<p>湖畔</p>');
  });

  it('読めない文字コードが指定されている場合は、文字化けさせずに拒否する', () => {
    expect(() => decodeHtml(bytesOf('<p>本文</p>'), 'text/html; charset=x-unknown-code')).toThrow(
      new ArticleFetchError(422, '記事のページの文字コード（x-unknown-code）を読めません。')
    );
  });
});
