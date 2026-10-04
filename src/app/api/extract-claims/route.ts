/**
 * 証言の候補の抽出 API
 *
 * POST /api/extract-claims
 * - リクエスト: src/lib/claim-extraction-api.ts の ExtractionRequestSchema（本文・資料の名前・登録済みの名前・API キー・モデル）
 * - 200: { claims: ExtractedClaim[] }（原文とまだ照らし合わせていない、LLM の出力そのもの）
 * - 400: リクエストが形式に合わない
 * - 401: OpenRouter が API キーを受け付けなかった
 * - 502: LLM の呼び出しに失敗したか、出力が形式に合わなかった
 * - 504: LLM の応答が時間内に返らなかった
 * 失敗の応答は { error: ユーザーに示す理由 } です。
 *
 * LLM は、リクエストに含まれる OpenRouter の API キーで呼びます。キーは保存せず、ログにも残しません。
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ExtractionRequestSchema } from '@/lib/claim-extraction-api';
import { describeExtractionError, extractClaims } from '@/lib/claim-extraction-llm';

/** 実行時間の上限（秒）です。LLM の時間切れ（EXTRACTION_TIMEOUT_MS）より長くし、時間切れの理由を返せるようにします。 */
export const maxDuration = 150;

/** 失敗の応答を作ります。 */
function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, 'リクエストの本文を JSON として読めませんでした。');
  }

  const parsed = ExtractionRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join('、');
    return errorResponse(400, `リクエストの形式が正しくありません（${fields}）。`);
  }

  const { apiKey, model } = parsed.data;
  try {
    const claims = await extractClaims(createOpenRouter({ apiKey }).chat(model), parsed.data);
    return Response.json({ claims });
  } catch (error) {
    try {
      const { status, message } = describeExtractionError(error);
      return errorResponse(status, message);
    } catch {
      // 想定していない失敗は、理由をサーバーのログに残し、ユーザーには詳細を示さない（API キーを含めないよう、エラーだけを記録する）
      console.error('[extract-claims] 証言の候補の抽出に失敗しました:', error);
      return errorResponse(500, '証言の候補の抽出に失敗しました。');
    }
  }
}
