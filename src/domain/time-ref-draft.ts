/**
 * 時刻入力欄の入力値（文字列）と TimeRef の相互変換
 *
 * 入力フォームは4つの欄（表記・最も早い時点・最も遅い時点・並び順）を文字列のまま保持し、
 * 保存時にこのファイルの関数で検証して TimeRef に変換します。
 */
import { isValidPartialIso, toInterval } from './time-ref';
import type { TimeRef } from './types';

/** 時刻入力欄の入力値です。 */
export type TimeRefDraft = {
  text: string;
  earliest: string;
  latest: string;
  order: string;
};

/** 変換の結果です。失敗した場合は、入力者に示すエラー文を持ちます。 */
export type TimeRefDraftResult = { ok: true; value: TimeRef | undefined } | { ok: false; error: string };

/** すべて空欄の入力値です。 */
export const EMPTY_TIME_REF_DRAFT: TimeRefDraft = { text: '', earliest: '', latest: '', order: '' };

const FORMAT_EXAMPLES = '1998 / 1998-08 / 1998-08-12 / 1998-08-12T19:00';

/**
 * 入力値を検証し、TimeRef に変換します。
 * すべて空欄の場合は、時刻参照なし（undefined）として扱います。
 */
export function draftToTimeRef(draft: TimeRefDraft): TimeRefDraftResult {
  const text = draft.text.trim();
  const earliest = draft.earliest.trim();
  const latest = draft.latest.trim();
  const orderText = draft.order.trim();

  if (!text && !earliest && !latest && !orderText) {
    return { ok: true, value: undefined };
  }
  if (earliest && !isValidPartialIso(earliest)) {
    return { ok: false, error: `「最も早い時点」は ${FORMAT_EXAMPLES} のいずれかの形式で入力してください` };
  }
  if (latest && !isValidPartialIso(latest)) {
    return { ok: false, error: `「最も遅い時点」は ${FORMAT_EXAMPLES} のいずれかの形式で入力してください` };
  }
  if (latest && !earliest) {
    return { ok: false, error: '「最も遅い時点」を入力する場合は「最も早い時点」も入力してください' };
  }
  const order = orderText ? Number(orderText) : undefined;
  if (order !== undefined && !Number.isFinite(order)) {
    return { ok: false, error: '「並び順」は数値で入力してください' };
  }

  const value: TimeRef = { text: text || earliest || `並び順 ${orderText}` };
  if (earliest) value.earliest = earliest;
  if (latest) value.latest = latest;
  if (order !== undefined) value.order = order;

  try {
    toInterval(value);
  } catch {
    // 表記の妥当性は検証済みのため、ここで失敗する原因は区間の逆転だけである
    return { ok: false, error: '「最も遅い時点」は「最も早い時点」以降にしてください' };
  }
  return { ok: true, value };
}

/** TimeRef を入力欄の値に戻します。編集フォームの初期値に使用します。 */
export function timeRefToDraft(ref: TimeRef | undefined): TimeRefDraft {
  if (!ref) return EMPTY_TIME_REF_DRAFT;
  return {
    text: ref.text,
    earliest: ref.earliest ?? '',
    latest: ref.latest ?? '',
    order: ref.order === undefined ? '' : String(ref.order),
  };
}
