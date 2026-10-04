/**
 * 聴取（Interview）を、人物の詳細の「供述の変遷」と証言のフォームに表示する形へ導出するロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { buildInterviewList, buildInterviewView, buildPersonInterviews, formatInterviewLabel } from './interviews';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Case, Claim, Interview } from './types';

/** 管理人への県警の初回の聴取です（事件の翌日）。 */
const firstInterview: Interview = {
  id: 'interview-first',
  title: '管理人の供述調書',
  interviewerPersonId: 'person-police',
  at: '1998-08-13T10:00',
  placeId: 'place-villa',
  subjectRole: '参考人',
  documentRef: '供述調書 第1号',
};

/** 20年後の、書籍の著者による取材です。 */
const bookInterview: Interview = {
  id: 'interview-book',
  title: '湖畔の夏 第3章',
  interviewerPersonId: 'person-book',
  at: '2018-05',
};

/** 日時の分からない、URLだけを登録した資料です。 */
const undatedInterview: Interview = { id: 'interview-unknown', url: 'https://example.com/articles/lake' };

/** 隣家の住人の発言が載った記事です。 */
const neighborInterview: Interview = { id: 'interview-neighbor', title: '隣家の住人の話', at: '1998-08-13' };

/** 初回の聴取で、管理人が述べた証言です（書籍の証言と見回りの時刻が食い違います）。 */
const firstStatement: Claim = {
  id: 'claim-caretaker-first',
  speaker: { kind: 'person', personIds: ['person-caretaker'] },
  viaPersonIds: ['person-police'],
  content: '見回りは夜10時ごろで、別荘には明かりがついていた。',
  mentionedPersonIds: [],
  interviewId: firstInterview.id,
};

/** 記事に載った、隣家の住人の証言です。 */
const neighborStatement: Claim = {
  id: 'claim-neighbor-article',
  speaker: { kind: 'person', personIds: ['person-neighbor'] },
  viaPersonIds: [],
  content: '夜9時ごろ、別荘のほうで車の音がした。',
  mentionedPersonIds: [],
  interviewId: neighborInterview.id,
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
    neighborStatement,
  ],
};

describe('buildPersonInterviews', () => {
  it('その人物が発言者の証言を含む資料だけを、日時の早い順に並べる', () => {
    const interviewList = buildPersonInterviews(caseData, 'person-caretaker');

    expect(interviewList.map((view) => view.interview.id)).toEqual(['interview-first', 'interview-book']);
  });

  it('各資料に、ひもづく証言・聴取者・場所を添える', () => {
    const [first, book] = buildPersonInterviews(caseData, 'person-caretaker');

    expect(first?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker-first']);
    expect(first?.interviewer?.name).toBe('県警');
    expect(first?.place?.name).toBe('湖畔の別荘');
    expect(book?.claims.map((view) => view.claim.id)).toEqual(['claim-caretaker']);
    expect(book?.place).toBeUndefined();
  });

  it('経由に含まれるだけの人物の供述の変遷には並べない（その人物の供述ではないため）', () => {
    // 前提: 県警は初回の聴取の証言の経由にだけ含まれる
    expect(buildPersonInterviews(caseData, 'person-police').map((view) => view.interview.id)).not.toContain('interview-first');
  });

  it('発言者が複数の資料は、発言者のどの人物の供述の変遷にも並べる', () => {
    expect(buildPersonInterviews(caseData, 'person-neighbor').map((view) => view.interview.id)).toEqual(['interview-neighbor']);
  });

  it('証言の無い人物では、空の一覧を返す', () => {
    expect(buildPersonInterviews(caseData, 'person-owner')).toEqual([]);
  });
});

describe('buildInterviewView', () => {
  it('1件の資料に、証言の発言者・ひもづく証言・聴取者・場所を添える', () => {
    const view = buildInterviewView(caseData, 'interview-first');

    expect(view?.speakers.map((person) => person.name)).toEqual(['管理人']);
    expect(view?.claims.map((claimView) => claimView.claim.id)).toEqual(['claim-caretaker-first']);
    expect(view?.interviewer?.name).toBe('県警');
    expect(view?.place?.name).toBe('湖畔の別荘');
  });

  it('発言者は、証言の並び順で最初に現れた順に、重ねずに並べる', () => {
    // 前提: 記事に、隣家の住人の証言のあとに、管理人と隣家の住人がそろって述べた証言が載っている
    const jointStatement: Claim = {
      ...neighborStatement,
      id: 'claim-joint',
      speaker: { kind: 'person', personIds: ['person-caretaker', 'person-neighbor'] },
      content: '二人とも、その夜は花火の音を聞いていない。',
    };
    const target: Case = {
      ...caseData,
      claims: [...caseData.claims, jointStatement],
      timelineOrder: [...caseData.timelineOrder, `claim:${neighborStatement.id}`, `claim:${jointStatement.id}`],
    };

    expect(buildInterviewView(target, 'interview-neighbor')?.speakers.map((person) => person.name)).toEqual(['隣家の住人', '管理人']);
  });

  it('証言の無い資料では、発言者を空にする', () => {
    expect(buildInterviewView(caseData, 'interview-unknown')?.speakers).toEqual([]);
  });

  it('ケースに無い資料では undefined を返す（URLの直接入力や、削除済みの資料のため）', () => {
    expect(buildInterviewView(caseData, 'interview-gone')).toBeUndefined();
  });
});

describe('buildInterviewList', () => {
  it('ケースのすべての資料を日時の早い順に並べ、日時の分からない資料は最後に並べる', () => {
    // 日付だけの「1998-08-13」は、同じ日の「1998-08-13T10:00」より前に並ぶ（compareTimeRef は区間の始まりで比べる）
    expect(buildInterviewList(caseData).map((view) => view.interview.id)).toEqual([
      'interview-neighbor',
      'interview-first',
      'interview-book',
      'interview-unknown',
    ]);
  });
});

describe('formatInterviewLabel', () => {
  it('タイトル・日時・聴取者の名前をつないだ名前を返す', () => {
    expect(formatInterviewLabel(caseData, firstInterview)).toBe('管理人の供述調書・1998年8月13日 10:00・県警');
  });

  it('日時の分からない資料は日時を省き、聴取者の無い資料は聴取者を省く', () => {
    expect(formatInterviewLabel(caseData, { id: 'interview-title-only', title: '隣家の住人の話' })).toBe('隣家の住人の話');
  });

  it('タイトルの無い資料は、URLを名前にする', () => {
    expect(formatInterviewLabel(caseData, undatedInterview)).toBe('https://example.com/articles/lake');
  });

  it('タイトルもURLも無い資料は「無題の資料」と示す', () => {
    expect(formatInterviewLabel(caseData, { id: 'interview-empty', at: '1998-08-14' })).toBe('無題の資料・1998年8月14日');
  });
});
