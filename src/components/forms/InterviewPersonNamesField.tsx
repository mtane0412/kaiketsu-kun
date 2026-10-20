/**
 * 資料のフォームの「この資料での呼び方」の入力欄
 *
 * 資料の中での人物の呼び方（「男」「Aさん」など）と、それが指す人物を、1行ずつ登録します（Interview.personNames）。
 * 同一人物とした根拠と、確認した人も任意で残せます。呼び方の対応は読み手の判断のため、後から確かめ直せるようにするためです。
 *
 * 入力の規則（保存時に toInterviewPersonNames で確かめます）:
 * - 呼び方も人物も空の行は、無いものとして扱います（「呼び方を追加」を押しただけの行で保存を止めないためです）。
 * - 呼び方だけ・人物だけの行は、エラーにして保存しません。
 * - 呼び方・根拠・確認した人は前後の空白を除き、空の根拠・確認した人は持たせません。
 * - 同じ呼び方を2回以上登録した場合は、保存時のケースの検証（src/domain/case-schema.ts）でエラーになります。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId } from 'react';
import type { Id, InterviewPersonName, Person } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { INPUT_CLASS, LABEL_CLASS, TextField } from './fields';

/** 入力中の呼び方1行です。key は、行を並べ替えずに削除しても入力欄が混ざらないよう、行ごとに振る値です。 */
export type PersonNameRow = { key: string; name: string; personId: Id; basis: string; confirmedBy: string };

/** 人物を選んでいない場合の、選択肢の値です。 */
const UNSELECTED = '';

/** 保存済みの呼び方を、入力中の行にします。 */
export function toPersonNameRows(personNames: InterviewPersonName[] | undefined): PersonNameRow[] {
  return (personNames ?? []).map((personName) => ({
    key: nanoid(),
    name: personName.name,
    personId: personName.personId,
    basis: personName.basis ?? '',
    confirmedBy: personName.confirmedBy ?? '',
  }));
}

/** 入力中の行を、保存する呼び方にします。呼び方だけ・人物だけの行がある場合は、理由を error で返します。 */
export function toInterviewPersonNames(rows: PersonNameRow[]): { personNames: InterviewPersonName[] } | { error: string } {
  const personNames: InterviewPersonName[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (name === '' && row.personId === UNSELECTED) continue;
    if (name === '') return { error: '人物を選んだ行の、呼び方を入力してください' };
    if (row.personId === UNSELECTED) return { error: `呼び方「${name}」が指す人物を選んでください` };
    const personName: InterviewPersonName = { name, personId: row.personId };
    if (row.basis.trim()) personName.basis = row.basis.trim();
    if (row.confirmedBy.trim()) personName.confirmedBy = row.confirmedBy.trim();
    personNames.push(personName);
  }
  return { personNames };
}

type InterviewPersonNamesFieldProps = {
  rows: PersonNameRow[];
  onChange: (rows: PersonNameRow[]) => void;
  /** 呼び方が指す人物の選択肢です。 */
  persons: Person[];
};

export function InterviewPersonNamesField({ rows, onChange, persons }: InterviewPersonNamesFieldProps) {
  const fieldId = useId();
  const update = (key: string, patch: Partial<PersonNameRow>) => onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-xs text-muted-foreground">この資料での呼び方</legend>
      <p className="text-xs text-muted-foreground">
        資料が人物を「男」「Aさん」のように呼んでいる場合に、それが誰かを登録します。証言の抽出では、人物の名前・別名より優先して照らし合わせます。
      </p>
      {rows.map((row, index) => {
        const number = index + 1;
        return (
          <div key={row.key} className="space-y-2 rounded-md border border-dashed p-2">
            <TextField label={`呼び方 ${number}`} value={row.name} onChange={(name) => update(row.key, { name })} placeholder="男、Aさん、村内の男性 など" />
            <div>
              <label htmlFor={`${fieldId}-${row.key}-person`} className={LABEL_CLASS}>
                {`呼び方 ${number} が指す人物`}
              </label>
              <select
                id={`${fieldId}-${row.key}-person`}
                value={row.personId}
                onChange={(event) => update(row.key, { personId: event.target.value })}
                className={INPUT_CLASS}
              >
                <option value={UNSELECTED}>選んでください</option>
                {persons.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label={`同一人物とした根拠 ${number}（任意）`}
              value={row.basis}
              onChange={(basis) => update(row.key, { basis })}
              placeholder="年齢と勤務先が一致する など"
            />
            <TextField label={`確認した人 ${number}（任意）`} value={row.confirmedBy} onChange={(confirmedBy) => update(row.key, { confirmedBy })} />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(rows.filter((item) => item.key !== row.key))}>
                {`呼び方 ${number} を削除`}
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { key: nanoid(), name: '', personId: UNSELECTED, basis: '', confirmedBy: '' }])}
      >
        呼び方を追加
      </Button>
    </fieldset>
  );
}
