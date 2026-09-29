/**
 * 未了事項の詳細・登録
 *
 * ボード（CaseBoard）と入れ替えて表示します。未了事項1件について、次の3つをこの1か所で行います。
 * 1. 内容・状態・担当・期限・結果のメモの編集と、未了事項の削除（TaskForm）
 * 2. 対象の証言・人物・場所のひもづけ。選ぶとすぐにひもづけ、外すボタンですぐに外します
 * 3. 確認した結果を、新しい証言として書き足す導線（「結果を証言として書き足す」）。
 *    書き足した証言は、この未了事項の対象の証言にひもづけ、未了事項から結果の証言へたどれるようにします。
 *    証言の保存とひもづけは1回の保存で行い、どちらかができない場合は証言も保存しません
 *
 * 未了事項の登録（NewTaskDetail）は、内容・状態・担当・期限・結果のメモだけを入力し、保存すると、ひもづけを続けられるよう詳細へ移ります。
 * 証言・人物・場所の詳細の「未了事項を追加」から開いた場合は、その対象（URLの ?link=）をひもづけた状態で登録します。
 * 登録のURLへ「戻る」で戻ると、同じ未了事項を二重に登録しかねないため、履歴は置き換えます。
 *
 * 注意: ケースに無い未了事項のIDが渡された場合（URLの直接入力、削除済みの未了事項）は、見つからないことを表示します。
 * URLで指定されたひもづけの対象がケースに無い場合は、ひもづけずに登録します（URLはユーザーが自由に書き換えられるためです）。
 * 未了事項のフォームは初期値を初期化でのみ使用するため、呼び出し側は taskId が変わるたびに key を変えて再マウントしてください。
 * useSearchParams を使うため、ページでは Suspense の中に置いてください。
 */
'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { buildTimeline, claimLabelOf } from '@/domain/case-views';
import { TASK_LINK_KIND_LABELS } from '@/domain/labels';
import { TASK_LINK_KEYS, type TaskLinkKind } from '@/domain/tasks';
import type { Case, Id, Task } from '@/domain/types';
import { useCaseStore, useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimLink } from './ClaimLink';
import { DeleteConfirmButton } from './DeleteConfirmButton';
import { ClaimForm } from './forms/ClaimForm';
import { FormError, INPUT_CLASS } from './forms/fields';
import { TaskForm, type TaskLinks } from './forms/TaskForm';
import {
  boardHref,
  parseTab,
  parseTaskLink,
  personHref,
  placeHref,
  TAB_SEARCH_PARAM,
  TASK_LINK_SEARCH_PARAM,
  taskHref,
  type TabKey,
  type TaskLinkTarget,
} from './routes';
import { useCaseId } from './useCaseId';

/** ひもづけの選択肢・一覧の1件です。 */
type LinkOption = { id: Id; label: string };

/** 詳細を閉じて、ボードへ戻るリンクです。 */
function CloseLink({ tab }: { tab: TabKey }) {
  const caseId = useCaseId();
  return (
    <div className="flex justify-end">
      <Link href={boardHref(caseId, tab)} aria-label="未了事項の詳細を閉じる" className="text-xs text-muted-foreground hover:underline">
        閉じる
      </Link>
    </div>
  );
}

/**
 * ひもづけの対象の種類ごとの選択肢を返します。証言は時系列の並び順に、人物・場所は登録した順に並べます。
 * 証言の表示名は、発言者を添えた「発言者: 見出し」の形です。
 */
function linkOptionsOf(target: Case): Record<TaskLinkKind, LinkOption[]> {
  return {
    claim: buildTimeline(target).items.map(({ view }) => ({
      id: view.claim.id,
      label: `${view.speakerLabel}: ${claimLabelOf(view)}`,
    })),
    person: target.persons.map((person) => ({ id: person.id, label: person.name })),
    place: target.places.map((place) => ({ id: place.id, label: place.name })),
  };
}

type LinkSectionProps = {
  kind: TaskLinkKind;
  /** ひもづけた対象です。 */
  linked: LinkOption[];
  /** まだひもづけていない、選択肢に並べる対象です。 */
  candidates: LinkOption[];
  /** ひもづけた対象1件の、詳細へのリンクです。 */
  renderLink: (option: LinkOption) => ReactNode;
  onAdd: (id: Id) => void;
  onRemove: (id: Id) => void;
};

