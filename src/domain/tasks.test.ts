/**
 * 未了事項（確認すべきこと）から、一覧・ひもづけ先から見た未了事項を導出するロジックと、
 * ひもづけ先を削除するときにひもづけを外す操作のテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from './sample-fictional-case';
import { buildTaskList, detachFromTasks, findTasksLinkedTo } from './tasks';
import type { Case, Task } from './types';

/** 期限の無い、未着手の未了事項です。サンプルのケースの未了事項の後ろに加えて使います。 */
const taskWithoutDue: Task = {
  id: 'task-newspaper-source',
  content: '朝刊の記事の原典を探す',
  status: 'todo',
  claimIds: ['claim-report'],
  personIds: ['person-newspaper'],
  placeIds: [],
};

/** 期限の早い、未着手の未了事項です。 */
const taskWithEarlyDue: Task = {
  id: 'task-neighbor-again',
  content: '隣家の住人に、明かりを見た時刻を再度聞く',
  status: 'todo',
  due: '1998-08-15',
  claimIds: ['claim-neighbor'],
  personIds: ['person-neighbor'],
  placeIds: [],
};

/**
 * サンプルのケースに、未了事項を2件加えたケースです。
 * 前提: サンプルのケースには、対応中の「防犯カメラの映像の確認」（期限 1998-08-20）・
 * 未着手の「管理人への再聴取」（期限 1998-08-18）・完了した「当夜の天気の確認」がある
 */
const caseWithFiveTasks: Case = {
  ...sampleFictionalCase,
  tasks: [...sampleFictionalCase.tasks, taskWithoutDue, taskWithEarlyDue],
};

describe('buildTaskList', () => {
  it('未完了の未了事項を対応中・未着手の順に、同じ状態では期限の早い順（期限の無いものは後ろ）に並べ、完了したものを別に分ける', () => {
    const list = buildTaskList(caseWithFiveTasks);

    expect(list.open.map((item) => item.task.id)).toEqual([
      'task-camera',
      'task-neighbor-again',
      'task-caretaker',
      'task-newspaper-source',
    ]);
    expect(list.done.map((item) => item.task.id)).toEqual(['task-weather']);
  });

  it('各未了事項に、ひもづけた証言・人物・場所を添える', () => {
    const list = buildTaskList(caseWithFiveTasks);
    const caretakerReinterview = list.open.find((item) => item.task.id === 'task-caretaker');

    expect(caretakerReinterview?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(caretakerReinterview?.persons.map((person) => person.name)).toEqual(['管理人']);
    expect(caretakerReinterview?.places.map((place) => place.name)).toEqual(['湖畔の別荘']);
  });
});

describe('findTasksLinkedTo', () => {
  it('証言・人物・場所をひもづけた未了事項を、登録した順に返す', () => {
    expect(findTasksLinkedTo(caseWithFiveTasks, 'claim', 'claim-neighbor').map((task) => task.id)).toEqual([
      'task-neighbor-again',
    ]);
    expect(findTasksLinkedTo(caseWithFiveTasks, 'person', 'person-caretaker').map((task) => task.id)).toEqual([
      'task-caretaker',
    ]);
    expect(findTasksLinkedTo(caseWithFiveTasks, 'place', 'place-villa').map((task) => task.id)).toEqual([
      'task-caretaker',
      'task-weather',
    ]);
  });

  it('どの未了事項にもひもづいていない場合は空の配列を返す', () => {
    expect(findTasksLinkedTo(caseWithFiveTasks, 'person', 'person-book')).toEqual([]);
  });
});

describe('detachFromTasks', () => {
  it('指定した種類のひもづけだけを外し、未了事項そのものと他のひもづけは残す', () => {
    const afterUnlink = detachFromTasks(caseWithFiveTasks.tasks, 'place', 'place-villa');

    const caretakerReinterview = afterUnlink.find((task) => task.id === 'task-caretaker');
    expect(caretakerReinterview).toMatchObject({
      claimIds: ['claim-caretaker'],
      personIds: ['person-caretaker'],
      placeIds: [],
    });
    expect(afterUnlink).toHaveLength(caseWithFiveTasks.tasks.length);
  });

  it('同じIDでも、別の種類のひもづけは外さない', () => {
    // 前提: 人物と証言は別の一覧のため、IDが重なっても別のものとして扱う
    const taskWithSameId: Task = { ...taskWithoutDue, claimIds: ['shared-id'], personIds: ['shared-id'] };

    const [afterUnlink] = detachFromTasks([taskWithSameId], 'claim', 'shared-id');

    expect(afterUnlink).toMatchObject({ claimIds: [], personIds: ['shared-id'] });
  });
});
