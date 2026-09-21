/**
 * 案件の一覧（CaseList）のテスト
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { LEGACY_STORAGE_KEY, listCaseSummaries, saveCase } from '@/lib/case-storage';
import { useCaseStore } from '@/stores/useCaseStore';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { CaseList } from './CaseList';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  useCaseStore.setState({ currentCase: null, summaries: [], loadError: null });
  resetMockNavigation('/');
});

describe('CaseList', () => {
  it('保存済みの案件を、名前と証言の件数とともに並べる', async () => {
    saveCase(sampleFictionalCase);

    render(<CaseList />);

    const link = await screen.findByRole('link', { name: /湖畔の別荘失踪事件（架空）/ });
    expect(link).toHaveAttribute('href', `/cases/${sampleFictionalCase.id}`);
    expect(link).toHaveTextContent(`証言${sampleFictionalCase.claims.length}件`);
  });

  it('保存済みの案件が無い場合は、案件が無いことを伝える', async () => {
    render(<CaseList />);

    expect(await screen.findByText('保存されている案件はありません。')).toBeInTheDocument();
  });

  it('新しい案件を作って、その案件のボードへ移る', async () => {
    const user = userEvent.setup();
    render(<CaseList />);

    await user.click(screen.getByRole('button', { name: '新しい案件' }));

    const 作った案件のId = listCaseSummaries()[0]!.id;
    expect(mockRouter.push).toHaveBeenCalledWith(`/cases/${作った案件のId}`);
  });

  it('架空のサンプルを、新しい案件として読み込む', async () => {
    const user = userEvent.setup();
    render(<CaseList />);

    await user.click(screen.getByRole('button', { name: '架空のサンプルを読み込む' }));

    expect(mockRouter.push).toHaveBeenCalledWith(`/cases/${sampleFictionalCase.id}`);
    expect(listCaseSummaries().map((summary) => summary.name)).toEqual([sampleFictionalCase.name]);
  });

  it('JSONファイルを、新しい案件として読み込む', async () => {
    const user = userEvent.setup();
    const file = new File([JSON.stringify(sampleFictionalCase)], '湖畔の事件.json', { type: 'application/json' });
    render(<CaseList />);

    await user.upload(screen.getByLabelText('JSONを読み込む'), file);

    await vi.waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith(`/cases/${sampleFictionalCase.id}`));
  });

  it('検証に失敗するJSONファイルは、理由を示して読み込まない', async () => {
    const user = userEvent.setup();
    const file = new File([JSON.stringify({ name: '項目が足りない案件' })], '壊れた案件.json', {
      type: 'application/json',
    });
    render(<CaseList />);

    await user.upload(screen.getByLabelText('JSONを読み込む'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent('案件データの形式が正しくありません');
    expect(listCaseSummaries()).toEqual([]);
  });

  it('1件だけ保存していた頃のデータを移行できなかった場合は、理由を示す', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ state: { currentCase: { name: '古い形式の案件' } } }));

    render(<CaseList />);

    expect(await screen.findByRole('alert')).toHaveTextContent('案件データの形式が正しくありません');
  });

  it('案件を削除する前に確認し、承認された場合は一覧から取り除く', async () => {
    const user = userEvent.setup();
    saveCase(sampleFictionalCase);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CaseList />);

    await user.click(await screen.findByRole('button', { name: '「湖畔の別荘失踪事件（架空）」を削除' }));

    expect(listCaseSummaries()).toEqual([]);
    expect(screen.getByText('保存されている案件はありません。')).toBeInTheDocument();
  });
});
