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
function findCaretakerHypothesis(): Hypothesis {
  const hypothesis = openedCase().hypotheses.find((candidate) => candidate.id === 'hypothesis-caretaker');
  if (!hypothesis) throw new Error('管理人の仮説が見つかりません');
  return hypothesis;
}

describe('HypothesisDetail（仮説の編集）', () => {
  it('見出しと状態を変えて保存できる', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const editButton = screen.getByRole('region', { name: '仮説の編集' });
    const heading = within(editButton).getByRole('textbox', { name: '見出し' });
    await user.clear(heading);
    await user.type(heading, '管理人が持ち主を連れ出した');
    await user.click(within(editButton).getByRole('radio', { name: '有力' }));
    await user.click(within(editButton).getByRole('button', { name: '仮説を保存' }));

    expect(findCaretakerHypothesis()).toMatchObject({ title: '管理人が持ち主を連れ出した', status: 'likely' });
    expect(screen.getByRole('status')).toHaveTextContent('保存しました');
  });

  it('「否定された」を選ぶと否定の理由の欄を出し、理由とともに保存する', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const editButton = screen.getByRole('region', { name: '仮説の編集' });
    expect(within(editButton).queryByRole('textbox', { name: '否定の理由' })).not.toBeInTheDocument();
    await user.click(within(editButton).getByRole('radio', { name: '否定された' }));
    await user.type(within(editButton).getByRole('textbox', { name: '否定の理由' }), '管理人は当夜、別の町にいた。');
    await user.click(within(editButton).getByRole('button', { name: '仮説を保存' }));

    expect(findCaretakerHypothesis()).toMatchObject({ status: 'rejected', rejectionReason: '管理人は当夜、別の町にいた。' });
  });

  it('否定された仮説を検討中に戻すと、否定の理由を取り除いて保存する', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-left-early" />);

    const editButton = screen.getByRole('region', { name: '仮説の編集' });
    await user.click(within(editButton).getByRole('radio', { name: '検討中' }));
    await user.click(within(editButton).getByRole('button', { name: '仮説を保存' }));

    const leftEarlyHypothesis = openedCase().hypotheses.find((candidate) => candidate.id === 'hypothesis-left-early');
    expect(leftEarlyHypothesis?.status).toBe('open');
    expect(leftEarlyHypothesis?.rejectionReason).toBeUndefined();
  });

  it('見出しを保存しても、ひもづけた証言と対象の人物は保つ', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    // 前提: 見出しの入力を始めた後で、反する証言をひもづける
    const editButton = screen.getByRole('region', { name: '仮説の編集' });
    await user.type(within(editButton).getByRole('textbox', { name: '見出し' }), '？');
    await user.selectOptions(screen.getByRole('combobox', { name: '反する証言を追加' }), 'claim-neighbor');
    await user.click(within(editButton).getByRole('button', { name: '仮説を保存' }));

    expect(findCaretakerHypothesis()).toMatchObject({
      title: '管理人が失踪に関わっている？',
      supportingClaimIds: ['claim-user-guess'],
      opposingClaimIds: ['claim-neighbor'],
    });
    expect(findCaretakerHypothesis().targets).toHaveLength(1);
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

    const supporting = screen.getByRole('region', { name: '支える証言' });
    expect(within(supporting).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker?tab=hypotheses'
    );
    const contradicting = screen.getByRole('region', { name: '反する証言' });
    expect(within(contradicting).getAllByRole('link')).toHaveLength(2);
  });

  it('証言を選ぶと支える証言にひもづけ、外すボタンでひもづけを外す', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '支える証言を追加' }), 'claim-caretaker');
    expect(findCaretakerHypothesis().supportingClaimIds).toEqual(['claim-user-guess', 'claim-caretaker']);

    const supporting = screen.getByRole('region', { name: '支える証言' });
    await user.click(within(supporting).getByRole('button', { name: /見回りをしたとき.*を支える証言から外す/ }));
    expect(findCaretakerHypothesis().supportingClaimIds).toEqual(['claim-user-guess']);
  });

  it('支える証言にひもづけた証言は、反する証言の選択肢に並べない', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const options = within(screen.getByRole('combobox', { name: '反する証言を追加' }))
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'));
    expect(options).not.toContain('claim-user-guess');
    expect(options).toContain('claim-neighbor');
  });
});

