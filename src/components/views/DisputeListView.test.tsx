/**
 * 論点の一覧（ボードの「論点」タブ）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Case } from '@/domain/types';
import { resetMockNavigation } from '@/test/mock-navigation';
import { DisputeListView } from './DisputeListView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** サンプルのケースに、解決済みの論点を1件加えたケースです。 */
const caseWithResolvedDispute: Case = {
  ...sampleFictionalCase,
  disputes: [
    ...sampleFictionalCase.disputes,
    { id: 'dispute-report-date', title: '連絡が取れなくなった日', claimIds: ['claim-report'], resolved: true },
  ],
};

beforeEach(() => {
  // 前提: サンプルのケースには、管理人・防犯カメラ・隣家の住人の証言を束ねた未解決の論点が1件ある
  resetMockNavigation('/cases/case-lakeside?tab=disputes');
});

describe('DisputeListView', () => {
  it('未解決の論点を、束ねた証言の件数と発言者とともに、論点の詳細へのリンクで並べる', () => {
    render(<DisputeListView target={caseWithResolvedDispute} />);

    const list = screen.getByRole('list', { name: '未解決の論点の一覧' });
    const [item] = within(list).getAllByRole('listitem');
    expect(within(item!).getByRole('link', { name: '12日夜、持ち主は別荘にいたか' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/disputes/dispute-villa-presence?tab=disputes'
    );
    expect(item).toHaveTextContent('証言3件');
    expect(item).toHaveTextContent('管理人・県道の防犯カメラ・隣家の住人');
    // 検証: 解決済みの論点は、未解決の一覧には並べない
    expect(within(list).queryByText('連絡が取れなくなった日')).not.toBeInTheDocument();
  });

  it('解決済みの論点を、別の一覧に区別して並べる', () => {
    render(<DisputeListView target={caseWithResolvedDispute} />);

    const list = screen.getByRole('list', { name: '解決済みの論点の一覧' });
    expect(within(list).getByRole('link', { name: '連絡が取れなくなった日' })).toBeInTheDocument();
  });

  it('論点を追加するページへのリンクを置く', () => {
    render(<DisputeListView target={sampleFictionalCase} />);

    expect(screen.getByRole('link', { name: '論点を追加' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/disputes/new?tab=disputes'
    );
  });

  it('論点が1件も無い場合は、作り方を案内する文を表示する', () => {
    render(<DisputeListView target={{ ...sampleFictionalCase, disputes: [] }} />);

    expect(screen.getByText(/まだ論点がありません/)).toBeInTheDocument();
  });
});
