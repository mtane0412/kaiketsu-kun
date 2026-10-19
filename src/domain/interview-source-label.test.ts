/**
 * 資料（聴取）の短い表示を組み立てるロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { formatInterviewSourceLabel } from './interview-source-label';
import { sampleFictionalCase } from './sample-fictional-case';
import type { Interview } from './types';

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

/** 日時の分からない、URLだけを登録した資料です。 */
const undatedInterview: Interview = { id: 'interview-unknown', url: 'https://example.com/articles/lake' };

describe('formatInterviewSourceLabel', () => {
  it('媒体の名前と日時をつなぎ、資料の格を添える', () => {
    // 前提: 県警が聴取した、格が「一次資料」の調書
    expect(formatInterviewSourceLabel(sampleFictionalCase, { ...firstInterview, grade: 'primary' })).toBe('県警 1998年8月13日 10:00・一次資料');
  });

  it('原典を持つ（転載の）資料は、原典の媒体と発行日を示し、転載であることを添える', () => {
    // 前提: 書籍の著者のブログ（2018年5月）に転載された、架空日報の朝刊（1998年8月14日）の記事
    const reprint: Interview = {
      id: 'interview-reprint',
      title: '架空日報の記事の転載',
      interviewerPersonId: 'person-book',
      at: '2018-05',
      origin: { publisherPersonId: 'person-newspaper', publishedAt: '1998-08-14', citation: '社会面' },
      grade: 'majorReport',
    };
    expect(formatInterviewSourceLabel(sampleFictionalCase, reprint)).toBe('架空日報 朝刊 1998年8月14日・主要報道・転載');
  });

  it('原典の媒体や発行日が無い場合は、資料自身の媒体と日時で補う', () => {
    // 前提: 原典は紙面の書誌だけが分かっている
    const reprint: Interview = { id: 'interview-reprint', interviewerPersonId: 'person-book', at: '2018-05', origin: { citation: '朝刊 社会面' } };
    expect(formatInterviewSourceLabel(sampleFictionalCase, reprint)).toBe('湖畔の夏 20年目の証言（架空の書籍） 2018年5月・転載');
  });

  it('媒体も日時も無い資料は、資料の名前（タイトル・URL・無題の資料）を示す', () => {
    expect(formatInterviewSourceLabel(sampleFictionalCase, { id: 'interview-title-only', title: '隣家の住人の話', grade: 'unverified' })).toBe(
      '隣家の住人の話・未確認'
    );
    expect(formatInterviewSourceLabel(sampleFictionalCase, undatedInterview)).toBe('https://example.com/articles/lake');
    expect(formatInterviewSourceLabel(sampleFictionalCase, { id: 'interview-empty' })).toBe('無題の資料');
  });
});
