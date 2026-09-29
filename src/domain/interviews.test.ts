/**
 * 聴取（Interview）を、人物の詳細の「供述の変遷」と証言のフォームに表示する形へ導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildPersonInterviews, formatInterviewLabel } from './interviews';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case, Claim, Interview } from './types';

/** 管理人への県警の初回の聴取です（事件の翌日）。 */
const 初回の聴取: Interview = {
  id: 'interview-first',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-police',
  at: '1998-08-13T10:00',
  placeId: 'place-villa',
  subjectRole: '参考人',
  documentRef: '供述調書 第1号',
};

/** 20年後の、書籍の著者による取材です。 */
const 書籍の取材: Interview = {
  id: 'interview-book',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 日時の分からない聴取です。 */
const 日時不明の聴取: Interview = { id: 'interview-unknown', subjectPersonId: 'person-caretaker' };

/** 管理人とは別の人物（隣家の住人）の聴取です。 */
const 隣家の住人の聴取: Interview = { id: 'interview-neighbor', subjectPersonId: 'person-neighbor', at: '1998-08-13' };

/** 初回の聴取で、管理人が述べた証言です（書籍の証言と見回りの時刻が食い違います）。 */
const 初回の供述: Claim = {
  id: 'claim-caretaker-first',
  speaker: { kind: 'person', personIds: ['person-caretaker'] },
  viaPersonIds: ['person-police'],
  content: '見回りは夜10時ごろで、別荘には明かりがついていた。',
  mentionedPersonIds: [],
  interviewId: 初回の聴取.id,
};

/** 登録順を、日時の順とわざと逆にしたケースです（日時不明 → 書籍 → 初回 → 隣家の住人）。 */
const ケース: Case = {
  ...sampleFictionalCase,
  interviews: [日時不明の聴取, 書籍の取材, 初回の聴取, 隣家の住人の聴取],
  claims: [
    ...sampleFictionalCase.claims.map((claim) =>
      claim.id === 'claim-caretaker' ? { ...claim, interviewId: 書籍の取材.id } : claim
    ),
    初回の供述,
  ],
};

describe('buildPersonInterviews', () => {
  it('その人物が相手の聴取だけを、日時の早い順に並べ、日時の分からない聴取は最後に並べる', () => {
    const 聴取の一覧 = buildPersonInterviews(ケース, 'person-caretaker');

    expect(聴取の一覧.map((view) => view.interview.id)).toEqual(['interview-first', 'interview-book', 'interview-unknown']);
  });

  it('各聴取に、ひもづく証言・聴取者・場所を添える', () => {
    const [初回, 書籍, 日時不明] = buildPersonInterviews(ケース, 'person-caretaker');

    expect(初回?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker-first']);
    expect(初回?.interviewer?.name).toBe('県警');
    expect(初回?.place?.name).toBe('湖畔の別荘');
    expect(書籍?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(日時不明?.claims).toEqual([]);
    expect(日時不明?.interviewer).toBeUndefined();
    expect(日時不明?.place).toBeUndefined();
  });

  it('聴取の相手でない人物では、空の一覧を返す', () => {
    expect(buildPersonInterviews(ケース, 'person-owner')).toEqual([]);
  });
});

describe('formatInterviewLabel', () => {
  it('相手・日時・聴取者の名前をつないだ名前を返す', () => {
    expect(formatInterviewLabel(ケース, 初回の聴取)).toBe('管理人・1998年8月13日 10:00・県警');
  });

  it('日時の分からない聴取は「日時不明」と示し、聴取者の無い聴取は聴取者を省く', () => {
    expect(formatInterviewLabel(ケース, 日時不明の聴取)).toBe('管理人・日時不明');
  });
});
