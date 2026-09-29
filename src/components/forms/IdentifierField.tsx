/**
 * 人物の識別子（電話番号・車両ナンバーなど）の入力欄
 *
 * 識別子を1行に1つ、種類と値の組で入力します。「識別子を追加」で行を増やし、各行の「削除」で行を取り除きます。
 * 種類は任意の文字列です。よく使う種類（電話番号・車両ナンバーなど）を入力候補に示します。
 *
 * 注意: 種類と値の両方が空の行は、保存時に取り除きます（rowsToIdentifiers）。
 * 片方だけが空の行は取り除かずに保存を試み、ケースの検証（src/domain/case-schema.ts）で理由を示して拒否します。
 * 入力途中の行を黙って捨てると、入力した値が失われたことに気づけないためです。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId } from 'react';
import type { PersonIdentifier } from '@/domain/types';
import { cn } from '@/lib/utils';
import { INPUT_CLASS, LABEL_CLASS } from './fields';

/** 識別子の種類の入力候補です。 */
const IDENTIFIER_TYPE_SUGGESTIONS = ['電話番号', '車両ナンバー', '口座番号', 'メールアドレス'];

/** 行の追加・削除に使う小さなボタンの見た目です。 */
const ROW_BUTTON_CLASS = 'shrink-0 rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted/40';

/** 入力中の識別子の1行です。key は React の一覧の描画にだけ使い、保存しません。 */
export type IdentifierRow = { key: string; type: string; value: string };

/** 登録済みの識別子を、入力欄の行にします。 */
export function identifiersToRows(identifiers: PersonIdentifier[] | undefined): IdentifierRow[] {
  return (identifiers ?? []).map((identifier) => ({ key: nanoid(), ...identifier }));
}

/** 入力欄の行を、保存する識別子にします。前後の空白を除き、種類と値の両方が空の行は取り除きます。 */
export function rowsToIdentifiers(rows: IdentifierRow[]): PersonIdentifier[] {
  return rows
    .map((row) => ({ type: row.type.trim(), value: row.value.trim() }))
    .filter((identifier) => identifier.type !== '' || identifier.value !== '');
}

type IdentifierFieldProps = {
  rows: IdentifierRow[];
  onChange: (rows: IdentifierRow[]) => void;
};

export function IdentifierField({ rows, onChange }: IdentifierFieldProps) {
  const suggestionListId = useId();

  const updateRow = (key: string, change: Partial<Pick<IdentifierRow, 'type' | 'value'>>) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  return (
    <fieldset className="space-y-2">
      <legend className={LABEL_CLASS}>識別子（電話番号・車両ナンバーなど）</legend>
      <datalist id={suggestionListId}>
        {IDENTIFIER_TYPE_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      {rows.map((row, index) => (
        <div key={row.key} className="flex items-center gap-2">
          <input
            aria-label={`識別子${index + 1}の種類`}
            list={suggestionListId}
            value={row.type}
            onChange={(event) => updateRow(row.key, { type: event.target.value })}
            placeholder="種類"
            className={cn(INPUT_CLASS, 'w-32 shrink-0')}
          />
          <input
            aria-label={`識別子${index + 1}の値`}
            value={row.value}
            onChange={(event) => updateRow(row.key, { value: event.target.value })}
            placeholder="値"
            className={cn(INPUT_CLASS, 'min-w-0 flex-1')}
          />
          <button
            type="button"
            aria-label={`識別子${index + 1}を削除`}
            onClick={() => onChange(rows.filter((candidate) => candidate.key !== row.key))}
            className={ROW_BUTTON_CLASS}
          >
            削除
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { key: nanoid(), type: '', value: '' }])}
        className={ROW_BUTTON_CLASS}
      >
        識別子を追加
      </button>
    </fieldset>
  );
}