/** 対象の証言・人物・場所の節です。ひもづけた対象と外すボタンの組を並べ、選択欄で対象を加えます。 */
function LinkSection({ kind, linked, candidates, renderLink, onAdd, onRemove }: LinkSectionProps) {
  const label = `対象の${TASK_LINK_KIND_LABELS[kind]}`;
  return (
    <section aria-label={label} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{linked.length}件</span>
      </h3>
      {linked.length === 0 ? (
        <p className="text-xs text-muted-foreground">まだひもづけていません。</p>
      ) : (
        <ul className="space-y-1">
          {linked.map((option) => (
            <li key={option.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">{renderLink(option)}</div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`「${option.label}」を${label}から外す`}
                title={`${label}から外す`}
                onClick={() => onRemove(option.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <select
        aria-label={`${label}を追加`}
        value=""
        disabled={candidates.length === 0}
        onChange={(event) => {
          if (event.target.value !== '') onAdd(event.target.value);
        }}
        className={INPUT_CLASS}
      >
        <option value="">{candidates.length === 0 ? 'ひもづけられる対象がありません' : `${label}を追加…`}</option>
        {candidates.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </section>
  );
}

export function TaskDetail({ taskId }: { taskId: Id }) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const upsert = useCaseStore((state) => state.upsert);
  const remove = useCaseStore((state) => state.remove);
  const router = useRouter();
  const tab = parseTab(useSearchParams().get(TAB_SEARCH_PARAM));
  const task = currentCase.tasks.find((candidate) => candidate.id === taskId);
  const options = useMemo(() => linkOptionsOf(currentCase), [currentCase]);
  const claimViews = useMemo(() => buildTimeline(currentCase).items.map((item) => item.view), [currentCase]);
  const [isSaved, setIsSaved] = useState(false);
  const [isComposingResult, setIsComposingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!task) {
    return (
      <div className="space-y-4">
        <CloseLink tab={tab} />
        <h2 className="text-lg font-semibold">未了事項が見つかりません</h2>
        <p className="text-sm text-muted-foreground">この未了事項は削除されたか、URLが誤っています。</p>
      </div>
    );
  }

  /**
   * 未了事項を書き換えて、すぐに保存します。保存できなかった場合は理由を表示します。
   * 再描画を待たずに続けて操作しても前の変更を上書きしないよう、描画時点ではなくストアにある最新の未了事項を書き換えます。
   */
  const update = (change: (current: Task) => Task) => {
    setError(null);
    const latest = useCaseStore.getState().currentCase?.tasks.find((candidate) => candidate.id === taskId) ?? task;
    try {
      upsert('tasks', change(latest));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  /** 種類 kind の対象 id を、ひもづけに加えます。 */
  const addLink = (kind: TaskLinkKind, id: Id) => {
    const key = TASK_LINK_KEYS[kind];
    update((current) => ({ ...current, [key]: [...current[key], id] }));
  };

  /** 種類 kind の対象 id を、ひもづけから外します。 */
  const removeLink = (kind: TaskLinkKind, id: Id) => {
    const key = TASK_LINK_KEYS[kind];
    update((current) => ({ ...current, [key]: current[key].filter((linkedId) => linkedId !== id) }));
  };

  const handleDelete = () => {
    try {
      remove('tasks', taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    // 削除した未了事項のURLへ「戻る」で戻らないよう、履歴を置き換える
    router.replace(boardHref(caseId, tab));
  };

  /** 種類 kind の対象の節です。ひもづけた対象は、証言は時系列の並び順、人物・場所はひもづけた順に並べます。 */
  const linkSection = (kind: TaskLinkKind, renderLink: (option: LinkOption) => ReactNode) => {
    const linkedIds = task[TASK_LINK_KEYS[kind]];
    const linked =
      kind === 'claim'
        ? options.claim.filter((option) => linkedIds.includes(option.id))
        : linkedIds.flatMap((id) => options[kind].filter((option) => option.id === id));
    return (
      <LinkSection
        kind={kind}
        linked={linked}
        candidates={options[kind].filter((option) => !linkedIds.includes(option.id))}
        renderLink={renderLink}
        onAdd={(id) => addLink(kind, id)}
        onRemove={(id) => removeLink(kind, id)}
      />
    );
  };

  const entityLinkClass = 'block rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:border-foreground/30';

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="未了事項の編集" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 whitespace-pre-line text-lg font-semibold">{task.content}</h2>
        <TaskForm
          initial={task}
          onDone={() => setIsSaved(true)}
          actions={
            <div className="mr-auto">
              <DeleteConfirmButton
                label="この未了事項を削除"
                title="この未了事項を削除しますか？"
                description="この未了事項をケースから削除します。この操作は取り消せません。ひもづけた証言・人物・場所は削除しません。確認を終えた記録を残しておきたい場合は、削除せずに状態を「完了」にしてください。"
                onConfirm={handleDelete}
              />
            </div>
          }
        />
        {isSaved && (
          <p role="status" className="mt-2 text-right text-xs text-mention-place-foreground">
            保存しました
          </p>
        )}
      </section>

      <FormError message={error} />

      <section aria-label="結果の証言" className="space-y-2">
        {isComposingResult ? (
          <section aria-label="結果の証言の書き足し" className="rounded-lg border bg-card p-3">
            <ClaimForm
              onDone={() => setIsComposingResult(false)}
              withEntries={(claimId) => {
                // 描画時点の未了事項で上書きしないよう、ストアにある最新の未了事項にひもづける
                const latest = useCaseStore.getState().currentCase?.tasks.find((candidate) => candidate.id === taskId);
                if (!latest) throw new Error(`未了事項が見つかりません: ${taskId}`);
                return [{ key: 'tasks', entity: { ...latest, claimIds: [...latest.claimIds, claimId] } }];
              }}
              autoFocus
              compact
              actions={
                <button
                  type="button"
                  onClick={() => setIsComposingResult(false)}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  やめる
                </button>
              }
            />
          </section>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setIsComposingResult(true)}>
            結果を証言として書き足す
          </Button>
        )}
        <p className="text-xs text-muted-foreground">書き足した証言は、この未了事項の対象の証言にひもづけます。</p>
      </section>

      {linkSection('claim', (option) => {
        const view = claimViews.find((candidate) => candidate.claim.id === option.id);
        return view ? <ClaimLink view={view} tab={tab} /> : null;
      })}
      {linkSection('person', (option) => (
        <Link href={personHref(caseId, option.id, tab)} className={entityLinkClass}>
          {option.label}
        </Link>
      ))}
      {linkSection('place', (option) => (
        <Link href={placeHref(caseId, option.id, tab)} className={entityLinkClass}>
          {option.label}
        </Link>
      ))}
    </div>
  );
}

/** URLで指定されたひもづけの対象を、ケースにある場合だけ、ひもづけとその表示名にして返します。 */
function initialLinksOf(target: Case, link: TaskLinkTarget | undefined): { links: TaskLinks; label: string } | undefined {
  if (!link) return undefined;
  const option = linkOptionsOf(target)[link.kind].find((candidate) => candidate.id === link.id);
  if (!option) return undefined;
  return {
    links: { claimIds: [], personIds: [], placeIds: [], [TASK_LINK_KEYS[link.kind]]: [link.id] },
    label: `${TASK_LINK_KIND_LABELS[link.kind]}「${option.label}」`,
  };
}

export function NewTaskDetail() {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get(TAB_SEARCH_PARAM));
  // 登録中にケースが変わっても、開いたときに指定された対象でひもづけるよう、最初の描画で決めた値を使う
  const [initial] = useState(() => initialLinksOf(currentCase, parseTaskLink(searchParams.get(TASK_LINK_SEARCH_PARAM))));

  return (
    <div className="space-y-6">
      <CloseLink tab={tab} />

      <section aria-label="未了事項の登録" className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">未了事項を登録</h2>
        {initial && <p className="mb-3 text-sm text-muted-foreground">ひもづける対象: {initial.label}</p>}
        <TaskForm initialLinks={initial?.links} onDone={(id) => router.replace(taskHref(caseId, id, tab))} />
      </section>
    </div>
  );
}
