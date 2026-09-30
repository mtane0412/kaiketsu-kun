/**
 * 聴取（Interview）を、人物の詳細の「供述の変遷」と証言のフォームに表示する形へ導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildPersonInterviews, formatInterviewLabel } from './interviews';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case, Claim, Interview } from './types';

/** 管理人への県警の初回の聴取です（事件の翌日）。 */
const firstInterview: Interview = {
  id: 'interview-first',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-police',
  at: '1998-08-13T10:00',
  placeId: 'place-villa',
  subjectRole: '参考人',
  documentRef: '供述調書 第1号',
};

/** 20年後の、書籍の著者による取材です。 */
const bookInterview: Interview = {
  id: 'interview-book',
  subjectPersonId: 'person-caretaker',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 日時の分からない聴取です。 */
const undatedInterview: Interview = { id: 'interview-unknown', subjectPersonId: 'person-caretaker' };

/** 管理人とは別の人物（隣家の住人）の聴取です。 */
const neighborInterview: Interview = { id: 'interview-neighbor', subjectPersonId: 'person-neighbor', at: '1998-08-13' };

/** 初回の聴取で、管理人が述べた証言です（書籍の証言と見回りの時刻が食い違います）。 */
const firstStatement: Claim = {
  id: 'claim-caretaker-first',
  speaker: { kind: 'person', personIds: ['person-caretaker'] },
  viaPersonIds: ['person-police'],
  content: '見回りは夜10時ごろで、別荘には明かりがついていた。',
  mentionedPersonIds: [],
  interviewId: firstInterview.id,
};

/** 登録順を、日時の順とわざと逆にしたケースです（日時不明 → 書籍 → 初回 → 隣家の住人）。 */
const caseData: Case = {
  ...sampleFictionalCase,
  interviews: [undatedInterview, bookInterview, firstInterview, neighborInterview],
  claims: [
    ...sampleFictionalCase.claims.map((claim) =>
      claim.id === 'claim-caretaker' ? { ...claim, interviewId: bookInterview.id } : claim
    ),
    firstStatement,
  ],
};

describe('buildPersonInterviews', () => {
  it('その人物が相手の聴取だけを、日時の早い順に並べ、日時の分からない聴取は最後に並べる', () => {
    const interviewList = buildPersonInterviews(caseData, 'person-caretaker');

    expect(interviewList.map((view) => view.interview.id)).toEqual(['interview-first', 'interview-book', 'interview-unknown']);
  });

  it('各聴取に、ひもづく証言・聴取者・場所を添える', () => {
    const [first, book, undated] = buildPersonInterviews(caseData, 'person-caretaker');

    expect(first?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker-first']);
    expect(first?.interviewer?.name).toBe('県警');
    expect(first?.place?.name).toBe('湖畔の別荘');
    expect(book?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(undated?.claims).toEqual([]);
    expect(undated?.interviewer).toBeUndefined();
    expect(undated?.place).toBeUndefined();
  });

  it('聴取の相手でない人物では、空の一覧を返す', () => {
    expect(buildPersonInterviews(caseData, 'person-owner')).toEqual([]);
  });
});

describe('formatInterviewLabel', () => {
  it('相手・日時・聴取者の名前をつないだ名前を返す', () => {
    expect(formatInterviewLabel(caseData, firstInterview)).toBe('管理人・1998年8月13日 10:00・県警');
  });

  it('日時の分からない聴取は「日時不明」と示し、聴取者の無い聴取は聴取者を省く', () => {
    expect(formatInterviewLabel(caseData, undatedInterview)).toBe('管理人・日時不明');
  });
});
