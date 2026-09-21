/**
 * 入力フォームで共有する部品（テキスト欄・エラー表示・保存ボタン）
 *
 * 見た目は shadcn/ui（Input・Label・Textarea・Button）に合わせ、配色は globals.css のトークンを使います。
 * INPUT_CLASS・LABEL_CLASS は、shadcn/ui の部品をそのまま使えない場所（メンションを書ける入力欄の重ね描き、
 * 座標欄の中の小さな入力欄）で、見た目をそろえるために公開しています。
 *
 * 画像欄は ImageField.tsx、座標欄は CoordinateField.tsx にあります。
 */
'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** shadcn/ui の Input と見た目をそろえるためのクラスです。 */
export const INPUT_CLASS =
  'w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';
export const LABEL_CLASS = 'mb-1 block text-xs font-medium text-muted-foreground';

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
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          rows={3}
          value={value}
          required={required}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type="text"
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
    <p
      role="alert"
      className="whitespace-pre-line rounded-md bg-destructive/10 px-2 py-1.5 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/** フォームの保存ボタンです。 */
export function SubmitButton({ label }: { label: string }) {
  return (
    <Button type="submit" size="sm">
      {label}
    </Button>
  );
}
