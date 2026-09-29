/**
 * 未了事項（確認すべきこと）から表示用の情報を導出するロジック
 *
 * 未了事項は、読み手が「何を確認済みで、何がまだ残っているか」を記録した一次データです。
 * このファイルは、未了事項から次の2つを導出します。いずれも保存しません。
 * - 未了事項の一覧（buildTaskList）。未完了のものを対応中・未着手の順に並べ、完了したものを別に分けます
 * - 証言・人物・場所の詳細に並べる、それをひもづけた未了事項（findTasksLinkedTo）
 * あわせて、証言・人物・場所を削除するときに未了事項からひもづけを外す操作（detachFromTasks）を持ちます。
 *
 * 注意: ひもづけた証言は、証言の詳細と同じく時系列の並び順（buildTimeline）に並べます。
 */
import { buildTimeline, type ClaimView } from './case-views';
import type { Case, Id, Person, Place, Task, TaskStatus } from './types';

/** 未了事項の状態を、入力の選択肢に並べる順に並べたものです。 */
export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'inProgress', 'done'];

/** 一覧で、未完了の未了事項を並べる順です。手を付けているものを先に並べます。 */
const OPEN_STATUS_ORDER: readonly TaskStatus[] = ['inProgress', 'todo'];

/** 未了事項にひもづけられる対象の種類です。 */
export type TaskLinkKind = 'claim' | 'person' | 'place';

/** 対象の種類ごとの、未了事項の中のひもづけの項目名です。 */
export const TASK_LINK_KEYS: Record<TaskLinkKind, 'claimIds' | 'personIds' | 'placeIds'> = {
  claim: 'claimIds',
  person: 'personIds',
  place: 'placeIds',
};

/** 未了事項の一覧の1件です。ひもづけた証言・人物・場所を添えます。 */
export type TaskListItem = {
  task: Task;
  /** ひもづけた証言です。時系列の並び順に並びます。 */
  claims: ClaimView[];
  /** ひもづけた人物です。ひもづけた順に並びます。 */
  persons: Person[];
  /** ひもづけた場所です。ひもづけた順に並びます。 */
  places: Place[];
};

/** 未了事項の一覧です。完了したものは、区別して表示できるよう別に分けます。 */
export type TaskList = {
  /** 未完了の未了事項です。対応中・未着手の順に並び、同じ状態では期限の早い順（期限の無いものは後ろ）に並びます。 */
  open: TaskListItem[];
  /** 完了した未了事項です。登録した順に並びます。 */
  done: TaskListItem[];
};

/** IDの一覧に対応する要素を、IDの順に返します。参照の整合性は findCaseViolations で担保する前提のため、見つからない場合はデータ破損として扱います。 */
function pick<T extends { id: Id }>(items: T[], ids: Id[], entityName: string): T[] {
  return ids.map((id) => {
    const found = items.find((item) => item.id === id);
    if (!found) throw new Error(`${entityName}が見つかりません: ${id}`);
    return found;
  });
}

/**
 * 期限を比べます。期限の無いものは、期限のあるものより後ろに並べます。
 * 期限は年月日（YYYY-MM-DD）の形のため、文字列の順が日付の順と一致します。
 */
function compareDue(a: Task, b: Task): number {
  if (a.due === b.due) return 0;
  if (a.due === undefined) return 1;
  if (b.due === undefined) return -1;
  return a.due < b.due ? -1 : 1;
}

/** 未了事項の一覧を返します。 */
export function buildTaskList(target: Case): TaskList {
  const views = buildTimeline(target).items.map((item) => item.view);
  const toItem = (task: Task): TaskListItem => ({
    task,
    claims: views.filter((view) => task.claimIds.includes(view.claim.id)),
    persons: pick(target.persons, task.personIds, '人物'),
    places: pick(target.places, task.placeIds, '場所'),
  });

  return {
    // Array.prototype.sort は安定なため、期限が同じものは登録した順を保つ
    open: OPEN_STATUS_ORDER.flatMap((status) =>
      target.tasks.filter((task) => task.status === status).sort(compareDue).map(toItem)
    ),
    done: target.tasks.filter((task) => task.status === 'done').map(toItem),
  };
}

/** 対象（証言・人物・場所）id をひもづけた未了事項を、ケースに登録した順に返します。 */
export function findTasksLinkedTo(target: Case, kind: TaskLinkKind, id: Id): Task[] {
  const key = TASK_LINK_KEYS[kind];
  return target.tasks.filter((task) => task[key].includes(id));
}

/**
 * 未了事項から、対象（証言・人物・場所）id のひもづけを外した一覧を返します。
 * 証言・人物・場所を削除するときに使います。未了事項そのものは残します。
 */
export function detachFromTasks(tasks: Task[], kind: TaskLinkKind, id: Id): Task[] {
  const key = TASK_LINK_KEYS[kind];
  return tasks.map((task) => ({ ...task, [key]: task[key].filter((linkedId) => linkedId !== id) }));
}
