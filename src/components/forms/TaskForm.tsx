/**
 * 未了事項の入力フォーム
 *
 * 未了事項の詳細（TaskDetail）と登録（NewTaskDetail）で使い、未了事項（Task）の内容・状態・担当・期限・結果のメモを入力します。
 * 担当・期限・結果のメモは任意で、空のまま保存すると項目ごと取り除きます（JSONの書き出しと読み込みで形が変わらないようにするためです）。
 * 期限は日付の入力欄（type="date"）で選び、年月日（YYYY-MM-DD）の形で保存します。
 *
 * 対象の証言・人物・場所は、このフォームでは入力しません（未了事項の詳細で、1件ずつすぐに保存します）。
 * 保存するときは、フォームを開いた後でひもづけが変わっていても失わないよう、ストアにある最新の未了事項のひもづけを引き継ぎます。
 * 新規登録では、initialLinks に渡したひもづけで登録します（証言・人物・場所の詳細の「未了事項を追加」から開いた場合です）。
 *
 * 注意: 内容が空白だけの未了事項などの規則違反は、ストアの検証（findCaseViolations）が例外で知らせ、フォームはその理由を表示します。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { TASK_STATUSES } from '@/domain/tasks';
import { TASK_STATUS_LABELS } from '@/domain/labels';
import type { Id, Task, TaskStatus } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { FormError, INPUT_CLASS, LABEL_CLASS, SubmitButton, TextField } from './fields';

/** 未了事項のひもづけです。 */
export type TaskLinks = Pick<Task, 'claimIds' | 'personIds' | 'placeIds'>;

/** ひもづけの無い状態です。 */
const NO_LINKS: TaskLinks = { claimIds: [], personIds: [], placeIds: [] };

type TaskFormProps = {
  /** 編集する未了事項です。省略すると新規登録になります（状態は未着手から始めます）。 */
  initial?: Task;
  /** 新規登録のときに、最初からひもづける証言・人物・場所です。編集では使いません。 */
  initialLinks?: TaskLinks;
  /** 保存できたときに、保存した未了事項のIDで呼び出します。 */
  onDone: (id: Id) => void;
  /** 保存ボタンの横に並べる操作です（削除ボタンなど）。 */
  actions?: ReactNode;
};

/** 入力の前後の空白を除き、空であれば項目ごと持たせないための値を返します。 */
function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function TaskForm({ initial, initialLinks, onDone, actions }: TaskFormProps) {
  const upsert = useCaseStore((state) => state.upsert);
  /** 同じ画面に複数のフォームが並んでも入力欄が混ざらないよう、このフォーム固有の接頭辞を持ちます。 */
  const formId = useId();

  const [content, setContent] = useState(initial?.content ?? '');
  const [status, setStatus] = useState<TaskStatus>(initial?.status ?? 'todo');
  const [assignee, setAssignee] = useState(initial?.assignee ?? '');
  const [due, setDue] = useState(initial?.due ?? '');
  const [resultNote, setResultNote] = useState(initial?.resultNote ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // フォームを開いた後に詳細でひもづけた証言・人物・場所を上書きしないよう、ストアにある最新の未了事項から引き継ぐ
    const latest = useCaseStore.getState().currentCase?.tasks.find((task) => task.id === initial?.id);
    const links: TaskLinks = latest ?? initialLinks ?? NO_LINKS;
    const trimmedAssignee = optionalText(assignee);
    const trimmedDue = optionalText(due);
    const trimmedResultNote = optionalText(resultNote);
    const task: Task = {
      id: initial?.id ?? nanoid(),
      content: content.trim(),
      status,
      // 未入力の任意項目はキーごと持たせない
      ...(trimmedAssignee !== undefined ? { assignee: trimmedAssignee } : {}),
      ...(trimmedDue !== undefined ? { due: trimmedDue } : {}),
      ...(trimmedResultNote !== undefined ? { resultNote: trimmedResultNote } : {}),
      claimIds: links.claimIds,
      personIds: links.personIds,
      placeIds: links.placeIds,
    };

    try {
      upsert('tasks', task);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    setError(null);
    onDone(task.id);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <TextField
        label="内容"
        value={content}
        onChange={setContent}
        required
        multiline
        placeholder="管理人の供述を、県道の防犯カメラで確かめる"
      />

      <fieldset>
        <legend className={LABEL_CLASS}>状態</legend>
        <div className="flex flex-wrap gap-4">
          {TASK_STATUSES.map((candidate) => (
            <label key={candidate} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${formId}-status`}
                checked={status === candidate}
                onChange={() => setStatus(candidate)}
              />
              {TASK_STATUS_LABELS[candidate]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="担当" value={assignee} onChange={setAssignee} placeholder="捜査1係" />
        <div>
          <label htmlFor={`${formId}-due`} className={LABEL_CLASS}>
            期限
          </label>
          <input
            id={`${formId}-due`}
            type="date"
            value={due}
            onChange={(event) => setDue(event.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      </div>

      <TextField
        label="結果のメモ"
        value={resultNote}
        onChange={setResultNote}
        multiline
        placeholder="確かめて分かったこと"
      />

      <FormError message={error} />
      <div className="flex items-center justify-end gap-2">
        {actions}
        <SubmitButton label="未了事項を保存" />
      </div>
    </form>
  );
}
