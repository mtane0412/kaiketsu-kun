/**
 * 証言の候補の抽出 API（POST /api/extract-claims）のリクエストの形式と、ブラウザから API を呼ぶ処理
 *
 * ブラウザとサーバー（src/app/api/extract-claims/route.ts）の両方で使うため、サーバーだけで使う部品（AI SDK など）を読み込まないでください。
 *
 * LLM は、ユーザーが入力した OpenRouter の API キーで呼びます。サーバーはキーを保存せず、リクエストごとに OpenRouter へ中継するだけです。
 * デプロイ先のキーで呼ぶと、誰でも呼べる API の費用がデプロイ先にかかるためです。
 */
import { z } from 'zod';
import { ExtractionResultSchema, type ExtractedClaim } from '@/domain/claim-extraction';

/**
 * 1回の抽出で LLM に送る本文の上限の文字数です。
 * 1時間の動画の文字起こしのような長い本文は、モデルの入力の上限や時間切れに近づくため、範囲を選んで送ってもらいます。
 */
export const MAX_EXTRACTION_TEXT_LENGTH = 20_000;

/** プロンプトに含める、登録済みの人物・場所の名前の上限の件数です（プロンプトが長くなりすぎないようにするため）。 */
export const MAX_EXTRACTION_NAMES = 500;

/** プロンプトに含める名前1件の上限の文字数です。 */
const MAX_NAME_LENGTH = 200;

/** 空白だけではない文字列です。 */
const nonBlank = z.string().refine((value) => value.trim() !== '');

const names = z.array(z.string().max(MAX_NAME_LENGTH)).max(MAX_EXTRACTION_NAMES);

/** 抽出 API のリクエストの形式です。 */
export const ExtractionRequestSchema = z.object({
  /** 証言の候補を抽出する本文（聴取の本文の全文か、選んだ範囲）です。 */
  text: nonBlank.pipe(z.string().max(MAX_EXTRACTION_TEXT_LENGTH)),
  /** 聴取の相手の名前です。発言者の分からない記述を、聴取の相手の記述として扱うよう LLM に伝えます。 */
  subjectName: z.string().max(MAX_NAME_LENGTH),
  /** 登録済みの人物の名前と別名です。LLM に同じ表記を使うよう促します。 */
  personNames: names,
  /** 登録済みの場所の名前です。 */
  placeNames: names,
  /** OpenRouter の API キーです。 */
  apiKey: nonBlank,
  /** OpenRouter のモデルのID（例「anthropic/claude-sonnet-5」）です。 */
  model: nonBlank,
});

export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;

/** 抽出 API が失敗したときに返す本文の形式です。 */
const ErrorResponseSchema = z.object({ error: z.string() });

/**
 * 抽出 API を呼び、LLM が出した証言の候補（原文とまだ照らし合わせていないもの）を返します。
 * API が失敗を返した場合と、応答が形式に合わない場合は、理由を示すエラーにします。
 * @param fetcher - テストで通信を置き換えるための fetch です。
 */
export async function requestClaimExtraction(request: ExtractionRequest, fetcher: typeof fetch = fetch): Promise<ExtractedClaim[]> {
  const response = await fetcher('/api/extract-claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const parsedError = ErrorResponseSchema.safeParse(body);
    throw new Error(parsedError.success ? parsedError.data.error : `証言の候補の抽出に失敗しました（${response.status}）。`);
  }
  const parsed = ExtractionResultSchema.safeParse(body);
  if (!parsed.success) throw new Error('抽出 API の応答が、証言の候補の形式に合いませんでした。');
  return parsed.data.claims;
}
