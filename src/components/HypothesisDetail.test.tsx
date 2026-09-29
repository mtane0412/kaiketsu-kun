/**
 * 仮説の詳細・登録ページ（仮説の編集・削除・状態の変更、支える証言・反する証言のひもづけ、
 * 対象の人物ごとの動機・機会・手段の表）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import type { Hypothesis } from '@/domain/types';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { openedCase, openTestCase } from '@/test/open-case';
import { HypothesisDetail, NewHypothesisDetail } from './HypothesisDetail';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: 「管理人が失踪に関わっている」は検討中で、支える証言にユーザーの推測をひもづけ、
  // 管理人を対象に、動機にユーザーの推測、機会に管理人の証言をひもづけている
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/hypotheses/hypothesis-caretaker?tab=hypotheses');
});

/** 開いているケースから、管理人の仮説を取り出します。 */
function 管理人の仮説(): Hypothesis {
  const hypothesis = openedCase().hypotheses.find((candidate) => candidate.id === 'hypothesis-caretaker');
  if (!hypothesis) throw new Error('管理人の仮説が見つかりません');
  return hypothesis;
}

describe('HypothesisDetail（仮説の編集）', () => {
  it('見出しと状態を変えて保存できる', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const 編集 = screen.getByRole('region', { name: '仮説の編集' });
    const 見出し = within(編集).getByRole('textbox', { name: '見出し' });
    await user.clear(見出し);
    await user.type(見出し, '管理人が持ち主を連れ出した');
    await user.click(within(編集).getByRole('radio', { name: '有力' }));
    await user.click(within(編集).getByRole('button', { name: '仮説を保存' }));

    expect(管理人の仮説()).toMatchObject({ title: '管理人が持ち主を連れ出した', status: 'likely' });
    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
  });

  it('「否定された」を選ぶと否定の理由の欄を出し、理由とともに保存する', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const 編集 = screen.getByRole('region', { name: '仮説の編集' });
    expect(within(編集).queryByRole('textbox', { name: '否定の理由' })).not.toBeInTheDocument();
    await user.click(within(編集).getByRole('radio', { name: '否定された' }));
    await user.type(within(編集).getByRole('textbox', { name: '否定の理由' }), '管理人は当夜、別の町にいた。');
    await user.click(within(編集).getByRole('button', { name: '仮説を保存' }));

    expect(管理人の仮説()).toMatchObject({ status: 'rejected', rejectionReason: '管理人は当夜、別の町にいた。' });
  });

  it('否定された仮説を検討中に戻すと、否定の理由を取り除いて保存する', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-left-early" />);

    const 編集 = screen.getByRole('region', { name: '仮説の編集' });
    await user.click(within(編集).getByRole('radio', { name: '検討中' }));
    await user.click(within(編集).getByRole('button', { name: '仮説を保存' }));

    const 仮説 = openedCase().hypotheses.find((candidate) => candidate.id === 'hypothesis-left-early');
    expect(仮説?.status).toBe('open');
    expect(仮説?.rejectionReason).toBeUndefined();
  });

  it('見出しを保存しても、ひもづけた証言と対象の人物は保つ', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    // 前提: 見出しの入力を始めた後で、反する証言をひもづける
    const 編集 = screen.getByRole('region', { name: '仮説の編集' });
    await user.type(within(編集).getByRole('textbox', { name: '見出し' }), '？');
    await user.selectOptions(screen.getByRole('combobox', { name: '反する証言を追加' }), 'claim-neighbor');
    await user.click(within(編集).getByRole('button', { name: '仮説を保存' }));

    expect(管理人の仮説()).toMatchObject({
      title: '管理人が失踪に関わっている？',
      supportingClaimIds: ['claim-user-guess'],
      opposingClaimIds: ['claim-neighbor'],
    });
    expect(管理人の仮説().targets).toHaveLength(1);
  });

  it('仮説を削除すると、仮説の一覧（ボードの仮説タブ）に戻る', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    await user.click(screen.getByRole('button', { name: 'この仮説を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(openedCase().hypotheses.map((hypothesis) => hypothesis.id)).toEqual(['hypothesis-left-early']);
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/cases/case-lakeside?tab=hypotheses');
  });

  it('ケースに無い仮説を開いた場合は、見つからないことを伝える', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-gone" />);

    expect(screen.getByRole('heading', { name: '仮説が見つかりません' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '仮説の詳細を閉じる' })).toHaveAttribute('href', '/cases/case-lakeside?tab=hypotheses');
  });
});

