/**
 * 証言のフォームの、2つ目以降の出典（Claim.sources の2件目から）の入力欄
 *
 * 1つ目の出典は、証言のフォームの「資料（任意）」の欄・「発言者」の経由・引用で編集します（src/components/forms/ClaimForm.tsx）。
 * この欄では、2つ目以降の出典を1件ずつ「出典 2」「出典 3」…の欄にし、資料・経由・引用・引用の位置（秒）を編集します。
 * 「出典を追加」で出典を足し、「出典 N を外す」で外せます。出典の並べ替えはできません（並びは表示の順にしか使わないためです）。
 *
 * 入力の規則（保存時に toClaimSources で確かめます）:
 * - 資料・経由・引用のどれも入力していない行は、無いものとして扱います（「出典を追加」を押しただけの行で保存を止めないためです）。
 * - 1つ目の出典や前の行と同じ資料を選んだ行は、資料の欄の誤りにします（1件の証言が同じ資料を2つの出典で参照しないためです。
 *   src/domain/case-schema.ts）。
 * - 引用は、本文と照らし合わせる原文のため、前後の空白も含めてそのまま保存します。空白だけの引用は、引用なしとして扱います。
 * - 引用の位置（秒）は、引用がある行でだけ入力でき、0以上の整数だけを受け付けます。空なら秒数を持たせません。
 * 発言者を選ばずに経由だけを指定した場合の誤りは、1つ目の出典の経由とあわせて、証言のフォームで確かめます。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId } from 'react';
import type { ClaimSource, Id } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { FormError, INPUT_CLASS, LABEL_CLASS, TextField } from './fields';
import { PersonChecklist, type SpeakerPersonOption } from './SpeakerPicker';

/**
 * 入力中の出典1件です。key は、行を消しても入力欄が混ざらないよう、行ごとに振る値です。
 * 資料を選んでいない場合の interviewId と、未入力の引用・秒数は、空の文字列です。
 */
export type SourceRow = { key: string; interviewId: Id | ''; viaPersonIds: Id[]; quoteText: string; quoteSeconds: string };

/** 行ごと（行の key ごと）の、欄の誤りの理由です。誤りの無い行は含めません。 */
export type SourceRowErrors = Record<string, { interview?: string; seconds?: string }>;

/** 資料を選ばない場合の、選択肢の値です。 */
const NO_INTERVIEW = '';

/** 引用の位置（秒）として受け付ける表記です（0以上の整数）。 */
const SECONDS_PATTERN = /^\d+$/;

const DUPLICATE_INTERVIEW_MESSAGE = 'この資料は、前の出典ですでに選んでいます。別の資料を選ぶか、この出典を外してください';
const INVALID_SECONDS_MESSAGE = '引用の位置は、0以上の整数の秒数で入力してください';

/** 空の行です。「出典を追加」で足します。 */
function emptyRow(): SourceRow {
  return { key: nanoid(), interviewId: NO_INTERVIEW, viaPersonIds: [], quoteText: '', quoteSeconds: '' };
}

/** 保存済みの出典を、入力中の行にします。 */
export function toSourceRows(sources: ClaimSource[]): SourceRow[] {
  return sources.map((source) => ({
    key: nanoid(),
    interviewId: source.interviewId ?? NO_INTERVIEW,
    viaPersonIds: source.viaPersonIds,
    quoteText: source.quote?.text ?? '',
    quoteSeconds: source.quote?.seconds === undefined ? '' : String(source.quote.seconds),
  }));
}

/**
 * 入力中の行を、保存する出典にします。誤りのある欄がある場合は、行ごとの理由を errors で返します。
 * primaryInterviewId は、1つ目の出典で選んでいる資料です（選んでいない場合は undefined）。
 */
