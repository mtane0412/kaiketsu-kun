/**
 * 記事の本文の取得 API
 *
 * POST /api/fetch-article
 * - リクエスト: { url: 記事のURL }（src/lib/article-fetch-api.ts の ArticleFetchRequestSchema）
 * - 200: { text: 本文, title?: 題名, publishedAt?: 公開日時 }（src/lib/article-fetch-api.ts の FetchedArticleSchema）
 * - 400: リクエストが形式に合わない・http か https でない・YouTube のURL・内部のネットワークのアドレス
 * - 403: このアプリの画面（同じオリジン）以外からの呼び出し
 * - 413: ページが大きすぎる
 * - 415: ページが HTML でない
 * - 422: 本文を取り出せない・文字コードを読めない
 * - 502: ページが失敗を返した・接続できない・リダイレクトが多すぎる
 * - 504: ページが時間内に応答しない
 * 失敗の応答は { error: ユーザーに示す理由 } です。
 *
 * 悪用への備え: 誰でも呼べる取得の処理は、第三者のサイトへの取得の踏み台にされるおそれがあります。
 * - 内部のネットワークへの取得（SSRF）は、URLのアドレス・リダイレクト先・名前解決の結果を検証して拒否します（src/lib/article-download.ts、src/lib/public-address.ts）。
 * - 他のサイトのページから利用者のブラウザ経由で呼ばれないよう、Origin ヘッダーがこのアプリのオリジンと一致する呼び出しだけを受け付けます。
 *   Origin ヘッダーはブラウザの外からは自由に付けられるため、これは回数の制限ではありません。回数の制限は、記録する場所が要るため入れていません。
 */
import { Agent, fetch as undiciFetch } from 'undici';
import { ArticleFetchError, downloadArticleHtml } from '@/lib/article-download';
import { extractArticle } from '@/lib/article-extraction';
import { ArticleFetchRequestSchema, describeArticleUrlProblem } from '@/lib/article-fetch-api';
import { createPublicOnlyLookup } from '@/lib/public-address';

/** 実行時間の上限（秒）です。取得の時間切れ（ARTICLE_FETCH_TIMEOUT_MS）より長くし、時間切れの理由を返せるようにします。 */
export const maxDuration = 30;

/** 接続する直前に、名前解決の結果が公開アドレスかを検証する接続の設定です。 */
const publicOnlyDispatcher = new Agent({ connect: { lookup: createPublicOnlyLookup() } });

/**
 * 公開アドレスにだけ接続する fetch です。
 * 名前解決の結果の検証には接続の設定（dispatcher）が要るため、グローバルの fetch ではなく undici の fetch を使います。
 * undici の fetch は、型の上ではグローバルの fetch と別の Request・Response を使いますが、実行時は同じ形のため、型だけをそろえます。
 */
const publicFetch = ((input: string, init?: RequestInit) =>
  undiciFetch(input, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: publicOnlyDispatcher })) as unknown as typeof fetch;

/** 失敗の応答を作ります。 */
function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('Origin') !== new URL(request.url).origin) {
    return errorResponse(403, 'このアプリの画面からだけ呼び出せます。');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'リクエストの本文を JSON として読めませんでした。');
  }

  const parsed = ArticleFetchRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join('、');
    return errorResponse(400, `リクエストの形式が正しくありません（${fields}）。`);
  }
  const problem = describeArticleUrlProblem(parsed.data.url);
  if (problem !== null) return errorResponse(400, problem);

  try {
    const { html, url } = await downloadArticleHtml(parsed.data.url.trim(), publicFetch);
    return Response.json(extractArticle(html, url));
  } catch (error) {
    if (error instanceof ArticleFetchError) return errorResponse(error.status, error.message);
    // 想定していない失敗は、理由をサーバーのログに残し、ユーザーには詳細を示さない
    console.error('[fetch-article] 記事の本文の取得に失敗しました:', error);
    return errorResponse(500, '記事の本文の取得に失敗しました。');
  }
}
