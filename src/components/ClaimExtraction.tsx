/**
 * 聴取の本文から、LLM で証言の候補を抽出し、1件ずつ採用・破棄する画面
 *
 * 聴取の本文（InterviewTranscript）の「証言の候補を抽出」から開きます。次の順に進みます。
 * 1. 送る前の確認: 送る本文（選んだ範囲か、本文の全文）と送り先（OpenRouter 経由の外部の LLM）を示し、API キーとモデルを入力してもらいます。
 *    ケースには調書などの機微な資料が含まれうるため、押すまで本文を送りません。
 *    送る本文が上限の文字数（MAX_EXTRACTION_TEXT_LENGTH）を超える場合は、送らずに範囲を選ぶよう示します。
 * 2. 抽出: 抽出 API（src/lib/claim-extraction-api.ts）を呼びます。失敗した場合は理由を示し、ケースを変えません。
 * 3. 候補の一覧: LLM の出力を原文とケースに照らし合わせ（src/domain/claim-extraction.ts の buildClaimCandidates）、
 *    引用が本文にある候補だけを示し、捨てた件数を示します。人物・場所の名前には、登録済みか新規かを添えます。
 *    照らし合わせは描画のたびにケースの現在の状態に対して行うため、候補から人物を新規作成した後の候補では、その人物が登録済みになります。
 * 4. 採用: 候補を入力済みにした証言の入力欄（ClaimForm）を候補の下に開き、ユーザーが確かめてから保存します。保存した候補は一覧から外します。
 *    破棄: ケースを変えずに、候補を一覧から外します。
 *
 * 入力した API キーとモデルは、次の抽出のためにブラウザに保存します（src/lib/llm-settings.ts）。
 * API キーとモデルの入力欄は、ケース設定のメニューの「LLM の設定」と共通です（LlmSettingsFields）。一覧にないモデルは送りません。
 * 一覧を取得できない場合は、モデルのIDを直接入力して送れます（誤ったIDは抽出 API が理由を示します）。
 * 注意: 送る本文は、開いた時点の選択（または全文）で固定します。範囲を選び直す場合は、もう一度「証言の候補を抽出」を押します
 * （呼び出し側で key を変えて作り直してください）。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState, type FormEvent } from 'react';
import {
  buildClaimCandidates,
  candidateToClaimDraft,
  type ClaimCandidate,
  type ExtractedClaim,
  type ResolvedName,
} from '@/domain/claim-extraction';
import { formatTimeRef } from '@/domain/time-ref';
import { formatQuoteSeconds, stripTimestampLines } from '@/domain/transcript';
import type { Id } from '@/domain/types';
import { MAX_EXTRACTION_TEXT_LENGTH, requestClaimExtraction } from '@/lib/claim-extraction-api';
import { saveLlmSettings, type LlmSettings } from '@/lib/llm-settings';
import { useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimForm, type ClaimDefaults } from './forms/ClaimForm';
import { FormError } from './forms/fields';
import { findModelError, LlmSettingsFields, loadInitialLlmSettings, useOpenRouterModels } from './LlmSettingsFields';

/** 抽出に送る本文です。scope は、本文の範囲を選んで送るか、全文を送るかです。 */
export type ExtractionSource = { text: string; scope: 'selection' | 'all' };

/** 送る本文の範囲の呼び方です。 */
const SCOPE_LABELS: Record<ExtractionSource['scope'], string> = { selection: '選んだ範囲', all: '本文の全文' };

/** 画面の段階です。done では、LLM の出力と、確かめ終えた（保存か破棄をした）候補のキーを持ちます。 */
type Phase =
  | { kind: 'confirm' }
  | { kind: 'loading' }
  | { kind: 'done'; extracted: ExtractedClaim[]; settledKeys: ReadonlySet<string> };

/** 採用して入力欄を開いている候補です。新規作成するエンティティのIDを保つため、入力欄の初期値は採用した時点で作ります。 */
type Adopting = { key: string; defaults: ClaimDefaults };

type ClaimExtractionProps = {
  interviewId: Id;
  source: ExtractionSource;
  /** 「閉じる」を押したときに呼び出します。 */
  onClose: () => void;
};

