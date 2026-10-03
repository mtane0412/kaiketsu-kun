/**
 * LLM の設定（OpenRouter の API キーとモデル）の保存と読み込み
 *
 * 証言の候補の抽出（src/components/ClaimExtraction.tsx）で使う設定を、ブラウザの LocalStorage に保存します。
 * API キーはサーバーに保存せず、抽出のリクエストごとにサーバーへ送ります（src/lib/claim-extraction-api.ts）。
 *
 * 注意: LocalStorage の値は、同じブラウザでこのアプリを開く人なら誰でも読めます。共用の端末では API キーを保存しないでください。
 * ケースの JSON の書き出しには含めません（ケースとは別のキーに保存するためです）。
 */
import { z } from 'zod';

/** LLM の設定を保存する LocalStorage のキーです。 */
export const LLM_SETTINGS_STORAGE_KEY = 'testimony-board-llm-settings';

/** モデルを選んでいない場合に使う、OpenRouter のモデルのIDです。 */
export const DEFAULT_LLM_MODEL = 'anthropic/claude-sonnet-5.5';

const LlmSettingsSchema = z.object({
  /** OpenRouter の API キーです。入力していない場合は空文字列です。 */
  apiKey: z.string(),
  /** OpenRouter のモデルのIDです。 */
  model: z.string(),
});

export type LlmSettings = z.infer<typeof LlmSettingsSchema>;

/**
 * 保存済みの LLM の設定を読み込みます。保存していない場合は、API キーを空、モデルを既定のモデルにします。
 * 保存済みの値が形式に合わない場合は、黙って既定値に戻さず、理由を示すエラーにします。
 */
export function loadLlmSettings(): LlmSettings {
  const stored = localStorage.getItem(LLM_SETTINGS_STORAGE_KEY);
  if (stored === null) return { apiKey: '', model: DEFAULT_LLM_MODEL };

  let data: unknown;
  try {
    data = JSON.parse(stored);
  } catch (error) {
    throw new Error('保存済みの LLM の設定を JSON として読めませんでした。', { cause: error });
  }
  const parsed = LlmSettingsSchema.safeParse(data);
  if (!parsed.success) throw new Error('保存済みの LLM の設定が、API キーとモデルの形式に合いません。');
  return parsed.data;
}

/** LLM の設定を保存します。 */
export function saveLlmSettings(settings: LlmSettings): void {
  localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
