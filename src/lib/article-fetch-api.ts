/**
 * 記事の本文の取得 API（POST /api/fetch-article）のリクエスト・応答の形式と、ブラウザから API を呼ぶ処理
 *
 * ブラウザとサーバー（src/app/api/fetch-article/route.ts）の両方で使うため、サーバーだけで使う部品
 * （undici・linkedom・@mozilla/readability など）を読み込まないでください。
 *
 * 取得した本文は、聴取の本文の欄に入れるだけで、保存はしません。ユーザーが確認・修正してから「聴取を保存」で保存します。
 */
import { z } from 'zod';
import { isHttpUrl, isYoutubeUrl } from '@/domain/transcript';

/** 本文の取得 API のリクエストの形式です。URLの中身の検証は describeArticleUrlProblem で行います。 */
export const ArticleFetchRequestSchema = z.object({
  /** 本文を取得する記事のURLです。 */
  url: z.string(),
});

/** 本文の取得 API が返す記事の形式です。 */
export const FetchedArticleSchema = z.object({
  /** 記事の本文です。段落の区切りを改行にしたプレーンテキストです。 */
  text: z.string().min(1),
  /** 記事の題名です。 */
  title: z.string().optional(),
  /** 記事の公開日時です。記事の現地時刻の「1998-08-13T06:30」か、日付だけの「1998-08-13」です。 */
  publishedAt: z.string().optional(),
});

export type FetchedArticle = z.infer<typeof FetchedArticleSchema>;

/** 本文の取得 API が失敗したときに返す本文の形式です。 */
const ErrorResponseSchema = z.object({ error: z.string() });

/**
 * 記事のURLとして本文を取得できない理由を返します。取得してよいURLなら null です。
 * ブラウザでは API を呼ぶ前に、サーバーでは取得する前に、同じ理由で拒否するために共有します。
 */
export function describeArticleUrlProblem(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return '本文を取得する記事のURLを入力してください。';
  if (!isHttpUrl(trimmed)) return `URLは http か https のURLで指定してください: ${trimmed}`;
  if (isYoutubeUrl(trimmed)) {
    return 'YouTube の動画の字幕は取得できません。YouTube の「文字起こしを表示」の内容を、本文の欄に貼り付けてください。';
  }
  return null;
}

/**
 * 本文の取得 API を呼び、記事の本文・題名・公開日時を返します。
 * API が失敗を返した場合と、応答が形式に合わない場合は、理由を示すエラーにします。
 * @param fetcher - テストで通信を置き換えるための fetch です。
 */
export async function requestArticleFetch(url: string, fetcher: typeof fetch = fetch): Promise<FetchedArticle> {
  const response = await fetcher('/api/fetch-article', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsedError = ErrorResponseSchema.safeParse(body);
    throw new Error(parsedError.success ? parsedError.data.error : `記事の本文を取得できませんでした（${response.status}）。`);
  }
  const parsed = FetchedArticleSchema.safeParse(body);
  if (!parsed.success) throw new Error('本文の取得 API の応答が、本文の形式に合いませんでした。');
  return parsed.data;
}
