/**
 * LLM の設定（OpenRouter の API キーとモデル）の入力欄
 *
 * 証言の候補の抽出（ClaimExtraction）と、ケース設定のメニューの「LLM の設定」（CaseSettingsMenu）で使います。
 * - モデルは、OpenRouter のモデルの一覧（src/lib/openrouter-models.ts）から絞り込んで選べ、選んだモデルの料金を示します。
 *   一覧の取得の状態は、呼び出し側が useOpenRouterModels で持ち、保存や送信の前の確認（findModelError）にも使います。
 * - 一覧を取得できない場合は理由を示し、モデルのIDを直接入力できるようにします
 *   （一覧の API だけが落ちている場合に、抽出まで使えなくならないようにするためです）。
 *
 * 注意: API キーが空でもエラーにしません。空のまま保存すると、保存済みのキーを消せるようにするためです。
 * キーが必須かどうかは、呼び出し側（抽出で送るとき）が確かめます。
 */
'use client';

import { useEffect, useId, useState } from 'react';
import { DEFAULT_LLM_MODEL, loadLlmSettings, type LlmSettings } from '@/lib/llm-settings';
import { fetchOpenRouterModels, formatModelPrice, type OpenRouterModel } from '@/lib/openrouter-models';
import { FormError, INPUT_CLASS, LABEL_CLASS } from './forms/fields';

/** OpenRouter のモデルの一覧の取得の状態です。 */
export type ModelList = { kind: 'loading' } | { kind: 'loaded'; models: OpenRouterModel[] } | { kind: 'failed'; message: string };

/** 入力欄の初期値と、保存済みの設定を読めなかった場合の理由です。 */
export type InitialLlmSettings = { settings: LlmSettings; error: string | null };

/**
 * 保存済みの LLM の設定を、入力欄の初期値として読み込みます。
 * 保存済みの設定が壊れている場合は、既定値で始め、入力し直すよう理由を返します（保存すると上書きされます）。
 */
export function loadInitialLlmSettings(): InitialLlmSettings {
  try {
    return { settings: loadLlmSettings(), error: null };
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught);
    return { settings: { apiKey: '', model: DEFAULT_LLM_MODEL }, error: `${reason} API キーとモデルを入力し直してください。` };
  }
}

/** OpenRouter のモデルの一覧を、描画したときに1回だけ取得します。 */
export function useOpenRouterModels(): ModelList {
  const [modelList, setModelList] = useState<ModelList>({ kind: 'loading' });
  useEffect(() => {
    // 閉じた後に取得が終わった場合に、状態を書き換えないようにする
    let active = true;
    fetchOpenRouterModels()
      .then((models) => active && setModelList({ kind: 'loaded', models }))
      .catch((caught: unknown) => {
        const reason = caught instanceof Error ? caught.message : String(caught);
        if (active) setModelList({ kind: 'failed', message: `${reason} モデルのIDを直接入力してください。` });
      });
    return () => {
      active = false;
    };
  }, []);
  return modelList;
}

/** 入力中のモデルを、モデルの一覧から探します。一覧を読み込めていない場合と、一覧に無い場合は undefined です。 */
function findSelectedModel(model: string, modelList: ModelList): OpenRouterModel | undefined {
  return modelList.kind === 'loaded' ? modelList.models.find((item) => item.id === model.trim()) : undefined;
}

/**
 * 入力中のモデルを使えない理由を返します。使える場合は null です。
 * 一覧を読み込めた場合は、一覧にあるモデルだけを使えるものとします。読み込み中か取得に失敗した場合は、空でなければ使えるものとします。
 */
export function findModelError(model: string, modelList: ModelList): string | null {
  if (model.trim() === '') return 'モデルを入力してください。';
  if (modelList.kind === 'loaded' && findSelectedModel(model, modelList) === undefined) {
    return `「${model.trim()}」は、OpenRouter のモデルの一覧にありません。一覧から選んでください。`;
  }
  return null;
}

type LlmSettingsFieldsProps = {
  settings: LlmSettings;
  onChange: (settings: LlmSettings) => void;
  modelList: ModelList;
};

export function LlmSettingsFields({ settings, onChange, modelList }: LlmSettingsFieldsProps) {
  const apiKeyFieldId = useId();
  const modelFieldId = useId();
  const modelOptionsId = useId();
  const selectedModel = findSelectedModel(settings.model, modelList);

  return (
    <div className="space-y-2">
      {modelList.kind === 'failed' && <FormError message={modelList.message} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={apiKeyFieldId} className={LABEL_CLASS}>
            OpenRouter の API キー
          </label>
          <input
            id={apiKeyFieldId}
            type="password"
            autoComplete="off"
            value={settings.apiKey}
            onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={modelFieldId} className={LABEL_CLASS}>
            モデル
          </label>
          <input
            id={modelFieldId}
            list={modelOptionsId}
            autoComplete="off"
            placeholder="名前かIDで絞り込む（例: gpt-6-luna）"
            value={settings.model}
            onChange={(event) => onChange({ ...settings, model: event.target.value })}
            className={INPUT_CLASS}
          />
          <datalist id={modelOptionsId}>
            {modelList.kind === 'loaded' &&
              modelList.models.map((model) => (
                <option key={model.id} value={model.id} label={`${model.name} — ${formatModelPrice(model)}`} />
              ))}
          </datalist>
          {modelList.kind === 'loading' && <p className="mt-1 text-xs text-muted-foreground">モデルの一覧を読み込んでいます…</p>}
          {selectedModel && (
            <p className="mt-1 text-xs text-muted-foreground">{`${selectedModel.name} — ${formatModelPrice(selectedModel)}`}</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        API キーとモデルは、このブラウザに保存します（ケースの JSON には含めません）。共用の端末では、使い終えたら API キーを消してください。
      </p>
    </div>
  );
}
