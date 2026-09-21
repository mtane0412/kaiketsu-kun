/**
 * 入力フォームで共有する部品（テキスト欄・画像欄・時刻入力欄・エラー表示・保存ボタン）
 */
'use client';

import { useId, useState, type ChangeEvent } from 'react';
import type { TimeRefDraft } from '@/domain/time-ref-draft';
import { fileToResizedDataUrl } from '@/lib/image-utils';

const INPUT_CLASS =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none';
const LABEL_CLASS = 'mb-1 block text-xs font-medium text-slate-600';

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
};

/** ラベル付きのテキスト入力欄です。multiline を指定すると複数行の入力欄になります。 */
export function TextField({ label, value, onChange, required, multiline, placeholder }: TextFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={INPUT_CLASS}
          rows={3}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          type="text"
          className={INPUT_CLASS}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

type ImageFieldProps = {
  label: string;
  /** 登録する画像（縮小済みの data URL）です。画像が無い場合は undefined です。 */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
};

/**
 * ラベル付きの画像の入力欄です。
 * 選んだ画像ファイルは縮小した data URL にして onChange に渡し、プレビューを表示します。
 * 画像として読み込めないファイルの場合は、理由を欄の下に表示し、値を変えません。
 */
export function ImageField({ label, value, onChange }: ImageFieldProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change イベントが発生するようにする
    event.target.value = '';
    if (!file) return;
    try {
      onChange(await fileToResizedDataUrl(file));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        {value && <img src={value} alt="登録する画像" className="h-16 w-16 shrink-0 rounded border border-slate-200 object-cover" />}
        <input id={id} type="file" accept="image/*" onChange={handleSelect} className="min-w-0 text-xs text-slate-600" />
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="shrink-0 text-xs text-red-600 hover:underline">
            画像を削除
          </button>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}

type TimeRefInputProps = {
  legend: string;
  value: TimeRefDraft;
  onChange: (value: TimeRefDraft) => void;
};

const TIME_REF_FIELDS: { key: keyof TimeRefDraft; label: string; placeholder: string }[] = [
  { key: 'text', label: '表記', placeholder: '資料の通りに（例: 1995年7月頃、第3話）' },
  { key: 'earliest', label: '最も早い時点', placeholder: '1995-06' },
  { key: 'latest', label: '最も遅い時点', placeholder: '1995-08（省略可）' },
  { key: 'order', label: '並び順', placeholder: '日時が無い場合の順序（例: 3）' },
];

/**
 * 曖昧さを許す時刻の入力欄です。
 * 各欄のアクセシブルな名前は「{legend}：{欄の名前}」の形式です。
 */
export function TimeRefInput({ legend, value, onChange }: TimeRefInputProps) {
  return (
    <fieldset className="rounded border border-slate-200 p-2">
      <legend className="px-1 text-xs font-medium text-slate-600">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {TIME_REF_FIELDS.map((field) => (
          <label key={field.key} className="block text-[11px] text-slate-500">
            {field.label}
            <input
              type="text"
              aria-label={`${legend}：${field.label}`}
              className={INPUT_CLASS}
              value={value[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** フォームのエラー表示です。エラーが無い場合は何も表示しません。 */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="whitespace-pre-line rounded bg-red-50 px-2 py-1.5 text-sm text-red-700">
      {message}
    </p>
  );
}

/** フォームの保存ボタンです。 */
export function SubmitButton({ label }: { label: string }) {
  return (
    <button type="submit" className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
      {label}
    </button>
  );
}
