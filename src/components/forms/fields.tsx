/**
 * 入力フォームで共有する部品（テキスト欄・エラー表示・保存ボタン）
 *
 * 画像欄は ImageField.tsx、座標欄は CoordinateField.tsx にあります。
 */
'use client';

import { useId } from 'react';

export const INPUT_CLASS =
  'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none';
export const LABEL_CLASS = 'mb-1 block text-xs font-medium text-slate-600';

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
