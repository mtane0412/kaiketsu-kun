/**
 * 聴取の本文から、LLM で証言の候補を抽出し、1件ずつ採用・破棄する画面
 *
 * 聴取の本文（InterviewTranscript）の「証言の候補を抽出」から開きます。次の順に進みます。
 * 1. 送る前の確認: 送る本文（選んだ範囲か、本文の全文）と送り先（OpenRouter 経由の外部の LLM）を示し、API キーとモデルを入力してもらいます。
 *    ケースには調書などの機微な資料が含まれうるため、押すまで本文を送りません。
 *    送る本文が上限の文字数（MAX_EXTRACTION_TEXT_LENGTH）を超える場合は、送らずに範囲を選ぶよう示します。
 *    本文のほかに送るもの（人物・場所の名前と、既存の証言の要約の件数）も示します。名前が上限（件数・文字数）を超える場合は、送らない件数を示します（selectExtractionNames）。
 * 2. 抽出: 抽出 API（src/lib/claim-extraction-api.ts）を呼びます。失敗した場合は理由を示し、ケースを変えません。
 * 3. 候補の一覧: LLM の出力を原文とケースに照らし合わせ（src/domain/claim-extraction.ts の buildClaimCandidates）、
 *    引用が本文にある候補だけを示し、捨てた件数を示します。人物・場所の名前には、登録済みか新規かを添えます。
 *    人物の名前は、この資料での呼び方（Interview.personNames）を優先して照らし合わせます。
 *    名前が2人以上に一致した場合（同姓同名など）は、1人に決めず、一致した人物から選ぶ欄を示します。
 *    選ぶまでは、採用も出典の書き足しもできません（黙って別人に結び付けないためです）。
 *    照らし合わせは描画のたびにケースの現在の状態に対して行うため、候補から人物を新規作成した後の候補では、その人物が登録済みになります。
 * 4. 採用: 候補を入力済みにした証言の入力欄（ClaimForm）を候補の下に開き、ユーザーが確かめてから保存します。保存した候補は一覧から外します。
 *    破棄: ケースを変えずに、候補を一覧から外します。
 * 5. 同じかもしれない既存の証言: 抽出のときに、本文に名前が出てくる人物・場所に触れる既存の証言も LLM に渡し
 *    （src/domain/claim-extraction.ts の selectExistingClaimsForExtraction）、候補ごとに同じ事柄を述べていそうな証言を示します。
 *    - 同じ証言（同じ発言者の同じ機会の発言が別の資料にも載ったもの）だとユーザーが判断した場合は、「この証言に出典を書き足す」で
 *      新しい証言を作らずに、既存の証言にこの資料・経由・引用の出典を書き足します（src/domain/claim-sources.ts の addClaimSource）。
 *      この資料をすでに出典に持つ証言には、書き足せないため、その旨だけを示します。
 *    - 同じではないが関係する場合は、従来どおり「採用」で新しい証言にし、入力欄の上で既存の証言との照合の種類を選べます。
 *      照合は既定では作らず、ユーザーが選んだ場合だけ、証言とあわせて保存します（食い違いや裏付けを自動では判定しない方針のためです）。
 *
 * 入力した API キーとモデルは、次の抽出のためにブラウザに保存します（src/lib/llm-settings.ts）。
 * API キーとモデルの入力欄は、ケース設定のメニューの「LLM の設定」と共通です（LlmSettingsFields）。一覧にないモデルは送りません。
 * 一覧を取得できない場合は、モデルのIDを直接入力して送れます（誤ったIDは抽出 API が理由を示します）。
 * 注意: 送る本文は、開いた時点の選択（または全文）で固定します。範囲を選び直す場合は、もう一度「証言の候補を抽出」を押します
 * （呼び出し側で key を変えて作り直してください）。
 */
'use client';