describe('HypothesisDetail（支える証言・反する証言）', () => {
  it('支える証言・反する証言を、証言の詳細へのリンクで並べる', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-left-early" />);

    const 支える = screen.getByRole('region', { name: '支える証言' });
    expect(within(支える).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker?tab=hypotheses'
    );
    const 反する = screen.getByRole('region', { name: '反する証言' });
    expect(within(反する).getAllByRole('link')).toHaveLength(2);
  });

  it('証言を選ぶと支える証言にひもづけ、外すボタンでひもづけを外す', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '支える証言を追加' }), 'claim-caretaker');
    expect(管理人の仮説().supportingClaimIds).toEqual(['claim-user-guess', 'claim-caretaker']);

    const 支える = screen.getByRole('region', { name: '支える証言' });
    await user.click(within(支える).getByRole('button', { name: /見回りをしたとき.*を支える証言から外す/ }));
    expect(管理人の仮説().supportingClaimIds).toEqual(['claim-user-guess']);
  });

  it('支える証言にひもづけた証言は、反する証言の選択肢に並べない', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const 選択肢 = within(screen.getByRole('combobox', { name: '反する証言を追加' }))
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'));
    expect(選択肢).not.toContain('claim-user-guess');
    expect(選択肢).toContain('claim-neighbor');
  });
});

describe('HypothesisDetail（対象の人物の動機・機会・手段）', () => {
  it('対象の人物ごとに、動機・機会・手段の証言を表に並べ、証言の無い観点を示す', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const 表 = screen.getByRole('table', { name: '対象の人物の動機・機会・手段' });
    expect(within(表).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '人物',
      '動機',
      '機会',
      '手段',
    ]);
    const 管理人の行 = within(表).getByRole('row', { name: /管理人/ });
    const [動機, 機会, 手段] = within(管理人の行).getAllByRole('cell');
    expect(within(動機!).getByRole('link', { name: /ユーザーの推測/ })).toBeInTheDocument();
    expect(within(機会!).getByRole('link', { name: /見回りをしたとき/ })).toBeInTheDocument();
    expect(手段).toHaveTextContent('証言なし');
  });

  it('観点に証言を追加し、外せる', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '管理人の手段に証言を追加' }), 'claim-report');
    expect(管理人の仮説().targets[0]?.claimIds.means).toEqual(['claim-report']);

    await user.click(screen.getByRole('button', { name: /12日夜から連絡が取れな.*を管理人の手段から外す/ }));
    expect(管理人の仮説().targets[0]?.claimIds.means).toEqual([]);
  });

  it('対象の人物を追加し、外せる。すでに対象の人物は選択肢に並べない', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const 人物の選択 = screen.getByRole('combobox', { name: '対象の人物を追加' });
    expect(within(人物の選択).queryByRole('option', { name: '管理人' })).not.toBeInTheDocument();
    await user.selectOptions(人物の選択, 'person-neighbor');
    expect(管理人の仮説().targets.map((target) => target.personId)).toEqual(['person-caretaker', 'person-neighbor']);
    expect(管理人の仮説().targets[1]?.claimIds).toEqual({ motive: [], opportunity: [], means: [] });

    await user.click(screen.getByRole('button', { name: '隣家の住人を対象から外す' }));
    expect(管理人の仮説().targets.map((target) => target.personId)).toEqual(['person-caretaker']);
  });
});

describe('NewHypothesisDetail', () => {
  it('見出しと説明を入力して保存すると、検討中の仮説を登録し、その仮説の詳細へ移る', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/hypotheses/new?tab=hypotheses');
    render(<NewHypothesisDetail />);

    const 登録 = screen.getByRole('region', { name: '仮説の登録' });
    await user.type(within(登録).getByRole('textbox', { name: '見出し' }), '隣家の住人が見間違えた');
    await user.type(within(登録).getByRole('textbox', { name: '説明' }), '夜で暗く、別人を持ち主と見間違えた可能性がある。');
    await user.click(within(登録).getByRole('button', { name: '仮説を保存' }));

    const 登録した仮説 = openedCase().hypotheses.at(-1);
    expect(登録した仮説).toMatchObject({
      title: '隣家の住人が見間違えた',
      description: '夜で暗く、別人を持ち主と見間違えた可能性がある。',
      status: 'open',
      supportingClaimIds: [],
      opposingClaimIds: [],
      targets: [],
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/cases/case-lakeside/hypotheses/${登録した仮説!.id}?tab=hypotheses`
    );
  });
});
