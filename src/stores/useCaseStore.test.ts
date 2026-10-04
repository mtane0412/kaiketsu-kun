/**
 * ケースストア（ケースの切り替え・追加・更新・削除・ブラウザ保存）のテスト
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case, Claim, Interview, Person } from '@/domain/types';
import { CASE_KEY_PREFIX, listCaseSummaries, loadCase, saveCase } from '@/lib/case-storage';
import { useCaseStore } from './useCaseStore';

const newClaim: Claim = {
  id: 'claim-postman',
  speaker: { kind: 'person', personIds: ['person-neighbor'] },
  viaPersonIds: ['person-newspaper'],
  content: '翌朝、別荘の郵便受けに新聞が残ったままだった。',
  mentionedPersonIds: ['person-owner'],
};

/** 開いているケースを返します。開いていない場合はテストを失敗させます。 */
function getOpenCase(): Case {
  const { currentCase } = useCaseStore.getState();
  if (currentCase === null) throw new Error('ケースが開かれていません');
  return currentCase;
}

beforeEach(() => {
  localStorage.clear();
  saveCase(sampleFictionalCase);
  useCaseStore.getState().openCase(sampleFictionalCase.id);
});

describe('openCase', () => {
  it('保存済みのケースを開く', () => {
    expect(getOpenCase()).toEqual(sampleFictionalCase);
    expect(useCaseStore.getState().loadError).toBeNull();
  });

  it('保存されていないIDを開こうとすると、ケースを開かずに理由を示す', () => {
    useCaseStore.getState().openCase('case-unknown');

    expect(useCaseStore.getState().currentCase).toBeNull();
    expect(useCaseStore.getState().loadError).toContain('ケースが見つかりません');
  });

  it('保存データが検証に失敗した場合は、ケースを開かずに理由を示す', () => {
    localStorage.setItem(`${CASE_KEY_PREFIX}case-broken`, '{"id":"case-broken"}');

    useCaseStore.getState().openCase('case-broken');

    expect(useCaseStore.getState().currentCase).toBeNull();
    expect(useCaseStore.getState().loadError).toContain('ケースデータの形式が正しくありません');
  });
});

describe('createCase', () => {
  it('空のケースを作って保存し、そのIDを返す', () => {
    const newCaseId = useCaseStore.getState().createCase('湖畔の別荘の事件');

    expect(loadCase(newCaseId).name).toBe('湖畔の別荘の事件');
    expect(listCaseSummaries().map((summary) => summary.id)).toContain(newCaseId);
  });

  it('作っただけでは、開いているケースを切り替えない', () => {
    useCaseStore.getState().createCase('湖畔の別荘の事件');

    expect(getOpenCase().id).toBe(sampleFictionalCase.id);
  });
});

describe('importCase', () => {
  it('読み込んだケースを、新しいケースとして保存する', () => {
    const loadedCase: Case = { ...sampleFictionalCase, id: 'case-imported', name: '受け取ったケース' };

    const caseId = useCaseStore.getState().importCase(loadedCase);

    expect(caseId).toBe('case-imported');
    expect(loadCase('case-imported').name).toBe('受け取ったケース');
  });

  it('保存済みのケースとIDが重なる場合は、新しいIDを振って追加し、元のケースを上書きしない', () => {
    const sameIdCase: Case = { ...sampleFictionalCase, name: '別の人から受け取ったケース' };

    const caseId = useCaseStore.getState().importCase(sameIdCase);

    expect(caseId).not.toBe(sampleFictionalCase.id);
    expect(loadCase(sampleFictionalCase.id).name).toBe(sampleFictionalCase.name);
    expect(loadCase(caseId).name).toBe('別の人から受け取ったケース');
  });

  it('検証に失敗するデータは受け付けず、ケースを追加しない', () => {
    expect(() => useCaseStore.getState().importCase({ name: '項目が足りないケース' })).toThrow(
      'ケースデータの形式が正しくありません'
    );
    expect(listCaseSummaries()).toHaveLength(1);
  });
});

describe('deleteCase', () => {
  it('ケースを保存から消し、一覧からも取り除く', () => {
    useCaseStore.getState().deleteCase(sampleFictionalCase.id);

    expect(listCaseSummaries()).toEqual([]);
  });

  it('開いているケースを消した場合は、開いているケースを空にする', () => {
    useCaseStore.getState().deleteCase(sampleFictionalCase.id);

    expect(useCaseStore.getState().currentCase).toBeNull();
  });

  it('開いていないケースを消しても、開いているケースはそのままにする', () => {
    const otherCaseId = useCaseStore.getState().createCase('別のケース');

    useCaseStore.getState().deleteCase(otherCaseId);

    expect(getOpenCase().id).toBe(sampleFictionalCase.id);
  });
});

