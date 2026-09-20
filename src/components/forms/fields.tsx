/**
 * 入力フォームで共有する部品（テキスト欄・選択欄・時刻入力欄・エラー表示・保存ボタン）
 */
'use client';

import { useId } from 'react';
import type { TimeRefDraft } from '@/domain/time-ref-draft';

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

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

/** ラベル付きの選択欄です。 */
export function SelectField({ label, value, onChange, options }: SelectFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <select id={id} className={INPUT_CLASS} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
