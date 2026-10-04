/**
 * ケースのJSONファイルの検証（AIエージェントが作ったJSONを、アプリに読み込む前に確かめる）のテスト
 */
import { describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { validateCaseFile } from './case-file-validation';

/** ケースをJSONの文字列にします。 */
function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

describe('validateCaseFile', () => {
  it('現在の形式の正しいケースを受け付け、件数の要約を返す', () => {
    const result = validateCaseFile(toJsonText(sampleFictionalCase));

    expect(result.ok).toBe(true);
    expect(result.ok && result.summary).toContain(`証言 ${sampleFictionalCase.claims.length}件`);
  });

  it('JSONとして読めない文字列は、読めない理由を返す', () => {
    const result = validateCaseFile('{ "name": "別荘の事件", ');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors[0]).toContain('JSONとして読めません');
  });

  it('アプリの読み込みで拒否されるデータは、拒否の理由を返す', () => {
    // 前提: 証言の発言者が、ケースに登録されていない人物を指している
    const caseData = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim, index) =>
        index === 0 ? { ...claim, speaker: { kind: 'person', personId: 'person-unknown' } } : claim
      ),
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join('\n')).toContain('person-unknown');
  });

  it('現在の形式に無い項目は、読み込みで捨てられるため誤りとして返す', () => {
    // 前提: 証言に、以前の形式の項目（statedAt）が残っている
    const caseData = {
      ...sampleFictionalCase,
      claims: sampleFictionalCase.claims.map((claim, index) =>
        index === 0 ? { ...claim, statedAt: '1998-08-13' } : claim
      ),
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('claims.0.statedAt'));
  });

  it('読み込みで補われる項目の省略は、現在の形式ではないため誤りとして返す', () => {
    // 前提: 未了事項の一覧（tasks）を省略している
    const { tasks: _tasks, ...caseWithoutTasks } = sampleFictionalCase;

    const result = validateCaseFile(toJsonText(caseWithoutTasks));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('tasks'));
  });

  it('本文のメンションと食い違う言及・場所・日時は、アプリが保存しない状態のため誤りとして返す', () => {
    // 前提: 本文に人物のメンションが無いのに、言及している人物を持たせている
    const caseData = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-mismatch',
          speaker: { kind: 'user' },
          viaPersonIds: [],
          content: '持ち主は庭にいたはずだ。',
          mentionedPersonIds: ['person-owner'],
        },
      ],
      timelineOrder: [...sampleFictionalCase.timelineOrder, 'claim:claim-mismatch'],
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('claim-mismatch'));
  });

  it('引用が資料の本文に一字一句含まれていない証言は、原文に裏付けられないため誤りとして返す', () => {
    // 前提: 記事の本文に無い文言を、引用として持たせている
    const caseData = {
      ...sampleFictionalCase,
      interviews: [
        {
          id: 'interview-article',
          title: '別荘の事件の続報',
          transcript: '隣家の住人は「夜9時ごろ、庭に人影を見た」と話した。',
        },
      ],
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-misquoted',
          speaker: { kind: 'person', personIds: ['person-neighbor'] },
          viaPersonIds: [],
          content: '夜10時ごろ、庭に人影を見た。',
          mentionedPersonIds: [],
          interviewId: 'interview-article',
          quote: { text: '夜10時ごろ、庭に人影を見た' },
        },
      ],
      timelineOrder: [...sampleFictionalCase.timelineOrder, 'claim:claim-misquoted'],
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('claim-misquoted'));
  });

  it('同じIDの証言が2件ある場合は、並び順に1回だけ載っていても誤りとして返す', () => {
    // 前提: 登録済みの隣家の住人の証言（claim-neighbor）と同じIDで、内容の違う証言をもう1件書いている
    const caseData = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-neighbor',
          speaker: { kind: 'user' },
          viaPersonIds: [],
          content: '持ち主は夜10時に別荘を出たはずだ。',
          mentionedPersonIds: [],
        },
      ],
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('claims: ID claim-neighbor が2回以上使われています'));
  });

  it('同じIDの人物が2件ある場合は、誤りとして返す', () => {
    // 前提: 別の人物に、登録済みの別荘の持ち主（person-owner）と同じIDを付けている
    const caseData = {
      ...sampleFictionalCase,
      persons: [...sampleFictionalCase.persons, { id: 'person-owner', name: '別荘の持ち主の弟', kind: 'individual' }],
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('persons: ID person-owner が2回以上使われています'));
  });

  it('時系列の並び順に載っていない証言は、誤りとして返す', () => {
    // 前提: 並び順から最後の証言を落としている
    const caseData = { ...sampleFictionalCase, timelineOrder: sampleFictionalCase.timelineOrder.slice(0, -1) };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringContaining('timelineOrder'));
  });

  it('日時と矛盾する時系列の並び順は、誤りとして返す', () => {
    // 前提: 日時を持つ2件の証言を、後の日時の証言が先に来るよう並べている
    const caseData = {
      ...sampleFictionalCase,
      claims: [
        ...sampleFictionalCase.claims,
        {
          id: 'claim-later',
          speaker: { kind: 'user' },
          viaPersonIds: [],
          content: '@[2000年](date:2000) に別荘は売りに出された。',
          mentionedPersonIds: [],
          when: '2000',
        },
        {
          id: 'claim-earlier',
          speaker: { kind: 'user' },
          viaPersonIds: [],
          content: '@[1990年](date:1990) に別荘が建てられた。',
          mentionedPersonIds: [],
          when: '1990',
        },
      ],
      timelineOrder: [...sampleFictionalCase.timelineOrder, 'claim:claim-later', 'claim:claim-earlier'],
    };

    const result = validateCaseFile(toJsonText(caseData));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toContainEqual(expect.stringMatching(/claim-later.*claim-earlier/));
  });
});