describe('ケースの一覧', () => {
  it('ケースを作ると、一覧に加える', () => {
    useCaseStore.getState().createCase('湖畔の別荘の事件');

    expect(useCaseStore.getState().summaries.map((summary) => summary.name)).toContain('湖畔の別荘の事件');
  });

  it('ケース名を変えると、一覧の名前も変える', () => {
    useCaseStore.getState().renameCase('改名したケース');

    expect(useCaseStore.getState().summaries.map((summary) => summary.name)).toContain('改名したケース');
  });
});

describe('upsert', () => {
  it('新しいIDの証言を追加する', () => {
    useCaseStore.getState().upsert('claims', newClaim);

    expect(getOpenCase().claims).toHaveLength(sampleFictionalCase.claims.length + 1);
  });

  it('既存のIDの証言は、追加せずに置き換える', () => {
    useCaseStore.getState().upsert('claims', { ...sampleFictionalCase.claims[1]!, locator: '社会面 3段目' });

    const claims = getOpenCase().claims;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 'claim-neighbor')?.locator).toBe('社会面 3段目');
  });

  it('存在しない人物を参照する証言はエラーにし、ケースを変更しない', () => {
    const invalidClaim: Claim = { ...newClaim, mentionedPersonIds: ['person-unknown'] };

    expect(() => useCaseStore.getState().upsert('claims', invalidClaim)).toThrow(
      '存在しない人物を参照しています: person-unknown'
    );
    expect(getOpenCase()).toEqual(sampleFictionalCase);
  });

  it('ケースを開いていない場合はエラーにする', () => {
    useCaseStore.getState().closeCase();

    expect(() => useCaseStore.getState().upsert('claims', newClaim)).toThrow('ケースが開かれていません');
  });
});

describe('upsertMany', () => {
  it('新しい人物と、その人物に言及する証言を、1回の検証でまとめて追加する', () => {
    const mailCarrier: Person = { id: 'person-postman', name: '郵便配達員', kind: 'individual' };
    const mentionOfCarrier: Claim = { ...newClaim, mentionedPersonIds: ['person-postman'] };

    useCaseStore.getState().upsertMany([
      { key: 'persons', entity: mailCarrier },
      { key: 'claims', entity: mentionOfCarrier },
    ]);

    const { persons, claims } = getOpenCase();
    expect(persons).toContainEqual(mailCarrier);
    expect(claims).toContainEqual(mentionOfCarrier);
  });

  it('1件でも規則に違反する場合は、どの要素も追加しない', () => {
    const mailCarrier: Person = { id: 'person-postman', name: '郵便配達員', kind: 'individual' };
    const invalidClaim: Claim = { ...newClaim, mentionedPersonIds: ['person-unknown'] };

    expect(() =>
      useCaseStore.getState().upsertMany([
        { key: 'persons', entity: mailCarrier },
        { key: 'claims', entity: invalidClaim },
      ])
    ).toThrow('存在しない人物を参照しています: person-unknown');
    expect(getOpenCase()).toEqual(sampleFictionalCase);
  });
});

