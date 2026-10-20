/**
 * 資料の本文を、ケースから取り除くロジックのテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from './sample-fictional-case';
import { withoutTranscripts } from './transcript-separation';
import type { Case } from './types';

describe('withoutTranscripts', () => {
  it('資料の本文だけを取り除き、資料のほかの項目とケースのほかの一覧は残す', () => {
    const target: Case = {
      ...sampleFictionalCase,
      interviews: [
        { id: 'interview-newspaper', title: '湖畔新聞の記事', url: 'https://news.example.com/kohan', transcript: '管理人は車の音を聞いたと話した。' },
        { id: 'interview-memo', title: '本文の無いメモ' },
      ],
    };

    expect(withoutTranscripts(target)).toEqual({
      ...sampleFictionalCase,
      interviews: [
        { id: 'interview-newspaper', title: '湖畔新聞の記事', url: 'https://news.example.com/kohan' },
        { id: 'interview-memo', title: '本文の無いメモ' },
      ],
    });
  });

  it('元のケースは書き換えない', () => {
    const target: Case = { ...sampleFictionalCase, interviews: [{ id: 'interview-newspaper', transcript: '管理人の話' }] };

    withoutTranscripts(target);

    expect(target.interviews[0]!.transcript).toBe('管理人の話');
  });
});
