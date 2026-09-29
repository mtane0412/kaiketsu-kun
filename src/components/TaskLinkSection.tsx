/**
 * 証言・人物・場所の詳細に並べる「この〇〇の未了事項」
 *
 * 開いている証言・人物・場所をひもづけた未了事項を並べ、対象から、まだ確認していないことへたどれるようにします。
 * 各行には、未了事項の状態と、未了事項の詳細へのリンクを並べます。完了したものも、確認済みであることが分かるよう残します。
 * 節の末尾には、この対象をひもづけた状態で未了事項を登録するページへのリンクを置きます。
 * 並びの導出は src/domain/tasks.ts の findTasksLinkedTo です。
 */
'use client';

import Link from 'next/link';
import { TASK_LINK_KIND_LABELS, TASK_STATUS_LABELS } from '@/domain/labels';
import { findTasksLinkedTo, type TaskLinkKind } from '@/domain/tasks';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { newTaskHref, taskHref, type TabKey } from './routes';
import { useCaseId } from './useCaseId';

type TaskLinkSectionProps = {
  kind: TaskLinkKind;
  id: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function TaskLinkSection({ kind, id, tab }: TaskLinkSectionProps) {
  const currentCase = useCurrentCase();
  const caseId = useCaseId();
  const tasks = findTasksLinkedTo(currentCase, kind, id);
  const label = `この${TASK_LINK_KIND_LABELS[kind]}の未了事項`;

  return (
    <section aria-label={label} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {label}
        <span className="ml-2 text-xs font-normal text-muted-foreground">{tasks.length}件</span>
      </h3>
      {tasks.length > 0 && (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id} className="rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="mr-2 text-xs text-muted-foreground">{TASK_STATUS_LABELS[task.status]}</span>
              <Link
                href={taskHref(caseId, task.id, tab)}
                className={`underline underline-offset-2 hover:no-underline ${task.status === 'done' ? 'text-muted-foreground' : ''}`}
              >
                {task.content}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={newTaskHref(caseId, tab, { kind, id })} className="text-xs text-muted-foreground underline underline-offset-2 hover:no-underline">
        {label}を追加
      </Link>
    </section>
  );
}
