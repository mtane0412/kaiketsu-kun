/**
 * 表示する人物の種別を選ぶチェックボックス
 *
 * グラフビューと人物の動きビューで、人物の種別（人物・組織・記録・媒体・物）による絞り込みに使います。
 * 各チェックボックスには種別の色の見本を添え、図や表の色の凡例を兼ねます。
 *
 * 状態は持たず、いま表示している種別と、変更を伝える関数を受け取ります。
 */
'use client';

import { useId } from 'react';
import { PERSON_KIND_LABELS } from '@/domain/labels';
import { PERSON_KINDS } from '@/domain/person-kind';
import type { PersonKind } from '@/domain/types';
import { PERSON_KIND_STYLES, personKindShapeOf } from '../person-kind-style';

type PersonKindFilterProps = {
  /** いま表示している種別です。 */
  value: ReadonlySet<PersonKind>;
  onChange: (value: ReadonlySet<PersonKind>) => void;
  /** true の場合は、すべてのチェックボックスを操作できなくします（グラフで人物そのものを隠している間など）。 */
  disabled?: boolean;
};

export function PersonKindFilter({ value, onChange, disabled = false }: PersonKindFilterProps) {
  const idPrefix = useId();

  const toggle = (kind: PersonKind, checked: boolean) => {
    const next = new Set(value);
    if (checked) next.add(kind);
    else next.delete(kind);
    onChange(next);
  };

  return (
    <fieldset aria-label="表示する人物の種別" disabled={disabled} className="flex flex-wrap items-center gap-x-4 text-xs disabled:opacity-50">
      <legend className="float-left mr-3 font-medium text-foreground">種別</legend>
      {PERSON_KINDS.map((kind) => (
        <div key={kind} className="flex min-h-6 items-center gap-1.5">
          <input
            id={`${idPrefix}-${kind}`}
            type="checkbox"
            className="size-4 accent-foreground"
            checked={value.has(kind)}
            onChange={(event) => toggle(kind, event.target.checked)}
          />
          <label htmlFor={`${idPrefix}-${kind}`} className="flex items-center gap-1 text-muted-foreground">
            <span aria-hidden="true" className={`inline-block size-3 ${personKindShapeOf(kind)} ${PERSON_KIND_STYLES[kind].face}`} />
            {PERSON_KIND_LABELS[kind]}
          </label>
        </div>
      ))}
    </fieldset>
  );
}
