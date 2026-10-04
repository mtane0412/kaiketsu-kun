/**
 * 未了事項の一覧ビュー（ボードの「未了事項」タブ）
 *
 * まだ確認していないこと（未了事項）を並べ、何が残っているかを見失わないようにします。
 * 未完了の未了事項は、対応中・未着手の順に、同じ状態では期限の早い順に並べます。
 * 完了した未了事項は削除せずに残し、別の一覧に、結果のメモとともに控えめな見た目で並べます
 * （導出は src/domain/tasks.ts の buildTaskList）。
 * 各未了事項は、内容を未了事項の詳細ページへのリンクにし、状態・担当・期限・ひもづけた対象を添えます。
 *
 * 注意: 未了事項の登録・編集は、未了事項の詳細ページ（TaskDetail）で行います。
 */
'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { TASK_STATUS_LABELS } from '@/domain/labels';
import { buildTaskList, type TaskListItem } from '@/domain/tasks';
import { formatTimeRef } from '@/domain/time-ref';
import type { Case } from '@/domain/types';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { newTaskHref, taskHref } from '../routes';
import { useCaseId } from '../useCaseId';

/** このビューのタブです。リンク先のURLに、戻り先として引き継ぎます。 */
const TAB = 'tasks';

type TaskListViewProps = {
  target: Case;
};

/** ひもづけた対象を「証言1件・管理人・湖畔の別荘」の形の1行にまとめます。何もひもづけていない場合は空文字列を返します。 */
function describeLinks({ claims, persons, places }: TaskListItem): string {
  return [
    ...(claims.length > 0 ? [`証言${claims.length}件`] : []),
    ...persons.map((person) => person.name),
    ...places.map((place) => place.name),
  ].join('・');
}

/** 未了事項1件の行です。 */
function TaskItem({ item }: { item: TaskListItem }) {
  const caseId = useCaseId();
  const { task } = item;
  const isDone = task.status === 'done';
  const links = describeLinks(item);
  const meta = [
    ...(task.assignee ? [`担当: ${task.assignee}`] : []),
    // 期限は年月日の形のため、日時の表記と同じ書き方で表示する
    ...(task.due ? [`期限: ${formatTimeRef(task.due)}`] : []),
    ...(links !== '' ? [`対象: ${links}`] : []),
  ];

  return (
    <li className={`space-y-1 rounded-lg border p-3 ${isDone ? 'bg-muted/40 text-muted-foreground' : 'bg-card'}`}>
      <div className="flex items-start gap-2">
        <Badge variant={task.status === 'inProgress' ? 'default' : isDone ? 'outline' : 'secondary'}>
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
        <Link href={taskHref(caseId, task.id, TAB)} className="whitespace-pre-line font-semibold hover:underline">
          {task.content}
        </Link>
      </div>
      {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join('・')}</p>}
      {task.resultNote && (
        <p className="whitespace-pre-line text-sm">
          <span className="mr-1 text-xs font-semibold">結果</span>
          {task.resultNote}
        </p>
      )}
    </li>
  );
}

export function TaskListView({ target }: TaskListViewProps) {
  const caseId = useCaseId();
  const { open, done } = useMemo(() => buildTaskList(target), [target]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href={newTaskHref(caseId, TAB)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          <Plus aria-hidden="true" />
          未了事項を追加
        </Link>
      </div>

      {open.length === 0 && done.length === 0 && (
        <p className="text-sm text-muted-foreground">
          まだ未了事項がありません。「未了事項を追加」から、確認すべきことを登録し、証言・人物・場所にひもづけられます。
        </p>
      )}

      {open.length > 0 && (
        <ul aria-label="未完了の未了事項の一覧" className="space-y-2">
          {open.map((item) => (
            <TaskItem key={item.task.id} item={item} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section aria-label="完了した未了事項" className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            完了した未了事項
            <span className="ml-2 text-xs font-normal">{done.length}件</span>
          </h3>
          <ul aria-label="完了した未了事項の一覧" className="space-y-2">
            {done.map((item) => (
              <TaskItem key={item.task.id} item={item} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