describe('HypothesisDetail（対象の人物の動機・機会・手段）', () => {
  it('対象の人物ごとに、動機・機会・手段の証言を表に並べ、証言の無い観点を示す', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const table = screen.getByRole('table', { name: '対象の人物の動機・機会・手段' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '人物',
      '動機',
      '機会',
      '手段',
    ]);
    const caretakerRow = within(table).getByRole('row', { name: /管理人/ });
    const [motive, opportunity, means] = within(caretakerRow).getAllByRole('cell');
    expect(within(motive!).getByRole('link', { name: /ユーザーの推測/ })).toBeInTheDocument();
    expect(within(opportunity!).getByRole('link', { name: /見回りをしたとき/ })).toBeInTheDocument();
    expect(means).toHaveTextContent('証言なし');
  });

  it('観点に証言を追加し、外せる', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    await user.selectOptions(screen.getByRole('combobox', { name: '管理人の手段に証言を追加' }), 'claim-report');
    expect(findCaretakerHypothesis().targets[0]?.claimIds.means).toEqual(['claim-report']);

    await user.click(screen.getByRole('button', { name: /12日夜から連絡が取れな.*を管理人の手段から外す/ }));
    expect(findCaretakerHypothesis().targets[0]?.claimIds.means).toEqual([]);
  });

  it('対象の人物を追加し、外せる。すでに対象の人物は選択肢に並べない', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const personSelect = screen.getByRole('combobox', { name: '対象の人物を追加' });
    expect(within(personSelect).queryByRole('option', { name: '管理人' })).not.toBeInTheDocument();
    await user.selectOptions(personSelect, 'person-neighbor');
    expect(findCaretakerHypothesis().targets.map((target) => target.personId)).toEqual(['person-caretaker', 'person-neighbor']);
    expect(findCaretakerHypothesis().targets[1]?.claimIds).toEqual({ motive: [], opportunity: [], means: [] });

    await user.click(screen.getByRole('button', { name: '隣家の住人を対象から外す' }));
    expect(findCaretakerHypothesis().targets.map((target) => target.personId)).toEqual(['person-caretaker']);
  });
});

/** 架空の書籍が2018年に唱えた説です。立場の変化はまだ記録していません。 */
const bookTheory: Hypothesis = {
  id: 'hypothesis-book-theory',
  title: '持ち主は自分で姿を消した',
  status: 'open',
  supportingClaimIds: [],
  opposingClaimIds: [],
  targets: [],
  proponentPersonId: 'person-book',
  proposedAt: '2018',
};

/** サンプルのケースに、架空の書籍の説を加えて開きます。 */
function openCaseWithBookTheory(theory: Hypothesis = bookTheory) {
  openTestCase({ ...sampleFictionalCase, hypotheses: [...sampleFictionalCase.hypotheses, theory] });
}

/** 開いているケースから、架空の書籍の説を取り出します。 */
function findBookTheory(): Hypothesis {
  const hypothesis = openedCase().hypotheses.find((candidate) => candidate.id === 'hypothesis-book-theory');
  if (!hypothesis) throw new Error('架空の書籍の説が見つかりません');
  return hypothesis;
}

