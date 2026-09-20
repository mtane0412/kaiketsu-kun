/**
 * 案件ツールバー（案件名の変更・JSONの書き出しと読み込み・サンプルの読み込み・初期化）のテスト
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { useCaseStore } from '@/stores/useCaseStore';
import { CaseToolbar } from './CaseToolbar';

beforeEach(() => {
  useCaseStore.getState().resetCase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CaseToolbar', () => {
  it('案件名を変更する', async () => {
    const user = userEvent.setup();
    render(<CaseToolbar />);

    await user.clear(screen.getByLabelText('案件名'));
    await user.type(screen.getByLabelText('案件名'), '湖畔の事件');

    expect(useCaseStore.getState().currentCase.name).toBe('湖畔の事件');
  });

  it('空の案件では、確認なしで架空のサンプルを読み込む', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm');
    render(<CaseToolbar />);

    await user.click(screen.getByRole('button', { name: '架空のサンプルを読み込む' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('入力済みの案件を初期化する前に確認し、取り消された場合は変更しない', async () => {
    const user = userEvent.setup();
    useCaseStore.getState().replaceCase(sampleFictionalCase);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CaseToolbar />);

    await user.click(screen.getByRole('button', { name: '空の案件にする' }));

    expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase);
  });

  it('JSONファイルを読み込んで案件を置き換える', async () => {
    const user = userEvent.setup();
    const file = new File([JSON.stringify(sampleFictionalCase)], '湖畔の事件.json', { type: 'application/json' });
    render(<CaseToolbar />);

    await user.upload(screen.getByLabelText('JSONを読み込む'), file);

    await vi.waitFor(() => expect(useCaseStore.getState().currentCase).toEqual(sampleFictionalCase));
  });

  it('検証に失敗するJSONファイルは、理由を示して読み込まない', async () => {
    const user = userEvent.setup();
    const file = new File([JSON.stringify({ name: '項目が足りない案件' })], '壊れた案件.json', { type: 'application/json' });
    render(<CaseToolbar />);

    await user.upload(screen.getByLabelText('JSONを読み込む'), file);

    expect(await screen.findByRole('alert')).toHaveTextContent('案件データの形式が正しくありません');
    expect(useCaseStore.getState().currentCase.claims).toEqual([]);
  });

  it('現在の案件をJSONファイルとして書き出す', async () => {
    const user = userEvent.setup();
    useCaseStore.getState().replaceCase(sampleFictionalCase);
    let exported: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return 'blob:exported-case';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<CaseToolbar />);

    await user.click(screen.getByRole('button', { name: 'JSONを書き出す' }));

    expect(JSON.parse(await exported!.text())).toEqual(sampleFictionalCase);
  });
});
