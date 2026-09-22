/**
 * 人物の詳細に並べる「関係」
 *
 * 人物どうしの関係（Relationship）の一覧と、登録・編集・削除をまとめます。
 * 関係は証言から導出せず、ユーザーが証言を読んで導いた結論として登録する一次データです。
 * そのため、根拠になった証言（Relationship.basisClaimIds）へのリンクを各行に並べ、
 * 根拠が1件も無い関係は「根拠未登録」と示します。どの関係が裏付けを持つかを、一覧のまま見分けられるようにするためです。
 *
 * 一覧は、開いている人物から見た向き（双方向・この人物から・この人物へ）を言葉で示します
 * （導出は src/domain/person-relationships.ts）。人物の名前は相手の詳細へのリンクにし、
 * 「人物 → 関係 → 相手の人物」とたどれるようにします。開いているタブ（tab）はリンク先のURLに引き継ぎます。
 *
 * 注意: 関係の入力は、この一覧の中でフォームを開いて行います（RelationshipForm）。
 * 編集対象を切り替えるたびにフォームを作り直せるよう、フォームには対象のIDを key に渡します。
 */
'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  buildPersonRelationships,
  describePersonRelationship,
  type PersonRelationshipView,
} from '@/domain/person-relationships';
import type { Id } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { EntityAvatar } from './EntityAvatar';
import { RelationshipForm } from './forms/RelationshipForm';
import { FormError } from './forms/fields';
import { personHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '関係';

/** 根拠の証言が1件も登録されていない関係に添える言葉です。 */
const NO_BASIS_LABEL = '根拠未登録';

/**
 * 編集・削除のボタンの、読み上げ用の名前を組み立てます。
 * 1人の人物が複数の関係を持つため、ボタンの名前には関係の名前と相手の名前を含めて、どの関係への操作かを区別できるようにします。
 */
function actionLabelOf(view: PersonRelationshipView, action: string): string {
  return `${view.relationship.label}（${view.other.name}）の関係を${action}`;
}

/** 入力フォームを開いていない状態です。 */
type ClosedForm = { kind: 'closed' };
/** 入力フォームの状態です。編集の場合は、対象の関係のIDを持ちます。 */
type FormState = ClosedForm | { kind: 'new' } | { kind: 'edit'; relationshipId: Id };

type RelationshipSectionProps = {
  personId: Id;
  /** 開いている人物の名前です。関係の向きの説明に使います。 */
  personName: string;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function RelationshipSection({ personId, personName, tab }: RelationshipSectionProps) {
  const caseId = useCaseId();
  const currentCase = useCurrentCase();
  const remove = useCaseStore((state) => state.remove);
  const [form, setForm] = useState<FormState>({ kind: 'closed' });
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const relationships = buildPersonRelationships(currentCase, personId);

  const handleDelete = (relationshipId: Id) => {
    setDeleteError(null);
    try {
      remove('relationships', relationshipId);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{relationships.length}件</span>
      </h3>

      {relationships.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          「関係を追加」から、この人物と他の人物とのつながりを登録できます。
        </p>
      ) : (
        <ul className="space-y-2">
          {relationships.map((view) => (
            <li key={view.relationship.id} className="space-y-2 rounded-lg border bg-card p-3">
              <p className="text-sm">{describePersonRelationship(view, personName)}</p>
              <Link
                href={personHref(caseId, view.other.id, tab)}
                className="flex items-center gap-1.5 text-sm hover:underline"
              >
                <EntityAvatar imageDataUrl={view.other.imageDataUrl} iconText={view.other.iconText} size="sm" />
                <span className="min-w-0 truncate">{view.other.name}</span>
              </Link>

              {view.basisClaims.length === 0 ? (
                <p className="text-xs text-muted-foreground">{NO_BASIS_LABEL}</p>
              ) : (
                <ul className="space-y-1">
                  {view.basisClaims.map((claimView) => (
                    <li key={claimView.claim.id}>
                      <ClaimLink view={claimView} tab={tab} prefix="根拠" />
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={actionLabelOf(view, '編集')}
                  onClick={() => setForm({ kind: 'edit', relationshipId: view.relationship.id })}
                >
                  編集
                </Button>
                <DeleteConfirmButton
                  iconOnly
                  label={actionLabelOf(view, '削除')}
                  title={`「${view.relationship.label}」を削除しますか？`}
                  description="この関係をケースから削除します。この操作は取り消せません。根拠にした証言は削除しません。"
                  onConfirm={() => handleDelete(view.relationship.id)}
                />
              </div>

              {form.kind === 'edit' && form.relationshipId === view.relationship.id && (
                <section aria-label="関係の編集" className="border-t pt-3">
                  <RelationshipForm
                    key={view.relationship.id}
                    personId={personId}
                    personName={personName}
                    initial={view.relationship}
                    onDone={() => setForm({ kind: 'closed' })}
                    onCancel={() => setForm({ kind: 'closed' })}
                  />
                </section>
              )}
            </li>
          ))}
        </ul>
      )}

      <FormError message={deleteError} />

      {form.kind === 'new' ? (
        <section aria-label="関係の登録" className="rounded-lg border bg-card p-3">
          <RelationshipForm
            personId={personId}
            personName={personName}
            onDone={() => setForm({ kind: 'closed' })}
            onCancel={() => setForm({ kind: 'closed' })}
          />
        </section>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setForm({ kind: 'new' })}>
          関係を追加
        </Button>
      )}
    </section>
  );
}
