/**
 * ケース設定のメニュー（ケース名の変更・JSONの書き出し・ケースの削除・LLM の設定）のテスト
 *
 * ケース名の変更・JSONの書き出し・ケースの削除は、毎日使う操作ではないため、
 * サイドバーの一等地ではなくメニューの中に置いています。テストもメニューを開くところから始めます。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { listCaseSummaries } from '@/lib/case-storage';
import { LLM_SETTINGS_STORAGE_KEY, loadLlmSettings, saveLlmSettings } from '@/lib/llm-settings';
import { useCaseStore } from '@/stores/useCaseStore';
import { mockRouter, resetMockNavigation } from '@/test/mock-navigation';
import { openTestCase } from '@/test/open-case';
import { CaseGate } from './CaseGate';
import { CaseSettingsMenu } from './CaseSettingsMenu';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

/** 実際の画面と同じく、ケースを開く枠（CaseGate）の中にメニューを描画します。 */
function renderMenu() {
  render(
    <CaseGate caseId={sampleFictionalCase.id}>
      <CaseSettingsMenu />
    </CaseGate>
  );
}

/** ケース設定のメニューを開きます。 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'ケース設定' }));
}

beforeEach(() => {
  localStorage.clear();
  openTestCase(sampleFictionalCase);
  resetMockNavigation(`/cases/${sampleFictionalCase.id}`);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CaseSettingsMenu', () => {
  it('ケース名を変更する', async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'ケース名を変更' }));

    await user.clear(await screen.findByLabelText('ケース名'));
    await user.type(screen.getByLabelText('ケース名'), '湖畔の事件');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(useCaseStore.getState().currentCase?.name).toBe('湖畔の事件');
  });

  it('現在のケースをJSONファイルとして書き出す', async () => {
    const user = userEvent.setup();
    let exported: Blob | undefined;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      exported = blob;
      return 'blob:exported-case';
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderMenu();

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'JSONを書き出す' }));

    expect(JSON.parse(await exported!.text())).toEqual(sampleFictionalCase);
  });

  it('ケースを削除する前に確認し、承認された場合は削除して一覧へ移る', async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'このケースを削除' }));
    // 削除は取り消せないため、確認の画面で改めて承認する
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(listCaseSummaries()).toEqual([]);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('ケースの削除が取り消された場合は、ケースを消さない', async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'このケースを削除' }));
    await user.click(await screen.findByRole('button', { name: 'やめる' }));

    expect(listCaseSummaries().map((summary) => summary.id)).toEqual([sampleFictionalCase.id]);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('CaseSettingsMenu（LLM の設定）', () => {
  /** OpenRouter のモデルの一覧の API が返すモデルです（使わない項目は省いています）。 */
  const openRouterModels = [
    ['openai/gpt-6-luna', 'OpenAI: GPT-6 Luna', '0.0000001', '0.0000005'],
    ['google/gemini-3.8-flash', 'Google: Gemini 3.8 Flash', '0.0000003', '0.0000025'],
  ].map(([id, name, prompt, completion]) => ({
    id,
    name,
    context_length: 1000000,
    pricing: { prompt, completion },
    architecture: { output_modalities: ['text'] },
    supported_parameters: ['structured_outputs'],
  }));

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: openRouterModels }), { status: 200 }));
  });

  /** メニューから「LLM の設定」の画面を開き、モデルの一覧を読み込み終えるまで待ちます。 */
  async function openLlmSettings(user: ReturnType<typeof userEvent.setup>) {
    renderMenu();
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'LLM の設定' }));
    const dialog = await screen.findByRole('dialog', { name: 'LLM の設定' });
    await within(dialog).findByText(/OpenAI: GPT-6 Luna —/);
    return dialog;
  }

  it('API キーとモデルを保存する（証言の候補の抽出で、入力済みの状態で使う）', async () => {
    const user = userEvent.setup();
    const dialog = await openLlmSettings(user);

    await user.type(within(dialog).getByLabelText('OpenRouter の API キー'), 'sk-or-テスト用のキー');
    const modelField = within(dialog).getByRole('combobox', { name: 'モデル' });
    await user.clear(modelField);
    await user.type(modelField, 'google/gemini-3.8-flash');
    expect(within(dialog).getByText('Google: Gemini 3.8 Flash — 入力 $0.30 / 出力 $2.50（100万トークンあたり）')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(loadLlmSettings()).toEqual({ apiKey: 'sk-or-テスト用のキー', model: 'google/gemini-3.8-flash' });
    expect(screen.queryByRole('dialog', { name: 'LLM の設定' })).not.toBeInTheDocument();
  });

  it('保存済みの設定を入力済みにして開き、API キーを空にして保存すると消せる', async () => {
    const user = userEvent.setup();
    saveLlmSettings({ apiKey: 'sk-or-保存済みのキー', model: 'openai/gpt-6-luna' });
    const dialog = await openLlmSettings(user);

    const apiKeyField = within(dialog).getByLabelText('OpenRouter の API キー');
    expect(apiKeyField).toHaveValue('sk-or-保存済みのキー');
    await user.clear(apiKeyField);
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(loadLlmSettings()).toEqual({ apiKey: '', model: 'openai/gpt-6-luna' });
  });

  it('モデルの一覧に無いモデルは、保存せずに理由を示す', async () => {
    const user = userEvent.setup();
    const dialog = await openLlmSettings(user);

    const modelField = within(dialog).getByRole('combobox', { name: 'モデル' });
    await user.clear(modelField);
    await user.type(modelField, 'openai/存在しないモデル');
    await user.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(within(dialog).getByText('「openai/存在しないモデル」は、OpenRouter のモデルの一覧にありません。一覧から選んでください。')).toBeInTheDocument();
    expect(localStorage.getItem(LLM_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
