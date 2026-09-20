/**
 * 主張の入力フォームのテスト
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { useCaseStore } from '@/stores/useCaseStore';
import { ClaimForm } from './ClaimForm';

beforeEach(() => {
  useCaseStore.getState().replaceCase(sampleFictionalCase);
});

/** 現在の案件に登録されている主張の内容の一覧を返します。 */
function savedContents(): string[] {
  return useCaseStore.getState().currentCase.claims.map((claim) => claim.content);
}

describe('ClaimForm', () => {
  it('人物の証言を、ソース・出来事・言及している人物とともに保存する', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ClaimForm onDone={onDone} />);

    await user.selectOptions(screen.getByLabelText('発言者'), '隣家の住人');
    await user.selectOptions(screen.getByLabelText('ソース'), '架空日報 朝刊');
    await user.type(screen.getByLabelText('内容'), '翌朝、郵便受けに新聞が残ったままだった。');
    await user.selectOptions(screen.getByLabelText('対象の出来事'), '持ち主が最後に目撃された');
    await user.click(screen.getByRole('checkbox', { name: '別荘の持ち主' }));
    await user.type(screen.getByLabelText('証言が述べる日時：最も早い時点'), '1998-08-13');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const saved = useCaseStore.getState().currentCase.claims.at(-1);
    expect(saved).toMatchObject({
      speaker: { kind: 'person', personId: 'person-neighbor' },
      sourceId: 'source-newspaper',
      content: '翌朝、郵便受けに新聞が残ったままだった。',
      eventId: 'event-last-seen',
      mentionedPersonIds: ['person-owner'],
      when: { text: '1998-08-13', earliest: '1998-08-13' },
      assessment: 'unverified',
    });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('人物の証言でソースを選んでいない場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('発言者'), '管理人');
    await user.type(screen.getByLabelText('内容'), '出どころを示せない証言。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('ユーザーの推測以外の主張にはソースを選択してください');
    expect(savedContents()).not.toContain('出どころを示せない証言。');
  });

  it('ユーザーの推測は、ソースなしで保存できる', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('発言者'), 'ユーザーの推測');
    await user.type(screen.getByLabelText('内容'), '隣家の住人は時刻を勘違いしているのではないか。');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const saved = useCaseStore.getState().currentCase.claims.at(-1);
    expect(saved?.speaker).toEqual({ kind: 'user' });
    expect(saved?.sourceId).toBeUndefined();
  });

  it('解釈できない日時を入力した場合は、エラーを示して保存しない', async () => {
    const user = userEvent.setup();
    render(<ClaimForm onDone={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('発言者'), 'ユーザーの推測');
    await user.type(screen.getByLabelText('内容'), '日時の書き方を間違えた推測。');
    await user.type(screen.getByLabelText('述べられた時点：最も早い時点'), '1998年8月');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    expect(screen.getByRole('alert')).toHaveTextContent('述べられた時点');
    expect(savedContents()).not.toContain('日時の書き方を間違えた推測。');
  });

  it('既存の主張を編集すると、同じIDのまま置き換える', async () => {
    const user = userEvent.setup();
    const 隣家の証言 = sampleFictionalCase.claims[1]!;
    render(<ClaimForm initial={隣家の証言} onDone={vi.fn()} />);

    await user.selectOptions(screen.getByLabelText('評価'), '疑わしい');
    await user.click(screen.getByRole('button', { name: '主張を保存' }));

    const { claims } = useCaseStore.getState().currentCase;
    expect(claims).toHaveLength(sampleFictionalCase.claims.length);
    expect(claims.find((claim) => claim.id === 隣家の証言.id)).toEqual({ ...隣家の証言, assessment: 'doubtful' });
  });
});
