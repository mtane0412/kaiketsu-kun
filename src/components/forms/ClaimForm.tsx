/**
 * 主張（証言・ソース自体の記述・ユーザーの推測）の入力フォーム
 *
 * 入力の中心は本文の1欄です。本文に「@」で人物・場所・出来事・ソースを書くと、発言者・ソース・
 * 対象の出来事・場所・言及している人物を本文から導出します（規則は src/domain/mention.ts を参照）。
 * 未登録の名前は候補の一覧から新規作成でき、新しいエンティティは主張と同時に保存します。
 * 本文から導出できない項目（日時・評価・ソース内の位置）は「詳細」にまとめています。
 *
 * initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState, type FormEvent } from 'react';
import { USER_SPEAKER_LABEL } from '@/domain/case-views';
import { ASSESSMENT_LABELS, MENTION_KIND_LABELS } from '@/domain/labels';
import {
  claimToDraft,
  deriveClaimLinks,
  draftToContent,
  parseContent,
  type ClaimDraft,
  type DraftMention,
  type MentionKind,
} from '@/domain/mention';
import { draftToTimeRef, timeRefToDraft } from '@/domain/time-ref-draft';
import type { Assessment, Case, Claim } from '@/domain/types';
import { useCaseStore, type UpsertEntry } from '@/stores/useCaseStore';
import { FormError, SelectField, SubmitButton, TextField, TimeRefInput } from './fields';
import { MentionTextarea, type MentionCandidate } from './MentionTextarea';

const SOURCE_SPEAKER_LABEL = 'ソース自体の記述';

/** 案件に登録済みのエンティティを、メンションの候補に変換します。 */
function caseToCandidates(target: Case): MentionCandidate[] {
  return [
    ...target.persons.map((person) => ({
      kind: 'person' as const,
      id: person.id,
      label: person.name,
      keywords: person.aliases,
    })),
    ...target.places.map((place) => ({ kind: 'place' as const, id: place.id, label: place.name })),
    ...target.events.map((event) => ({ kind: 'event' as const, id: event.id, label: event.title })),
    ...target.sources.map((source) => ({ kind: 'source' as const, id: source.id, label: source.title })),
  ];
}

/** 名前だけを持つ新しいエンティティを、保存用の形で作成します。詳細は各エンティティの編集画面で後から入力します。 */
function createEntry(kind: MentionKind, id: string, name: string): UpsertEntry {
  switch (kind) {
    case 'person':
      return { key: 'persons', entity: { id, name } };
    case 'place':
      return { key: 'places', entity: { id, name } };
    case 'event':
      return { key: 'events', entity: { id, title: name } };
    case 'source':
      return { key: 'sources', entity: { id, title: name, kind: 'other' } };
  }
}

type ClaimFormProps = {
  initial?: Claim;
  onDone: () => void;
};