describe('remove', () => {
  it('どこからも参照されていない証言を削除する', () => {
    useCaseStore.getState().remove('claims', 'claim-report');

    const ids = getOpenCase().claims.map((claim) => claim.id);
    expect(ids).not.toContain('claim-report');
  });

  it('証言の経由としてだけ参照されている人物（媒体）も削除できず、ケースを変更しない', () => {
    // 前提: 書籍「湖畔の夏」は、管理人の証言の経由としてだけ参照されている（発言者でも、本文のメンションでもない）
    expect(() => useCaseStore.getState().remove('persons', 'person-book')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(getOpenCase()).toEqual(sampleFictionalCase);
  });

  it('証言から参照されている人物は削除できず、ケースを変更しない', () => {
    expect(() => useCaseStore.getState().remove('persons', 'person-owner')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(getOpenCase()).toEqual(sampleFictionalCase);
  });
});

describe('照合', () => {
  it('2件の証言の間に、種類と理由をつけた照合を登録する', () => {
    useCaseStore.getState().upsert('crossChecks', {
      id: 'cross-check-report-neighbor',
      claimIds: ['claim-report', 'claim-neighbor'],
      kind: 'sameSubject',
      reason: 'どちらも12日夜の持ち主の様子を述べている。',
    });

    expect(getOpenCase().crossChecks.map((crossCheck) => crossCheck.id)).toContain('cross-check-report-neighbor');
  });

  it('同じ証言どうしの照合は登録できず、ケースを変更しない', () => {
    expect(() =>
      useCaseStore.getState().upsert('crossChecks', {
        id: 'cross-check-self',
        claimIds: ['claim-report', 'claim-report'],
        kind: 'supports',
      })
    ).toThrow('同じ証言どうしは照合できません');
    expect(getOpenCase()).toEqual(sampleFictionalCase);
  });

  it('照合を削除しても、照合した証言は残る', () => {
    useCaseStore.getState().remove('crossChecks', 'cross-check-camera-neighbor');

    const caseData = getOpenCase();
    expect(caseData.crossChecks.map((crossCheck) => crossCheck.id)).not.toContain('cross-check-camera-neighbor');
    expect(caseData.claims.map((claim) => claim.id)).toEqual(expect.arrayContaining(['claim-police-camera', 'claim-neighbor']));
  });

  it('証言を削除すると、その証言を含む照合もあわせて削除する', () => {
    // 前提: 隣家の住人の証言は、防犯カメラの証言（裏付ける）と管理人の証言（食い違う）の2件の照合に含まれる
    useCaseStore.getState().remove('claims', 'claim-neighbor');

    expect(getOpenCase().crossChecks).toEqual([]);
  });

  it('関係の根拠として参照されている証言は、照合があっても削除できず、照合も残す', () => {
    // 前提: 管理人の証言は、雇用主の関係の根拠であり、隣家の住人の証言との照合にも含まれる
    expect(() => useCaseStore.getState().remove('claims', 'claim-caretaker')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(getOpenCase()).toEqual(sampleFictionalCase);
  });
});

describe('仮説', () => {
  it('証言を削除すると、仮説の支える証言・反する証言・対象の人物の観点から、その証言のひもづけを外す', () => {
    // 前提: 防犯カメラの証言は「持ち主は19時より前に別荘を離れた」仮説に反する証言としてひもづいている
    useCaseStore.getState().remove('claims', 'claim-police-camera');

    const leftEarlyHypothesis = getOpenCase().hypotheses.find((hypothesis) => hypothesis.id === 'hypothesis-left-early');
    expect(leftEarlyHypothesis?.opposingClaimIds).toEqual(['claim-neighbor']);
  });

  it('対象の人物の観点にひもづけた証言を削除すると、観点からひもづけを外し、対象の人物は残す', () => {
    // 前提: 報道の証言を、管理人の仮説の「手段」にひもづけておく（報道の証言は他のデータから参照されていない）
    const [caretakerHypothesis] = getOpenCase().hypotheses;
    useCaseStore.getState().upsert('hypotheses', {
      ...caretakerHypothesis!,
      targets: [{ personId: 'person-caretaker', claimIds: { motive: [], opportunity: [], means: ['claim-report'] } }],
    });

    useCaseStore.getState().remove('claims', 'claim-report');

    expect(getOpenCase().hypotheses[0]?.targets).toEqual([
      { personId: 'person-caretaker', claimIds: { motive: [], opportunity: [], means: [] } },
    ]);
  });

  it('仮説の対象になっている人物は削除できない', () => {
    const personReferencedOnlyByHypothesis: Person = { id: 'person-suspect', name: '謎の来訪者', kind: 'individual' };
    useCaseStore.getState().upsert('persons', personReferencedOnlyByHypothesis);
    const [caretakerHypothesis] = getOpenCase().hypotheses;
    useCaseStore.getState().upsert('hypotheses', {
      ...caretakerHypothesis!,
      targets: [{ personId: 'person-suspect', claimIds: { motive: [], opportunity: [], means: [] } }],
    });

    expect(() => useCaseStore.getState().remove('persons', 'person-suspect')).toThrow('他のデータから参照されているため削除できません');
  });
});

describe('未了事項', () => {
  it('証言を削除すると、未了事項からその証言のひもづけを外し、未了事項は残す', () => {
    // 前提: 「防犯カメラの映像の確認」の未了事項は、防犯カメラの証言と県道の防犯カメラをひもづけている
    useCaseStore.getState().remove('claims', 'claim-police-camera');

    const cameraTask = getOpenCase().tasks.find((task) => task.id === 'task-camera');
    expect(cameraTask).toMatchObject({ claimIds: [], personIds: ['person-road-camera'] });
  });

  it('人物を削除すると、未了事項からその人物のひもづけを外す', () => {
    // 前提: 駅員は、「防犯カメラの映像の確認」の未了事項だけが参照する人物とする
    const personReferencedOnlyByTask: Person = { id: 'person-station-staff', name: '駅員', kind: 'individual' };
    useCaseStore.getState().upsert('persons', personReferencedOnlyByTask);
    const securityCameraCheck = getOpenCase().tasks.find((task) => task.id === 'task-camera')!;
    useCaseStore.getState().upsert('tasks', { ...securityCameraCheck, personIds: ['person-station-staff'] });

    useCaseStore.getState().remove('persons', 'person-station-staff');

    expect(getOpenCase().persons.some((person) => person.id === 'person-station-staff')).toBe(false);
    expect(getOpenCase().tasks.find((task) => task.id === 'task-camera')?.personIds).toEqual([]);
  });

  it('場所を削除できなかった場合は、未了事項のひもづけも外さない', () => {
    // 前提: 湖畔の別荘は、証言の場所として参照されているため削除できない
    expect(() => useCaseStore.getState().remove('places', 'place-villa')).toThrow('他のデータから参照されているため削除できません');

    expect(getOpenCase().tasks.find((task) => task.id === 'task-weather')?.placeIds).toEqual(['place-villa']);
  });
});

/** 管理人が、書籍の著者の取材に応じた機会です。 */
const bookInterview: Interview = {
  id: 'interview-caretaker-book',
  title: '湖畔の夏 第3章',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

describe('聴取', () => {
  it('聴取を登録し、証言をその聴取にひもづけられる', () => {
    useCaseStore.getState().upsert('interviews', bookInterview);
    const caretakerClaim = getOpenCase().claims.find((claim) => claim.id === 'claim-caretaker');
    if (!caretakerClaim) throw new Error('前提の証言がありません');

    useCaseStore.getState().upsert('claims', { ...caretakerClaim, interviewId: bookInterview.id });

    expect(getOpenCase().interviews).toEqual([bookInterview]);
    expect(getOpenCase().claims.find((claim) => claim.id === 'claim-caretaker')?.interviewId).toBe(bookInterview.id);
  });

  it('証言がひもづいている聴取は削除できず、証言がひもづいていない聴取は削除できる', () => {
    useCaseStore.getState().upsertMany([
      { key: 'interviews', entity: bookInterview },
      { key: 'interviews', entity: { id: 'interview-empty', title: '隣家の住人の話' } },
    ]);
    const caretakerClaim = getOpenCase().claims.find((claim) => claim.id === 'claim-caretaker');
    if (!caretakerClaim) throw new Error('前提の証言がありません');
    useCaseStore.getState().upsert('claims', { ...caretakerClaim, interviewId: bookInterview.id });

    expect(() => useCaseStore.getState().remove('interviews', bookInterview.id)).toThrow(
      '他のデータから参照されているため削除できません'
    );
    useCaseStore.getState().remove('interviews', 'interview-empty');
    expect(getOpenCase().interviews.map((interview) => interview.id)).toEqual([bookInterview.id]);
  });
});

describe('remove（メモのメンション）', () => {
  it('他のエンティティのメモで言及されているだけの場所も削除できず、ケースを変更しない', () => {
    // 前提: 湖畔駅は証言からは参照されておらず、管理人のメモだけが言及している
    useCaseStore.getState().upsertMany([
      { key: 'places', entity: { id: 'place-station', name: '湖畔駅' } },
      {
        key: 'persons',
        entity: { id: 'person-caretaker', name: '管理人', kind: 'individual', note: '@[湖畔駅](place:place-station)の近くに住んでいる。' },
      },
    ]);
    const caseBeforeDeletion = getOpenCase();

    expect(() => useCaseStore.getState().remove('places', 'place-station')).toThrow(
      '他のデータから参照されているため削除できません'
    );
    expect(getOpenCase()).toEqual(caseBeforeDeletion);
  });
});

describe('ブラウザへの保存', () => {
  it('ケースを変更すると、そのケースのキーへ保存する', () => {
    useCaseStore.getState().upsert('claims', newClaim);

    expect(loadCase(sampleFictionalCase.id).claims.map((claim) => claim.id)).toContain('claim-postman');
  });

  it('開いていないケースは書き換えない', () => {
    const otherCaseId = useCaseStore.getState().createCase('別のケース');

    useCaseStore.getState().upsert('claims', newClaim);

    expect(loadCase(otherCaseId).claims).toEqual([]);
  });
});

describe('時系列ボードの並び順', () => {
  /** 警察の捜索（8月15日）についての証言です。 */
  const searchGuess: Claim = {
    id: 'claim-police-search',
    speaker: { kind: 'user' },
    viaPersonIds: [],
    content: '警察が別荘を捜索したはずだ。',
    mentionedPersonIds: [],
    when: '1998-08-15',
  };

  it('項目を動かすと、並び順を保存する', () => {
    // 前提: サンプルの並びは、管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測（日時なし）
    useCaseStore.getState().moveTimelineItem('claim:claim-user-guess', 0);

    expect(getOpenCase().timelineOrder).toEqual([
      'claim:claim-user-guess',
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
    ]);
  });

  it('日時と矛盾する位置へは動かせず、ケースを変更しない', () => {
    // 前提: サンプルの証言は8月12日、捜索の推測は8月15日について述べている
    useCaseStore.getState().upsert('claims', searchGuess);
    const beforeChange = getOpenCase();

    expect(() => useCaseStore.getState().moveTimelineItem('claim:claim-police-search', 0)).toThrow('日時と矛盾するため');
    expect(getOpenCase()).toBe(beforeChange);
  });

  it('証言に日時を入力して現在の位置と矛盾した場合は、最も近い矛盾しない位置へ動かす', () => {
    // 前提: 並びは サンプルの証言（8月12日）→ ユーザーの推測（日時なし）→ 捜索の推測（8月15日）
    useCaseStore.getState().upsert('claims', searchGuess);

    // 末尾の捜索の推測の日時を、サンプルの証言より前の「8月10日」に直す
    useCaseStore.getState().upsert('claims', { ...searchGuess, when: '1998-08-10' });

    expect(getOpenCase().timelineOrder).toEqual([
      'claim:claim-police-search',
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });

  it('upsertMany に並び順の移動を渡すと、要素の保存と移動を1回で反映する', () => {
    // 前提: サンプルの並びは、管理人 → 防犯カメラ → 隣家の住人 → 架空日報 → ユーザーの推測（日時なし）
    useCaseStore.getState().upsertMany([{ key: 'claims', entity: newClaim }], {
      key: 'claim:claim-postman',
      toIndex: 3,
    });

    expect(loadCase(sampleFictionalCase.id).timelineOrder).toEqual([
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-postman',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });

  it('upsertMany に渡した移動が日時と矛盾する場合は、拒否せずに、最も近い矛盾しない位置に置いて保存する', () => {
    // 前提: サンプルの証言は8月12日、捜索の推測は8月15日について述べている。先頭（位置0）は8月12日の証言より前になる
    useCaseStore.getState().upsertMany([{ key: 'claims', entity: searchGuess }], {
      key: 'claim:claim-police-search',
      toIndex: 0,
    });

    const caseData = loadCase(sampleFictionalCase.id);
    expect(caseData.claims.map((claim) => claim.id)).toContain('claim-police-search');
    // 検証: 8月12日の証言（最後は隣家の住人）がすべて前に来る位置のうち、指定した先頭に最も近い位置に置く
    expect(caseData.timelineOrder).toEqual([
      'claim:claim-caretaker',
      'claim:claim-police-camera',
      'claim:claim-neighbor',
      'claim:claim-police-search',
      'claim:claim-report',
      'claim:claim-user-guess',
    ]);
  });
});

describe('人物の動きの列の並び順', () => {
  it('列を動かすと、並び順を保存する', () => {
    // 前提: サンプルの人物の登録順は、別荘の持ち主 → 隣家の住人 → 管理人 → …
    useCaseStore.getState().movePersonLane('person-caretaker', 'person-owner');

    expect(getOpenCase().personLaneOrder.slice(0, 3)).toEqual(['person-caretaker', 'person-owner', 'person-neighbor']);
  });

  it('存在しない人物は動かせず、ケースを変更しない', () => {
    const beforeChange = getOpenCase();

    expect(() => useCaseStore.getState().movePersonLane('person-deleted', 'person-owner')).toThrow('人物が見つかりません');
    expect(getOpenCase()).toBe(beforeChange);
  });
});
