/**
 * 記事のページの HTML の取得（サーバーだけで使います）
 *
 * 本文の取得 API（src/app/api/fetch-article/route.ts）から呼び、ユーザーが入力したURLのページを取得して、文字列の HTML にします。
 * - 接続先: http か https で、内部のネットワークのアドレスでないURLだけに接続します。リダイレクトは自動ではたどらず、
 *   たどる前にリダイレクト先を同じく検証します。ホスト名で指定されたURLは、接続する直前に名前解決の結果を検証します
 *   （src/lib/public-address.ts の createPublicOnlyLookup。fetcher 側で行います）。
 * - 上限: 時間切れ（既定10秒。リダイレクトと本文の読み込みを含みます）と、受け取る大きさ（既定5MB）を持ちます。
 *   取り出した本文はケースに含めてブラウザの LocalStorage（およそ5MB）に保存するため、それを大きく超えるページは扱いません。
 * - 文字コード: Content-Type の charset、無ければ HTML の先頭の meta の charset で読みます。どちらにも無ければ、
 *   HTML の仕様の既定と同じく UTF-8 で読みます。指定された文字コードを読めない場合は、文字化けした本文を返さずに失敗にします。
 *
 * 失敗は、ユーザーに示す理由と API の状態コードを持つ ArticleFetchError にします。
 */
import { isIP } from 'node:net';
import { isHttpUrl } from '@/domain/transcript';
import { isPublicAddress, NOT_PUBLIC_ADDRESS_CODE } from './public-address';

/** 取得の時間切れの既定値（ミリ秒）です。 */
export const ARTICLE_FETCH_TIMEOUT_MS = 10_000;

/** 受け取る HTML の大きさの上限の既定値（バイト）です。 */
export const MAX_ARTICLE_HTML_BYTES = 5 * 1024 * 1024;

/** たどるリダイレクトの上限の回数です。 */
const MAX_REDIRECTS = 5;

/** リダイレクトを表す状態コードです。 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** 本文を取り出せる、HTML のページの種類です。 */
const HTML_MEDIA_TYPES = new Set(['text/html', 'application/xhtml+xml']);

/** meta の charset を探す、HTML の先頭のバイト数です。 */
const META_CHARSET_SCAN_BYTES = 4096;

/** 取得するときに名乗る User-Agent です。既定（undici）のままだと拒否するサイトがあるため、用途の分かる名前にします。 */
const USER_AGENT = 'Mozilla/5.0 (compatible; KaiketsuKun/0.0; article-fetcher)';

/** 記事の取得に失敗した理由です。status は本文の取得 API が返す状態コードです。 */
export class ArticleFetchError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ArticleFetchError';
  }
}

/** 取得の上限です。テストで小さくするために指定できます。 */
export type DownloadOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

/** 取得したページです。url はリダイレクトをたどった後のURLです。 */
export type DownloadedHtml = { html: string; url: string };

/** 内部のネットワークのアドレスへの取得を拒否する理由です。 */
function notPublicError(host: string): ArticleFetchError {
  return new ArticleFetchError(400, `内部のネットワークのアドレス（${host}）からは取得できません。`);
}

/**
 * 接続してよいURLかを確かめます。http か https でないURLと、内部のアドレスを直接指定したURLを拒否します。
 * ホスト名で指定されたURLは、接続する直前に名前解決の結果を確かめるため、ここでは通します。
 */
function assertFetchableUrl(url: URL): void {
  if (!isHttpUrl(url.href)) throw new ArticleFetchError(400, `http か https でないURLからは取得できません: ${url.href}`);
  // IPv6 のアドレスは、URL のホスト名では [::1] のように角かっこで囲まれる
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) !== 0 && !isPublicAddress(host)) throw notPublicError(host);
}