import { nanoid } from 'nanoid';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { buildTimeline, claimLabelOf, describeClaimAttribution } from '@/domain/case-views';
import {
  ambiguousNamesOf,
  buildClaimCandidates,
  candidateToAddedSource,
  candidateToClaimDraft,
  chooseAmbiguousPerson,
  selectExistingClaimsForExtraction,
  type ClaimCandidate,
  type ExtractedClaim,
  type AmbiguousName,
  type ResolvedName,
} from '@/domain/claim-extraction';
import { addClaimSource, sourceForInterview } from '@/domain/claim-sources';
import { CROSS_CHECK_KINDS } from '@/domain/cross-checks';
import { CROSS_CHECK_KIND_LABELS } from '@/domain/labels';
import { formatInterviewLabel } from '@/domain/interviews';
import { normalizeName } from '@/domain/person-names';
import { formatTimeRef } from '@/domain/time-ref';
import { formatQuoteSeconds, stripTimestampLines } from '@/domain/transcript';
import type { CrossCheckKind, Id } from '@/domain/types';
import { MAX_EXTRACTION_TEXT_LENGTH, MAX_SOURCE_NAME_LENGTH, requestClaimExtraction, selectExtractionNames } from '@/lib/claim-extraction-api';
import { saveLlmSettings, type LlmSettings } from '@/lib/llm-settings';
import { useCaseStore, useCurrentCase, type UpsertEntry } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { ClaimForm, type ClaimDefaults } from './forms/ClaimForm';
import { FormError, INPUT_CLASS, LABEL_CLASS } from './forms/fields';
import { createEntry } from './forms/mention-entries';
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

/**
 * 採用して入力欄を開いている候補です。新規作成するエンティティのIDを保つため、入力欄の初期値は採用した時点で作ります。
 * crossCheckKinds は、同じかもしれない既存の証言ごとに選んだ照合の種類です（選んでいない証言は含みません）。
 */
type Adopting = { key: string; defaults: ClaimDefaults; crossCheckKinds: Partial<Record<Id, CrossCheckKind>> };

/** 候補ごと（候補のキー）の、決められない名前（正規化後）ごとに選んだ人物です。 */
type PersonChoices = Readonly<Record<string, Readonly<Record<string, Id>>>>;

/** 人物を選んでいない場合の、選択肢の値です。 */
const NO_PERSON = '';

/** 照合を作らない場合の、選択肢の値です。 */
const NO_CROSS_CHECK = '';

type ClaimExtractionProps = {
  interviewId: Id;
  source: ExtractionSource;
  /** 「閉じる」を押したときに呼び出します。 */
  onClose: () => void;
};

