/**
 * ボード全体（保存データの復元・タブ切り替え・復元失敗の表示）のテスト
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { STORAGE_KEY, useCaseStore } from '@/stores/useCaseStore';
import { CaseBoard } from './CaseBoard';

beforeEach(() => {
  useCaseStore.getState().resetCase();
});

describe('CaseBoard', () => {
  it('保存済みの案件を復元し、時系列タブと証言者別タブに切り替えて表示する', async () => {
    const user = userEvent.setup();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: sampleFictionalCase }, version: 0 }));
    render(<CaseBoard />);

    expect(await screen.findByDisplayValue('湖畔の別荘失踪事件（架空）')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '時系列' }));
    expect(screen.getByRole('article', { name: '持ち主が最後に目撃された' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '証言者別' }));
    expect(screen.getByRole('region', { name: '隣家の住人' })).toBeInTheDocument();
  });

  it('保存済みのデータを復元できなかった場合は、理由と退避先を表示する', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { currentCase: { name: '古い形式の案件' } }, version: 0 }));
    render(<CaseBoard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('保存済みの案件を復元できませんでした');
    expect(alert).toHaveTextContent('testimony-board-case-backup');
  });
});
