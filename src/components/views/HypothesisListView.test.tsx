/**
 * 仮説の一覧（ボードの「仮説」タブ）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { HypothesisListView } from './HypothesisListView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  // 前提: サンプルのケースには、検討中の「管理人が失踪に関わっている」と、否定された「持ち主は19時より前に別荘を離れた」がある
  resetMockNavigation('/cases/case-lakeside?tab=hypotheses');
});

describe('HypothesisListView', () => {
  it('否定されていない仮説を、状態・支える証言と反する証言の件数・対象の人物とともに並べる', () => {
    render(<HypothesisListView target={sampleFictionalCase} />);

    const list = screen.getByRole('list', { name: '仮説の一覧' });
    const [caretakerHypothesis] = within(list).getAllByRole('listitem');
    expect(within(caretakerHypothesis!).getByRole('link', { name: /管理人が失踪に関わっている/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/hypotheses/hypothesis-caretaker?tab=hypotheses'
    );
    expect(caretakerHypothesis).toHaveTextContent('検討中');
    expect(caretakerHypothesis).toHaveTextContent('支える証言 1件');
    expect(caretakerHypothesis).toHaveTextContent('反する証言 0件');
    expect(caretakerHypothesis).toHaveTextContent('対象: 管理人');
    // 検証: 否定された仮説は、否定されていない仮説の一覧には並べない
    expect(within(list).queryByText(/持ち主は19時より前に別荘を離れた/)).not.toBeInTheDocument();
  });

  it('否定された仮説を、否定の理由とともに、別の一覧に区別して残す', () => {
    render(<HypothesisListView target={sampleFictionalCase} />);

    const rejectedHypothesis = screen.getByRole('list', { name: '否定された仮説の一覧' });
    const [item] = within(rejectedHypothesis).getAllByRole('listitem');
    expect(within(item!).getByRole('link', { name: /持ち主は19時より前に別荘を離れた/ })).toBeInTheDocument();
    expect(item).toHaveTextContent('否定された');
    expect(item).toHaveTextContent('20:10に持ち主の車が別荘の方向へ走り');
  });

  it('仮説を登録するページへのリンクを置く', () => {
    render(<HypothesisListView target={sampleFictionalCase} />);

    expect(screen.getByRole('link', { name: '仮説を追加' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/hypotheses/new?tab=hypotheses'
    );
  });

  it('第三者の説には、主唱者と唱えた時期、主唱者の最新の立場の変化を添え、読み手自身の仮説と区別する', () => {
    // 前提: 架空の書籍が2018年に唱え、2020年5月に撤回した説を加えたケース
    const caseWithTheory = {
      ...sampleFictionalCase,
      hypotheses: [
        ...sampleFictionalCase.hypotheses,
        {
          id: 'hypothesis-book-theory',
          title: '持ち主は自分で姿を消した',
          status: 'open' as const,
          supportingClaimIds: [],
          opposingClaimIds: [],
          targets: [],
          proponentPersonId: 'person-book',
          proposedAt: '2018',
          stanceChanges: [{ id: 'stance-withdrawn', kind: 'withdrawn' as const, at: '2020-05', basisClaimIds: [] }],
        },
      ],
    };
    render(<HypothesisListView target={caseWithTheory} />);

    const [readerHypothesis, bookTheory] = within(screen.getByRole('list', { name: '仮説の一覧' })).getAllByRole('listitem');
    expect(bookTheory).toHaveTextContent('主唱者: 湖畔の夏 20年目の証言（架空の書籍）（2018年）');
    expect(bookTheory).toHaveTextContent('主唱者が撤回（2020年5月）');
    // 検証: 読み手自身の仮説には、主唱者を示さない
    expect(readerHypothesis).not.toHaveTextContent('主唱者');
  });

  it('仮説が1件も無い場合は、登録を促す案内を表示する', () => {
    render(<HypothesisListView target={{ ...sampleFictionalCase, hypotheses: [] }} />);

    expect(screen.getByText(/まだ仮説がありません/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '仮説の一覧' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: '否定された仮説の一覧' })).not.toBeInTheDocument();
  });
});