describe('HypothesisDetail（第三者の説）', () => {
  it('主唱者と唱えた時期を選ぶと、第三者の説として保存する', async () => {
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    const editRegion = screen.getByRole('region', { name: '仮説の編集' });
    // 検証: 主唱者を選ぶまでは、読み手自身の仮説のため、唱えた時期の欄を出さない
    expect(within(editRegion).queryByRole('textbox', { name: '唱えた時期（任意）' })).not.toBeInTheDocument();
    await user.selectOptions(within(editRegion).getByRole('combobox', { name: '主唱者' }), 'person-book');
    await user.type(within(editRegion).getByRole('textbox', { name: '唱えた時期（任意）' }), '2018年');
    await user.click(within(editRegion).getByRole('button', { name: '仮説を保存' }));

    expect(findCaretakerHypothesis()).toMatchObject({ proponentPersonId: 'person-book', proposedAt: '2018' });
  });

  it('主唱者を「読み手（自分）」に戻すと、主唱者と唱えた時期を取り除いて保存する', async () => {
    openCaseWithBookTheory();
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-book-theory" />);

    const editRegion = screen.getByRole('region', { name: '仮説の編集' });
    await user.selectOptions(within(editRegion).getByRole('combobox', { name: '主唱者' }), '');
    await user.click(within(editRegion).getByRole('button', { name: '仮説を保存' }));

    expect(findBookTheory()).not.toHaveProperty('proponentPersonId');
    expect(findBookTheory()).not.toHaveProperty('proposedAt');
  });

  it('立場の変化を記録した説を「読み手（自分）」に戻すときは、立場の変化を取り除くことを示し、取り除いて保存する', async () => {
    openCaseWithBookTheory({
      ...bookTheory,
      stanceChanges: [{ id: 'stance-withdrawn', kind: 'withdrawn', basisClaimIds: ['claim-report'] }],
    });
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-book-theory" />);

    const editRegion = screen.getByRole('region', { name: '仮説の編集' });
    await user.selectOptions(within(editRegion).getByRole('combobox', { name: '主唱者' }), '');
    expect(editRegion).toHaveTextContent('保存すると、主唱者の立場の変化1件を取り除きます。');
    await user.click(within(editRegion).getByRole('button', { name: '仮説を保存' }));

    expect(findBookTheory()).not.toHaveProperty('stanceChanges');
  });

  it('唱えた時期を解釈できない場合は、理由を示して保存しない', async () => {
    openCaseWithBookTheory();
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-book-theory" />);

    const editRegion = screen.getByRole('region', { name: '仮説の編集' });
    const proposedAt = within(editRegion).getByRole('textbox', { name: '唱えた時期（任意）' });
    await user.clear(proposedAt);
    await user.type(proposedAt, 'ずっと前');
    await user.click(within(editRegion).getByRole('button', { name: '仮説を保存' }));

    expect(within(editRegion).getByRole('alert')).toHaveTextContent('唱えた時期を解釈できません');
    expect(findBookTheory().proposedAt).toBe('2018');
  });

  it('読み手自身の仮説には、主唱者の立場の変化の節を出さない', () => {
    render(<HypothesisDetail hypothesisId="hypothesis-caretaker" />);

    expect(screen.queryByRole('region', { name: '主唱者の立場の変化' })).not.toBeInTheDocument();
  });

  it('主唱者の立場の変化（撤回など）を、時期・根拠の証言・メモとともに記録し、削除できる', async () => {
    openCaseWithBookTheory();
    const user = userEvent.setup();
    render(<HypothesisDetail hypothesisId="hypothesis-book-theory" />);

    const stanceRegion = screen.getByRole('region', { name: '主唱者の立場の変化' });
    await user.click(within(stanceRegion).getByRole('button', { name: '立場の変化を記録' }));
    await user.click(within(stanceRegion).getByRole('radio', { name: '撤回' }));
    await user.type(within(stanceRegion).getByRole('textbox', { name: '時期（任意）' }), '2020年5月');
    await user.click(within(stanceRegion).getByRole('checkbox', { name: /12日夜から連絡が取れな/ }));
    await user.type(within(stanceRegion).getByRole('textbox', { name: 'メモ（任意）' }), '著者が誤りを認めた');
    await user.click(within(stanceRegion).getByRole('button', { name: '立場の変化を保存' }));

    expect(findBookTheory().stanceChanges).toEqual([
      { id: expect.any(String), kind: 'withdrawn', at: '2020-05', basisClaimIds: ['claim-report'], note: '著者が誤りを認めた' },
    ]);
    const [item] = within(stanceRegion).getAllByRole('listitem');
    expect(item).toHaveTextContent('撤回');
    expect(item).toHaveTextContent('2020年5月');
    expect(within(item!).getByRole('link', { name: /12日夜から連絡が取れな/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-report?tab=hypotheses'
    );

    await user.click(within(stanceRegion).getByRole('button', { name: '撤回（2020年5月）の記録を削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));
    expect(findBookTheory()).not.toHaveProperty('stanceChanges');
  });
});

describe('NewHypothesisDetail', () => {
  it('見出しと説明を入力して保存すると、検討中の仮説を登録し、その仮説の詳細へ移る', async () => {
    const user = userEvent.setup();
    resetMockNavigation('/cases/case-lakeside/hypotheses/new?tab=hypotheses');
    render(<NewHypothesisDetail />);

    const registerButton = screen.getByRole('region', { name: '仮説の登録' });
    await user.type(within(registerButton).getByRole('textbox', { name: '見出し' }), '隣家の住人が見間違えた');
    await user.type(within(registerButton).getByRole('textbox', { name: '説明' }), '夜で暗く、別人を持ち主と見間違えた可能性がある。');
    await user.click(within(registerButton).getByRole('button', { name: '仮説を保存' }));

    const registeredHypothesis = openedCase().hypotheses.at(-1);
    expect(registeredHypothesis).toMatchObject({
      title: '隣家の住人が見間違えた',
      description: '夜で暗く、別人を持ち主と見間違えた可能性がある。',
      status: 'open',
      supportingClaimIds: [],
      opposingClaimIds: [],
      targets: [],
    });
    expect(mockRouter.replace).toHaveBeenLastCalledWith(
      `/cases/case-lakeside/hypotheses/${registeredHypothesis!.id}?tab=hypotheses`
    );
  });
});