/** 名前に、登録済みか新規作成の候補かを添えます。 */
function nameWithStatus(name: ResolvedName): string {
  return `${name.name}（${name.status === 'registered' ? '登録済み' : '新規'}）`;
}

/** 候補の各項目を「項目名: 値」の行にします。値の無い項目は含めません。 */
function describeCandidate(candidate: ClaimCandidate, subjectName: string): { term: string; description: string }[] {
  const whenDescription =
    candidate.when !== undefined
      ? formatTimeRef(candidate.when)
      : candidate.whenText && `「${candidate.whenText}」（日時の表記として読めないため、日時なしで書き起こします）`;
  return [
    { term: '発言者', description: candidate.speaker ? nameWithStatus(candidate.speaker) : `${subjectName}（聴取の相手）` },
    { term: '経由', description: candidate.via.map(nameWithStatus).join(' → ') },
    { term: '日時', description: whenDescription ?? '' },
    { term: '場所', description: candidate.place ? nameWithStatus(candidate.place) : '' },
    { term: '言及', description: candidate.mentioned.map(nameWithStatus).join('、') },
  ].filter((item) => item.description !== '');
}

export function ClaimExtraction({ interviewId, source, onClose }: ClaimExtractionProps) {
  const currentCase = useCurrentCase();
  // 保存済みの設定が壊れている場合は、理由を示して入力し直してもらう（送るときに上書きで保存する）
  const [initial] = useState(loadInitialLlmSettings);
  const [settings, setSettings] = useState<LlmSettings>(initial.settings);
  const modelList = useOpenRouterModels();
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  const [error, setError] = useState<string | null>(null);
  const [adopting, setAdopting] = useState<Adopting | null>(null);

  const interview = currentCase.interviews.find((item) => item.id === interviewId);
  if (interview === undefined) throw new Error(`聴取が見つかりません: ${interviewId}`);
  const subjectName = currentCase.persons.find((person) => person.id === interview.subjectPersonId)?.name;
  if (subjectName === undefined) throw new Error(`聴取の相手が見つかりません: ${interview.subjectPersonId}`);
  const tooLong = source.text.length > MAX_EXTRACTION_TEXT_LENGTH;

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (settings.apiKey.trim() === '') {
      setError('OpenRouter の API キーを入力してください。');
      return;
    }
    const modelError = findModelError(settings.model, modelList);
    if (modelError !== null) {
      setError(modelError);
      return;
    }
    setError(null);
    // 前後の空白を除いた値を、保存と送信の両方に使う（設定の画面で保存する値と揃えるため）
    const trimmed = { apiKey: settings.apiKey.trim(), model: settings.model.trim() };
    saveLlmSettings(trimmed);
    setPhase({ kind: 'loading' });
    try {
      const extracted = await requestClaimExtraction({
        text: source.text,
        subjectName,
        personNames: currentCase.persons.flatMap((person) => [person.name, ...(person.aliases ?? [])]),
        placeNames: currentCase.places.map((place) => place.name),
        ...trimmed,
      });
      setPhase({ kind: 'done', extracted, settledKeys: new Set() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setPhase({ kind: 'confirm' });
    }
  };

  /** 候補を確かめ終えた（保存か破棄をした）ものとして、一覧から外します。 */
  const settle = (key: string) => {
    setAdopting(null);
    setPhase((current) => (current.kind === 'done' ? { ...current, settledKeys: new Set([...current.settledKeys, key]) } : current));
  };

  const adopt = (candidate: ClaimCandidate) => {
    const { draft, speaker, title, newEntities } = candidateToClaimDraft(currentCase, interviewId, candidate, nanoid);
    setAdopting({
      key: candidate.key,
      defaults: { interviewId, quote: candidate.quote, draft, speaker, newEntities, ...(title !== undefined && { title }) },
    });
  };

  return (
    <section aria-label="証言の候補の抽出" className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-sm font-medium">証言の候補の抽出</h5>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:underline">
          閉じる
        </button>
      </div>

      {phase.kind !== 'done' && (
        <form onSubmit={handleSend} className="space-y-3">
          <p className="text-xs leading-relaxed">
            {SCOPE_LABELS[source.scope]}（{source.text.length}文字）を、OpenRouter を経由して外部の LLM に送り、証言の候補を受け取ります。
            ケースに調書などの機微な資料が含まれる場合は、送ってよいかを確かめてください。候補は、1件ずつ確かめてから保存します。
          </p>
          {tooLong && (
            <p role="alert" className="text-xs text-destructive">
              送る本文が長すぎます（上限は{MAX_EXTRACTION_TEXT_LENGTH}文字です）。本文の範囲を選んでから抽出してください。
            </p>
          )}
          <FormError message={initial.error} />
          <LlmSettingsFields settings={settings} onChange={setSettings} modelList={modelList} />
          <FormError message={error} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={tooLong || phase.kind === 'loading'}>
              本文を送って抽出する
            </Button>
          </div>
          {phase.kind === 'loading' && (
            <p role="status" className="text-xs text-muted-foreground">
              抽出しています…（長い本文では1〜2分かかります）
            </p>
          )}
        </form>
      )}

      {phase.kind === 'done' && (
        <CandidateList
          interviewId={interviewId}
          extracted={phase.extracted}
          settledKeys={phase.settledKeys}
          subjectName={subjectName}
          adopting={adopting}
          onAdopt={adopt}
          onCancelAdopt={() => setAdopting(null)}
          onSettle={settle}
        />
      )}
    </section>
  );
}

type CandidateListProps = {
  interviewId: Id;
  extracted: ExtractedClaim[];
  settledKeys: ReadonlySet<string>;
  subjectName: string;
  adopting: Adopting | null;
  onAdopt: (candidate: ClaimCandidate) => void;
  onCancelAdopt: () => void;
  onSettle: (key: string) => void;
};

/** 原文とケースに照らし合わせた候補の一覧です。確かめ終えた候補は示しません。 */
function CandidateList({ interviewId, extracted, settledKeys, subjectName, adopting, onAdopt, onCancelAdopt, onSettle }: CandidateListProps) {
  const currentCase = useCurrentCase();
  const { candidates, discardedCount } = buildClaimCandidates(currentCase, interviewId, extracted);
  const remaining = candidates.filter((candidate) => !settledKeys.has(candidate.key));

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        候補{candidates.length}件のうち、残り{remaining.length}件
        {discardedCount > 0 && `。引用が本文に見つからなかった候補${discardedCount}件を除きました`}
      </p>
      {remaining.length === 0 ? (
        <p className="text-xs">{candidates.length === 0 ? '証言の候補は見つかりませんでした。' : '候補をすべて確かめました。'}</p>
      ) : (
        <ul aria-label="証言の候補" className="space-y-2">
          {remaining.map((candidate) => (
            <li key={candidate.key} className="space-y-2 rounded-md border bg-background p-2 text-sm">
              {candidate.title && <p className="font-medium">{candidate.title}</p>}
              <p>{candidate.content}</p>
              <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">
                {candidate.quote.seconds !== undefined && <span className="mr-1">{formatQuoteSeconds(candidate.quote.seconds)}</span>}
                {stripTimestampLines(candidate.quote.text)}
              </blockquote>
              <dl className="grid gap-0.5 text-xs">
                {describeCandidate(candidate, subjectName).map(({ term, description }) => (
                  <div key={term} className="flex gap-1">
                    <dt className="shrink-0 text-muted-foreground">{`${term}: `}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
              {candidate.overlapsTranscribed && (
                <p className="text-xs text-amber-700 dark:text-amber-400">書き起こし済みの範囲と重なります。同じ証言を二重に登録しないよう確かめてください。</p>
              )}

              {adopting?.key === candidate.key ? (
                <section aria-label="候補からの証言の書き足し" className="border-t pt-2">
                  <ClaimForm
                    defaults={adopting.defaults}
                    onDone={() => onSettle(candidate.key)}
                    autoFocus
                    compact
                    actions={
                      <button type="button" onClick={onCancelAdopt} className="text-xs text-muted-foreground hover:underline">
                        やめる
                      </button>
                    }
                  />
                </section>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onSettle(candidate.key)}>
                    破棄
                  </Button>
                  <Button type="button" size="sm" onClick={() => onAdopt(candidate)}>
                    採用
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
