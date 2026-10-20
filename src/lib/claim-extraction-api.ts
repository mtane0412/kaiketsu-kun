/**
 * 証言の候補の抽出 API（POST /api/extract-claims）のリクエストの形式と、ブラウザから API を呼ぶ処理
 *
 * ブラウザとサーバー（src/app/api/extract-claims/route.ts）の両方で使うため、サーバーだけで使う部品（AI SDK など）を読み込まないでください。
 *
 * LLM は、ユーザーが入力した OpenRouter の API キーで呼びます。サーバーはキーを保存せず、リクエストごとに OpenRouter へ中継するだけです。
 * デプロイ先のキーで呼ぶと、誰でも呼べる API の費用がデプロイ先にかかるためです。
 */
import { z } from 'zod';
import {
  ExtractionResultSchema,
  MAX_EXISTING_CLAIM_SUMMARY_LENGTH,
  MAX_EXISTING_CLAIMS_FOR_EXTRACTION,
  type ExtractedClaim,
} from '@/domain/claim-extraction';
import { normalizeName } from '@/domain/person-names';

/**
 * 1回の抽出で LLM に送る本文の上限の文字数です。
 * 1時間の動画の文字起こしのような長い本文は、モデルの入力の上限や時間切れに近づくため、範囲を選んで送ってもらいます。
 */
export const MAX_EXTRACTION_TEXT_LENGTH = 20_000;

/** プロンプトに含める、登録済みの人物・場所の名前の上限の件数です（プロンプトが長くなりすぎないようにするため）。 */
export const MAX_EXTRACTION_NAMES = 500;

/** プロンプトに含める名前1件の上限の文字数です。 */
const MAX_NAME_LENGTH = 200;

/** プロンプトに含める資料の名前の上限の文字数です。資料の名前は、タイトルやURLを含むため、人物・場所の名前より長くとります。 */
export const MAX_SOURCE_NAME_LENGTH = 500;

/** 名前を本文から探すために、空白を除いて小文字にします（「山田 花子」と本文の「山田花子」を同じとみなすため）。 */
function compactForSearch(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase();
}

/**
 * プロンプトに含める名前を、上限の件数（MAX_EXTRACTION_NAMES）に収まるように選びます。
 *
 * - 正規化して同じになる名前は1つにまとめます。
 * - 上限を超える場合は、preferred（この資料での呼び方など）→ 本文 text に出てくる名前 → それ以外 の順に優先します。
 * - 上限の文字数を超える長い名前は送りません。
 *
 * 送らなかった名前の件数を omittedCount で返します。呼び出し側は、送る前の確認でこの件数を示してください
 * （名前は LLM に表記を揃えさせる手がかりで、送らなくても抽出の結果はケースの全員と照らし合わせますが、黙って減らさないためです）。
 */
export function selectExtractionNames(text: string, preferred: string[], others: string[]): { names: string[]; omittedCount: number } {
  const compactText = compactForSearch(text);
  const appearsInText = (name: string) => compactText.includes(compactForSearch(name));
  const ordered = [...preferred, ...others.filter(appearsInText), ...others.filter((name) => !appearsInText(name))];

  const seen = new Set<string>();
  const unique = ordered.filter((name) => {
    const key = normalizeName(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const sendable = unique.filter((name) => name.length <= MAX_NAME_LENGTH);
  const names = sendable.slice(0, MAX_EXTRACTION_NAMES);
  return { names, omittedCount: unique.length - names.length };
}

/** 空白だけではない文字列です。 */
const nonBlank = z.string().refine((value) => value.trim() !== '');

const names = z.array(z.string().max(MAX_NAME_LENGTH)).max(MAX_EXTRACTION_NAMES);

/** 抽出 API のリクエストの形式です。 */
export const ExtractionRequestSchema = z.object({
  /** 証言の候補を抽出する本文（聴取の本文の全文か、選んだ範囲）です。 */
  text: nonBlank.pipe(z.string().max(MAX_EXTRACTION_TEXT_LENGTH)),
  /** 資料の名前（タイトル・日時・媒体。src/domain/interviews.ts の formatInterviewLabel）です。本文がどの資料のものかを LLM に伝えます。 */
  sourceName: z.string().max(MAX_SOURCE_NAME_LENGTH),
  /** 登録済みの人物の名前と別名です。LLM に同じ表記を使うよう促します。 */
  personNames: names,
  /** 登録済みの場所の名前です。 */
  placeNames: names,
  /**
   * LLM に「同じ事柄を述べていそうな証言」を探させる、既存の証言のIDと要約です
   * （src/domain/claim-extraction.ts の selectExistingClaimsForExtraction）。
   * 要約は、上限の文字数で切ったうえで省略の「…」を付けるため、上限より1文字長いものまで受け付けます。
   */
  existingClaims: z
    .array(z.object({ id: z.string().min(1).max(MAX_NAME_LENGTH), summary: z.string().max(MAX_EXISTING_CLAIM_SUMMARY_LENGTH + 1) }))
    .max(MAX_EXISTING_CLAIMS_FOR_EXTRACTION),
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