export function ClaimForm({ initial, onDone }: ClaimFormProps) {
  const currentCase = useCaseStore((state) => state.currentCase);
  const upsertMany = useCaseStore((state) => state.upsertMany);

  const [draft, setDraft] = useState<ClaimDraft>(() =>
    initial ? claimToDraft(initial, currentCase) : { text: '', mentions: [] }
  );
  /** このフォームで新規作成した、まだ保存していないエンティティです。 */
  const [pending, setPending] = useState<{ mention: DraftMention; entry: UpsertEntry }[]>([]);
  const [locator, setLocator] = useState(initial?.locator ?? '');
  const [statedAt, setStatedAt] = useState(timeRefToDraft(initial?.statedAt));
  const [when, setWhen] = useState(timeRefToDraft(initial?.when));
  const [assessment, setAssessment] = useState<Assessment>(initial?.assessment ?? 'unverified');
  const [error, setError] = useState<string | null>(null);

  const hasDetails = Boolean(initial?.locator || initial?.statedAt || initial?.when);
  const candidates = [...caseToCandidates(currentCase), ...pending.map((item) => item.mention)];

  const content = draftToContent({ ...draft, text: draft.text.trim() });
  const links = deriveClaimLinks(content);
  const labelOf = (kind: MentionKind, id: string | undefined) =>
    candidates.find((candidate) => candidate.kind === kind && candidate.id === id)?.label;
  const speakerLabel =
    links.speaker.kind === 'person'
      ? labelOf('person', links.speaker.personId)
      : links.speaker.kind === 'source'
        ? SOURCE_SPEAKER_LABEL
        : USER_SPEAKER_LABEL;
  const summaryItems: { term: string; description: string | undefined }[] = [
    { term: '発言者', description: speakerLabel },
    { term: MENTION_KIND_LABELS.source, description: labelOf('source', links.sourceId) },
    { term: MENTION_KIND_LABELS.event, description: labelOf('event', links.eventId) },
    { term: MENTION_KIND_LABELS.place, description: labelOf('place', links.placeId) },
    { term: '言及', description: links.mentionedPersonIds.map((id) => labelOf('person', id)).join('、') },
  ];

  const handleCreate = (kind: MentionKind, name: string): DraftMention => {
    const mention = { kind, id: nanoid(), label: name };
    setPending((current) => [...current, { mention, entry: createEntry(kind, mention.id, name) }]);
    return mention;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (links.speaker.kind === 'person' && links.sourceId === undefined) {
      setError('人物の証言にはソースが必要です。本文に「@ソース名」を加えてください');
      return;
    }
    const statedAtResult = draftToTimeRef(statedAt);
    if (!statedAtResult.ok) {
      setError(`述べられた時点: ${statedAtResult.error}`);
      return;
    }
    const whenResult = draftToTimeRef(when);
    if (!whenResult.ok) {
      setError(`証言が述べる日時: ${whenResult.error}`);
      return;
    }

    // 未入力の任意項目はキーごと持たせない（JSONの書き出しと読み込みで形が変わらないようにするため）
    const claim: Claim = { id: initial?.id ?? nanoid(), content, assessment, ...links };
    if (locator.trim()) claim.locator = locator.trim();
    if (statedAtResult.value) claim.statedAt = statedAtResult.value;
    if (whenResult.value) claim.when = whenResult.value;

    // 新規作成した後に本文から消されたエンティティは保存しない
    const mentionedIds = new Set(
      parseContent(content).flatMap((segment) => (segment.type === 'mention' ? [segment.id] : []))
    );
    const newEntries = pending.filter((item) => mentionedIds.has(item.mention.id)).map((item) => item.entry);

    try {
      upsertMany([...newEntries, { key: 'claims', entity: claim }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <MentionTextarea
        label="内容"
        value={draft}
        onChange={setDraft}
        candidates={candidates}
        onCreate={handleCreate}
        required
        placeholder="例: @隣家の住人: 夜9時ごろ @湖畔の別荘 の庭に @別荘の持ち主 の姿が見えた。 @架空日報 朝刊"
      />
      <p className="text-xs text-slate-500">
        「@」で人物・場所・出来事・ソースを参照します。未登録の名前はその場で作成できます。先頭を「@人物:」にすると、その人物の証言になります。
      </p>
      <dl
        aria-label="本文から読み取った参照"
        className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
      >
        {summaryItems
          .filter((item) => item.description)
          .map((item) => (
            <div key={item.term} className="contents">
              <dt className="font-medium">{item.term}</dt>
              <dd>{item.description}</dd>
            </div>
          ))}
      </dl>
      <details open={hasDetails} className="rounded border border-slate-200 p-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">
          詳細（日時・評価・ソース内の位置）
        </summary>
        <div className="mt-2 space-y-3">
          <TimeRefInput legend="証言が述べる日時" value={when} onChange={setWhen} />
          <TimeRefInput legend="述べられた時点" value={statedAt} onChange={setStatedAt} />
          <div className="grid grid-cols-2 gap-2">
            <TextField label="ソース内の位置" value={locator} onChange={setLocator} placeholder="ページ、話数など" />
            <SelectField
              label="評価"
              value={assessment}
              onChange={(value) => setAssessment(value as Assessment)}
              options={Object.entries(ASSESSMENT_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </div>
        </div>
      </details>
      <FormError message={error} />
      <SubmitButton label="主張を保存" />
    </form>
  );
}