/** 名前に、登録済みか・新規作成の候補か・決められないかを添えます。 */
function nameWithStatus(name: ResolvedName): string {
  switch (name.status) {
    case 'registered':
      return `${name.name}（登録済み）`;
    case 'new':
      return `${name.name}（新規）`;
    case 'ambiguous':
      return `${name.name}（${name.matches.length}人に一致。人物を選んでください）`;
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

/**
 * 候補に、ユーザーが選んだ人物を当てはめます。
 * 選んだ人物が、いまのケースでは一致した人物に含まれない場合（選んだ後に人物を削除した場合など）は当てはめず、選び直してもらいます。
 */
function applyPersonChoices(candidate: ClaimCandidate, choices: Readonly<Record<string, Id>> | undefined): ClaimCandidate {
  return ambiguousNamesOf(candidate).reduce((current, ambiguous) => {
    const chosen = choices?.[normalizeName(ambiguous.name)];
    const isMatch = ambiguous.matches.some((match) => match.id === chosen);
    return chosen !== undefined && isMatch ? chooseAmbiguousPerson(current, ambiguous.name, chosen) : current;
  }, candidate);
}

/**
 * 候補の発言者を示す文を返します。
 * 発言者の分からない候補は、資料の媒体の発言として書き起こします（src/domain/claim-extraction.ts の candidateToClaimDraft）。
 * 媒体の無い資料では、発言者を選ばずに入力欄を開くため、その旨を示します。
 */
function describeSpeaker(candidate: ClaimCandidate, mediaName: string | undefined): string {
  if (candidate.speaker) return nameWithStatus(candidate.speaker);
  return mediaName === undefined ? '不明（書き足すときに選んでください）' : `${mediaName}（資料の媒体）`;
}

/** 候補の各項目を「項目名: 値」の行にします。値の無い項目は含めません。 */
function describeCandidate(candidate: ClaimCandidate, mediaName: string | undefined): { term: string; description: string }[] {
  const whenDescription =
    candidate.when !== undefined
      ? formatTimeRef(candidate.when)
      : candidate.whenText && `「${candidate.whenText}」（日時の表記として読めないため、日時なしで書き起こします）`;
  return [
    { term: '発言者', description: describeSpeaker(candidate, mediaName) },
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
  const [personChoices, setPersonChoices] = useState<PersonChoices>({});
  const upsertMany = useCaseStore((state) => state.upsertMany);

  const interview = currentCase.interviews.find((item) => item.id === interviewId);
  if (interview === undefined) throw new Error(`資料が見つかりません: ${interviewId}`);
  // 発言者の分からない候補は媒体の発言として扱うため（candidateToClaimDraft）、候補の一覧で媒体の名前を示す
  const mediaName = currentCase.persons.find((person) => person.id === interview.interviewerPersonId)?.name;
  // LLM に本文がどの資料のものかを伝える。上限を超える長い名前（長いURLなど）は、上限の文字数で切り詰めて送る
  const sourceName = formatInterviewLabel(currentCase, interview).slice(0, MAX_SOURCE_NAME_LENGTH);
  const tooLong = source.text.length > MAX_EXTRACTION_TEXT_LENGTH;
  // 本文と一緒に送る既存の証言の要約と名前です。送る前の確認で件数を示し、送るときも同じものを渡す。
  // ケース全体と本文を走査するため、API キーの入力などの再描画のたびには計算し直さない
  const outgoing = useMemo(
    () => ({
      existingClaims: selectExistingClaimsForExtraction(currentCase, interviewId, source.text),
      // 名前は上限の件数まで送る。この資料での呼び方と本文に出てくる名前を優先する
      personNames: selectExtractionNames(
        source.text,
        (interview.personNames ?? []).map((personName) => personName.name),
        currentCase.persons.flatMap((person) => [person.name, ...(person.aliases ?? [])])
      ),
      placeNames: selectExtractionNames(source.text, [], currentCase.places.map((place) => place.name)),
    }),
    [currentCase, interviewId, interview.personNames, source.text]
  );
  const { existingClaims, personNames, placeNames } = outgoing;
  const omittedNameCount = personNames.omittedCount + placeNames.omittedCount;

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
        sourceName,
        // この資料での呼び方も人物の名前として伝え、LLM が資料の表記のまま名前を出せるようにする
        personNames: personNames.names,
        placeNames: placeNames.names,
        existingClaims,
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
      crossCheckKinds: {},
    });
  };

  /**
   * 候補を新しい証言にせず、既存の証言 claimId の出典に、この資料・経由・引用を書き足します（経由の決め方は candidateToAddedSource）。
   * 経由に未登録の人物がいる場合は、その人物もあわせて新規作成します。
   */
  const addSourceTo = (candidate: ClaimCandidate, claimId: Id) => {
    const existing = currentCase.claims.find((claim) => claim.id === claimId);
    if (existing === undefined) throw new Error(`証言が見つかりません: ${claimId}`);
    try {
      const { source, newEntities } = candidateToAddedSource(currentCase, interviewId, candidate, existing, nanoid);
      const viaEntries = newEntities.map((entity) => createEntry(entity.kind, entity.id, entity.name));
      const updated = addClaimSource(existing, source);
      upsertMany([...viaEntries, { key: 'claims', entity: updated }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    setError(null);
    settle(candidate.key);
  };

  /** 候補 key の決められない名前 name に、人物 personId を選びます。personId が undefined の場合は選び直す前の状態に戻します。 */
  const choosePerson = (key: string, name: string, personId: Id | undefined) => {
    setPersonChoices((current) => {
      const { [normalizeName(name)]: _previous, ...others } = current[key] ?? {};
      return { ...current, [key]: personId === undefined ? others : { ...others, [normalizeName(name)]: personId } };
    });
  };

  /** 採用中の候補で、既存の証言 claimId との照合の種類を選び直します。kind が undefined の場合は照合を作りません。 */
  const chooseCrossCheck = (claimId: Id, kind: CrossCheckKind | undefined) => {
    setAdopting((current) => {
      if (current === null) return current;
      const { [claimId]: _previous, ...others } = current.crossCheckKinds;
      return { ...current, crossCheckKinds: kind === undefined ? others : { ...others, [claimId]: kind } };
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
            登録済みの人物・場所の名前と、関係しそうな既存の証言の要約（{existingClaims.length}件）も送ります。
            ケースに調書などの機微な資料が含まれる場合は、送ってよいかを確かめてください。候補は、1件ずつ確かめてから保存します。
          </p>
          {omittedNameCount > 0 && (
            <p className="text-xs">
              登録済みの名前のうち、上限（件数・文字数）を超えるため、{omittedNameCount}件の名前は送りません。
              件数が上限を超える場合は、この資料での呼び方と本文に出てくる名前を優先します。送らなかった名前も、候補を受け取った後の照らし合わせには使います。
            </p>
          )}
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

      {phase.kind === 'done' && <FormError message={error} />}
      {phase.kind === 'done' && (
        <CandidateList
          interviewId={interviewId}
          extracted={phase.extracted}
          settledKeys={phase.settledKeys}
          mediaName={mediaName}
          adopting={adopting}
          personChoices={personChoices}
          onChoosePerson={choosePerson}
          onAdopt={adopt}
          onCancelAdopt={() => setAdopting(null)}
          onSettle={settle}
          onAddSource={addSourceTo}
          onChooseCrossCheck={chooseCrossCheck}
        />
      )}
    </section>
  );
}

type CandidateListProps = {
  interviewId: Id;
  extracted: ExtractedClaim[];
  settledKeys: ReadonlySet<string>;
  /** 資料の媒体の名前です。媒体の無い資料では undefined です。 */
  mediaName: string | undefined;
  adopting: Adopting | null;
  personChoices: PersonChoices;
  /** 候補 key の決められない名前 name に、人物を選びます（undefined は選んでいない状態）。 */
  onChoosePerson: (key: string, name: string, personId: Id | undefined) => void;
  onAdopt: (candidate: ClaimCandidate) => void;
  onCancelAdopt: () => void;
  onSettle: (key: string) => void;
  /** 候補を、既存の証言の出典として書き足します。 */
  onAddSource: (candidate: ClaimCandidate, claimId: Id) => void;
  /** 採用中の候補で、既存の証言との照合の種類を選びます。 */
  onChooseCrossCheck: (claimId: Id, kind: CrossCheckKind | undefined) => void;
};

/** 原文とケースに照らし合わせた候補の一覧です。確かめ終えた候補は示しません。 */
function CandidateList({
  interviewId,
  extracted,
  settledKeys,
  mediaName,
  adopting,
  personChoices,
  onChoosePerson,
  onAdopt,
  onCancelAdopt,
  onSettle,
  onAddSource,
  onChooseCrossCheck,
}: CandidateListProps) {
  const currentCase = useCurrentCase();
  const built = buildClaimCandidates(currentCase, interviewId, extracted);
  const { discardedCount } = built;
  const candidates = built.candidates.map((candidate) => applyPersonChoices(candidate, personChoices[candidate.key]));
  const remaining = candidates.filter((candidate) => !settledKeys.has(candidate.key));
  const claimViewById = new Map(buildTimeline(currentCase).items.map(({ view }) => [view.claim.id, view]));
  /** 既存の証言を、「発言者（経由）: 証言の名前」の1行で示します。 */
  const sameClaimLabelOf = (claimId: Id): string => {
    const view = claimViewById.get(claimId);
    if (view === undefined) throw new Error(`証言が見つかりません: ${claimId}`);
    return `${describeClaimAttribution(currentCase, view.claim)}: ${claimLabelOf(view)}`;
  };

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
          {remaining.map((candidate) => {
            const unresolved = ambiguousNamesOf(candidate);
            const builtCandidate = built.candidates.find((item) => item.key === candidate.key);
            if (builtCandidate === undefined) throw new Error(`候補が見つかりません: ${candidate.key}`);
            return (
              <li key={candidate.key} className="space-y-2 rounded-md border bg-background p-2 text-sm">
                {candidate.title && <p className="font-medium">{candidate.title}</p>}
                <p>{candidate.content}</p>
                <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">
                  {candidate.quote.seconds !== undefined && <span className="mr-1">{formatQuoteSeconds(candidate.quote.seconds)}</span>}
                  {stripTimestampLines(candidate.quote.text)}
                </blockquote>
                <dl className="grid gap-0.5 text-xs">
                  {describeCandidate(candidate, mediaName).map(({ term, description }) => (
                    <div key={term} className="flex gap-1">
                      <dt className="shrink-0 text-muted-foreground">{`${term}: `}</dt>
                      <dd>{description}</dd>
                    </div>
                  ))}
                </dl>
                {ambiguousNamesOf(builtCandidate).map((ambiguous) => (
                  <PersonChoice
                    key={normalizeName(ambiguous.name)}
                    ambiguous={ambiguous}
                    value={personChoices[candidate.key]?.[normalizeName(ambiguous.name)]}
                    onChange={(personId) => onChoosePerson(candidate.key, ambiguous.name, personId)}
                  />
                ))}
                {unresolved.length > 0 && (
                  <p className="text-xs text-muted-foreground">人物を選ぶと、採用・出典の書き足しができます。</p>
                )}
                {candidate.overlapsTranscribed && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">書き起こし済みの範囲と重なります。同じ証言を二重に登録しないよう確かめてください。</p>
                )}
                {candidate.sameClaimIds.length > 0 && (
                  <div className="space-y-1 rounded bg-muted/40 px-2 py-1.5 text-xs">
                    <p className="text-muted-foreground">
                      次の既存の証言と同じかもしれません。同じ発言が別の資料にも載ったものなら、新しい証言にせず出典を書き足してください。
                    </p>
                    <ul aria-label="同じかもしれない既存の証言" className="space-y-1">
                      {candidate.sameClaimIds.map((claimId) => {
                        const label = sameClaimLabelOf(claimId);
                        const claim = claimViewById.get(claimId)?.claim;
                        const alreadySourced = claim !== undefined && sourceForInterview(claim, interviewId) !== undefined;
                        return (
                          <li key={claimId} className="flex items-start justify-between gap-2">
                            <span>{label}</span>
                            {alreadySourced ? (
                              <span className="shrink-0 text-muted-foreground">この資料をすでに出典に持っています</span>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={`この証言に出典を書き足す: ${label}`}
                                onClick={() => onAddSource(candidate, claimId)}
                                disabled={unresolved.length > 0}
                                className="shrink-0"
                              >
                                この証言に出典を書き足す
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {adopting?.key === candidate.key ? (
                  <section aria-label="候補からの証言の書き足し" className="space-y-2 border-t pt-2">
                    {candidate.sameClaimIds.map((claimId) => (
                      <CrossCheckChoice
                        key={claimId}
                        label={sameClaimLabelOf(claimId)}
                        value={adopting.crossCheckKinds[claimId]}
                        onChange={(kind) => onChooseCrossCheck(claimId, kind)}
                      />
                    ))}
                    <ClaimForm
                      defaults={adopting.defaults}
                      withEntries={(claimId) => crossCheckEntriesOf(claimId, adopting.crossCheckKinds)}
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
                    <Button type="button" size="sm" onClick={() => onAdopt(candidate)} disabled={unresolved.length > 0}>
                      採用
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 採用した候補から保存する証言 claimId と、選んだ既存の証言との照合を、証言とあわせて保存する要素にします。
 * 照合の claimIds は、新しい証言・既存の証言の順にします（照合は向きを持たないため、並びに意味はありません）。
 */
function crossCheckEntriesOf(claimId: Id, crossCheckKinds: Adopting['crossCheckKinds']): UpsertEntry[] {
  return Object.entries(crossCheckKinds).flatMap(([existingClaimId, kind]): UpsertEntry[] =>
    kind === undefined ? [] : [{ key: 'crossChecks', entity: { id: nanoid(), claimIds: [claimId, existingClaimId], kind } }]
  );
}

type PersonChoiceProps = {
  ambiguous: AmbiguousName;
  /** 選んだ人物です。選んでいない場合は undefined です。 */
  value: Id | undefined;
  onChange: (personId: Id | undefined) => void;
};

/** 2人以上に一致した名前が、どの人物かを選ぶ欄です。既定は「選んでいない」で、黙って1人に決めません。 */
function PersonChoice({ ambiguous, value, onChange }: PersonChoiceProps) {
  const fieldId = useId();
  return (
    <div className="text-xs">
      <label htmlFor={fieldId} className={LABEL_CLASS}>
        「{ambiguous.name}」はどの人物か
      </label>
      <select
        id={fieldId}
        value={value ?? NO_PERSON}
        onChange={(event) => onChange(ambiguous.matches.find((match) => match.id === event.target.value)?.id)}
        className={INPUT_CLASS}
      >
        <option value={NO_PERSON}>選んでください</option>
        {ambiguous.matches.map((match) => (
          <option key={match.id} value={match.id}>
            {match.name}
          </option>
        ))}
      </select>
    </div>
  );
}

type CrossCheckChoiceProps = {
  /** 既存の証言を示す1行です。 */
  label: string;
  value: CrossCheckKind | undefined;
  onChange: (kind: CrossCheckKind | undefined) => void;
};

/** 採用した候補と、同じかもしれない既存の証言1件との照合の種類を選ぶ欄です。既定は「照合を作らない」です。 */
function CrossCheckChoice({ label, value, onChange }: CrossCheckChoiceProps) {
  const fieldId = useId();
  return (
    <div>
      <label htmlFor={fieldId} className={LABEL_CLASS}>
        「{label}」との照合
      </label>
      <select
        id={fieldId}
        value={value ?? NO_CROSS_CHECK}
        onChange={(event) => onChange(CROSS_CHECK_KINDS.find((kind) => kind === event.target.value))}
        className={INPUT_CLASS}
      >
        <option value={NO_CROSS_CHECK}>照合を作らない</option>
        {CROSS_CHECK_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {CROSS_CHECK_KIND_LABELS[kind]}
          </option>
        ))}
      </select>
    </div>
  );
}