/** エラーと、その原因（cause）をたどって、エラーのコード（ENOTFOUND など）を探します。 */
function findErrorCode(error: unknown): string | undefined {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const { code } = current as NodeJS.ErrnoException;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** 本文を、上限の大きさまで読みます。上限を超えた時点で読むのをやめます。 */
async function readBodyWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = new ArticleFetchError(413, `記事のページが大きすぎます（上限 ${maxBytes} バイト）。`);
  const declaredLength = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw tooLarge;
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Content-Type や meta の値から、charset の指定を取り出します。 */
function charsetIn(value: string): string | undefined {
  return /charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(value)?.[1];
}

/**
 * HTML のバイト列を、Content-Type の charset、HTML の先頭の meta の charset、UTF-8 の順に決めた文字コードで読みます。
 * 指定された文字コードを読めない場合は、文字化けした本文を返さないよう失敗にします。
 */
export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  // meta は ASCII で書かれるため、文字コードが決まる前の先頭は latin1 として読んで探す
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, META_CHARSET_SCAN_BYTES));
  const metaTag = /<meta\b[^>]*charset[^>]*>/i.exec(head)?.[0];
  const charset = charsetIn(contentType) ?? (metaTag ? charsetIn(metaTag) : undefined) ?? 'utf-8';

  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    throw new ArticleFetchError(422, `記事のページの文字コード（${charset}）を読めません。`);
  }
  return decoder.decode(bytes);
}

/** 1回分の取得です。リダイレクトはたどりません。 */
async function fetchOnce(url: URL, fetcher: typeof fetch, signal: AbortSignal): Promise<Response> {
  try {
    return await fetcher(url.href, {
      redirect: 'manual',
      signal,
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': USER_AGENT },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    const code = findErrorCode(error);
    if (code === NOT_PUBLIC_ADDRESS_CODE) throw notPublicError(url.hostname);
    throw new ArticleFetchError(502, code ? `記事のページに接続できませんでした（${code}）。` : '記事のページに接続できませんでした。');
  }
}

/** リダイレクトを検証しながらたどり、最後のページの応答を返します。 */
async function followRedirects(startUrl: string, fetcher: typeof fetch, signal: AbortSignal): Promise<{ response: Response; url: URL }> {
  let url = new URL(startUrl);
  for (let redirects = 0; ; redirects++) {
    assertFetchableUrl(url);
    const response = await fetchOnce(url, fetcher, signal);
    const location = response.headers.get('Location');
    if (!REDIRECT_STATUSES.has(response.status) || location === null) return { response, url };

    await response.body?.cancel();
    if (redirects >= MAX_REDIRECTS) throw new ArticleFetchError(502, 'リダイレクトが多すぎるため、取得をやめました。');
    if (!URL.canParse(location, url)) throw new ArticleFetchError(502, `リダイレクト先のURLを読めませんでした（${location}）。`);
    url = new URL(location, url);
  }
}

/**
 * 記事のページを取得し、文字列の HTML と、リダイレクトをたどった後のURLを返します。
 * @param fetcher - 接続に使う fetch です。本番では、名前解決の結果を検証する fetch（src/app/api/fetch-article/route.ts）を渡します。
 */
export async function downloadArticleHtml(url: string, fetcher: typeof fetch, options: DownloadOptions = {}): Promise<DownloadedHtml> {
  const { timeoutMs = ARTICLE_FETCH_TIMEOUT_MS, maxBytes = MAX_ARTICLE_HTML_BYTES } = options;
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const { response, url: finalUrl } = await followRedirects(url, fetcher, signal);
    if (!response.ok) {
      await response.body?.cancel();
      throw new ArticleFetchError(502, `記事のページを取得できませんでした（${response.status}）。`);
    }

    const contentType = response.headers.get('Content-Type') ?? '';
    const mediaType = contentType.split(';')[0]!.trim().toLowerCase();
    if (!HTML_MEDIA_TYPES.has(mediaType)) {
      await response.body?.cancel();
      throw new ArticleFetchError(415, `記事のページが HTML ではありません（${mediaType || '種類の指定なし'}）。`);
    }

    const bytes = await readBodyWithLimit(response, maxBytes);
    return { html: decodeHtml(bytes, contentType), url: finalUrl.href };
  } catch (error) {
    if (error instanceof ArticleFetchError) throw error;
    if (signal.aborted) throw new ArticleFetchError(504, '記事のページが時間内に応答しませんでした。');
    throw error;
  }
}