export function toClaimSources(rows: SourceRow[], primaryInterviewId: Id | undefined): { sources: ClaimSource[] } | { errors: SourceRowErrors } {
  const sources: ClaimSource[] = [];
  const errors: SourceRowErrors = {};
  /** 前の出典で選んだ資料です。同じ資料を選んだ行を見つけるために使います。 */
  const takenInterviewIds = new Set<Id>(primaryInterviewId === undefined ? [] : [primaryInterviewId]);

  for (const row of rows) {
    const hasQuote = row.quoteText.trim() !== '';
    if (row.interviewId === NO_INTERVIEW && row.viaPersonIds.length === 0 && !hasQuote) continue;

    const rowErrors: SourceRowErrors[string] = {};
    if (row.interviewId !== NO_INTERVIEW) {
      if (takenInterviewIds.has(row.interviewId)) rowErrors.interview = DUPLICATE_INTERVIEW_MESSAGE;
      takenInterviewIds.add(row.interviewId);
    }
    const seconds = row.quoteSeconds.trim();
    if (hasQuote && seconds !== '' && !SECONDS_PATTERN.test(seconds)) rowErrors.seconds = INVALID_SECONDS_MESSAGE;
    if (rowErrors.interview !== undefined || rowErrors.seconds !== undefined) {
      errors[row.key] = rowErrors;
      continue;
    }

    // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    sources.push({
      ...(row.interviewId !== NO_INTERVIEW && { interviewId: row.interviewId }),
      viaPersonIds: row.viaPersonIds,
      ...(hasQuote && { quote: { text: row.quoteText, ...(seconds !== '' && { seconds: Number(seconds) }) } }),
    });
  }
  return Object.keys(errors).length > 0 ? { errors } : { sources };
}

type OtherClaimSourcesFieldProps = {
  rows: SourceRow[];
  onChange: (rows: SourceRow[]) => void;
  /** 直前の保存で見つかった、欄の誤りの理由です。 */
  errors: SourceRowErrors;
  /** 資料の選択肢です（label は資料の表示名）。 */
  interviewOptions: { id: Id; label: string }[];
  /** 経由として選べる人物です（証言のフォームで新規作成した、保存前の人物を含みます）。 */
  persons: SpeakerPersonOption[];
  /** 未登録の名前から人物を新規作成し、その人物を返します。 */
  onCreatePerson: (name: string) => SpeakerPersonOption;
};

export function OtherClaimSourcesField({ rows, onChange, errors, interviewOptions, persons, onCreatePerson }: OtherClaimSourcesFieldProps) {
  const fieldId = useId();
  const update = (key: string, patch: Partial<SourceRow>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        // 1つ目の出典は資料の欄と「発言者」で編集するため、この欄の行は「出典 2」から数える
        const legend = `出典 ${index + 2}`;
        const rowErrors = errors[row.key] ?? {};
        const interviewFieldId = `${fieldId}-${row.key}-interview`;
        const secondsFieldId = `${fieldId}-${row.key}-seconds`;
        return (
          <fieldset key={row.key} className="space-y-2 rounded-md border p-2">
            <legend className="px-1 text-xs font-medium text-muted-foreground">{legend}</legend>
            <div>
              <label htmlFor={interviewFieldId} className={LABEL_CLASS}>
                資料
              </label>
              <select
                id={interviewFieldId}
                value={row.interviewId}
                onChange={(event) => update(row.key, { interviewId: event.target.value })}
                aria-invalid={rowErrors.interview !== undefined || undefined}
                aria-describedby={rowErrors.interview === undefined ? undefined : `${interviewFieldId}-error`}
                className={INPUT_CLASS}
              >
                <option value={NO_INTERVIEW}>資料なし</option>
                {interviewOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FormError id={`${interviewFieldId}-error`} message={rowErrors.interview ?? null} />
            </div>
            <PersonChecklist
              legend="経由"
              description="この資料で、発言者の話を伝えた人物や媒体です。伝えた順に選びます（例: 県警 → 新聞）。"
              selectedIds={row.viaPersonIds}
              onChange={(viaPersonIds) => update(row.key, { viaPersonIds })}
              persons={persons}
              onCreatePerson={onCreatePerson}
            />
            <TextField
              label="引用"
              multiline
              value={row.quoteText}
              onChange={(quoteText) => update(row.key, { quoteText })}
              placeholder="資料の本文から引いた原文（任意）"
            />
            {row.quoteText.trim() !== '' && (
              <div>
                <label htmlFor={secondsFieldId} className={LABEL_CLASS}>
                  引用の位置（秒）
                </label>
                <input
                  id={secondsFieldId}
                  type="text"
                  inputMode="numeric"
                  value={row.quoteSeconds}
                  onChange={(event) => update(row.key, { quoteSeconds: event.target.value })}
                  placeholder="動画の何秒目か（任意）"
                  aria-invalid={rowErrors.seconds !== undefined || undefined}
                  aria-describedby={rowErrors.seconds === undefined ? undefined : `${secondsFieldId}-error`}
                  className={INPUT_CLASS}
                />
                <FormError id={`${secondsFieldId}-error`} message={rowErrors.seconds ?? null} />
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.filter((item) => item.key !== row.key))}>
                {`${legend} を外す`}
              </Button>
            </div>
          </fieldset>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyRow()])}>
        出典を追加
      </Button>
    </div>
  );
}
