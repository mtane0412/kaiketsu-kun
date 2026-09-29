/**
 * 未了事項（確認すべきこと）から、一覧・ひもづけ先から見た未了事項を導出するロジックと、
 * ひもづけ先を削除するときにひもづけを外す操作のテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from './sample-fictional-case';
import { buildTaskList, detachFromTasks, findTasksLinkedTo } from './tasks';
import type { Case, Task } from './types';

/** 期限の無い、未着手の未了事項です。サンプルのケースの未了事項の後ろに加えて使います。 */
const 期限の無い未了事項: Task = {
  id: 'task-newspaper-source',
  content: '朝刊の記事の原典を探す',
  status: 'todo',
  claimIds: ['claim-report'],
  personIds: ['person-newspaper'],
  placeIds: [],
};

/** 期限の早い、未着手の未了事項です。 */
const 期限の早い未了事項: Task = {
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
const 未了事項が5件のケース: Case = {
  ...sampleFictionalCase,
  tasks: [...sampleFictionalCase.tasks, 期限の無い未了事項, 期限の早い未了事項],
};

describe('buildTaskList', () => {
  it('未完了の未了事項を対応中・未着手の順に、同じ状態では期限の早い順（期限の無いものは後ろ）に並べ、完了したものを別に分ける', () => {
    const 一覧 = buildTaskList(未了事項が5件のケース);

    expect(一覧.open.map((item) => item.task.id)).toEqual([
      'task-camera',
      'task-neighbor-again',
      'task-caretaker',
      'task-newspaper-source',
    ]);
    expect(一覧.done.map((item) => item.task.id)).toEqual(['task-weather']);
  });

  it('各未了事項に、ひもづけた証言・人物・場所を添える', () => {
    const 一覧 = buildTaskList(未了事項が5件のケース);
    const 管理人への再聴取 = 一覧.open.find((item) => item.task.id === 'task-caretaker');

    expect(管理人への再聴取?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(管理人への再聴取?.persons.map((person) => person.name)).toEqual(['管理人']);
    expect(管理人への再聴取?.places.map((place) => place.name)).toEqual(['湖畔の別荘']);
  });
});

describe('findTasksLinkedTo', () => {
  it('証言・人物・場所をひもづけた未了事項を、登録した順に返す', () => {
    expect(findTasksLinkedTo(未了事項が5件のケース, 'claim', 'claim-neighbor').map((task) => task.id)).toEqual([
      'task-neighbor-again',
    ]);
    expect(findTasksLinkedTo(未了事項が5件のケース, 'person', 'person-caretaker').map((task) => task.id)).toEqual([
      'task-caretaker',
    ]);
    expect(findTasksLinkedTo(未了事項が5件のケース, 'place', 'place-villa').map((task) => task.id)).toEqual([
      'task-caretaker',
      'task-weather',
    ]);
  });

  it('どの未了事項にもひもづいていない場合は空の配列を返す', () => {
    expect(findTasksLinkedTo(未了事項が5件のケース, 'person', 'person-book')).toEqual([]);
  });
});

describe('detachFromTasks', () => {
  it('指定した種類のひもづけだけを外し、未了事項そのものと他のひもづけは残す', () => {
    const 外した後 = detachFromTasks(未了事項が5件のケース.tasks, 'place', 'place-villa');

    const 管理人への再聴取 = 外した後.find((task) => task.id === 'task-caretaker');
    expect(管理人への再聴取).toMatchObject({
      claimIds: ['claim-caretaker'],
      personIds: ['person-caretaker'],
      placeIds: [],
    });
    expect(外した後).toHaveLength(未了事項が5件のケース.tasks.length);
  });

  it('同じIDでも、別の種類のひもづけは外さない', () => {
    // 前提: 人物と証言は別の一覧のため、IDが重なっても別のものとして扱う
    const 同じIDを持つ未了事項: Task = { ...期限の無い未了事項, claimIds: ['shared-id'], personIds: ['shared-id'] };

    const [外した後] = detachFromTasks([同じIDを持つ未了事項], 'claim', 'shared-id');

    expect(外した後).toMatchObject({ claimIds: [], personIds: ['shared-id'] });
  });
});
