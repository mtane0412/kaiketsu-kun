/**
 * LLM の設定（OpenRouter の API キーとモデル）の保存と読み込みのテスト
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_LLM_MODEL, LLM_SETTINGS_STORAGE_KEY, loadLlmSettings, saveLlmSettings } from './llm-settings';

describe('loadLlmSettings', () => {
  it('保存していない場合は、API キーを空、モデルを既定のモデルにする', () => {
    expect(loadLlmSettings()).toEqual({ apiKey: '', model: DEFAULT_LLM_MODEL });
  });

  it('保存した設定を読み込む', () => {
    saveLlmSettings({ apiKey: 'sk-or-テスト用のキー', model: 'google/gemini-3.8-flash' });

    expect(loadLlmSettings()).toEqual({ apiKey: 'sk-or-テスト用のキー', model: 'google/gemini-3.8-flash' });
  });

  it('保存済みの設定が形式に合わない場合は、理由を示すエラーにする', () => {
    localStorage.setItem(LLM_SETTINGS_STORAGE_KEY, '{"apiKey": 1}');

    expect(() => loadLlmSettings()).toThrow('LLM の設定');
  });
});
