/**
 * 主張（証言・ソース自体の記述・ユーザーの推測）の入力フォーム
 *
 * initial を渡すと編集、省略すると新規登録になります。
 * フォームの初期値は useState の初期化でのみ設定するため、編集対象を切り替えるときは
 * 呼び出し側で key を変えて再マウントしてください。
 */
'use client';

import { nanoid } from 'nanoid';
import { useState, type FormEvent } from 'react';
import { ASSESSMENT_LABELS } from '@/domain/labels';
import { draftToTimeRef, timeRefToDraft } from '@/domain/time-ref-draft';
import type { Assessment, Claim, Speaker } from '@/domain/types';
import { useCaseStore } from '@/stores/useCaseStore';
import { FormError, SelectField, SubmitButton, TextField, TimeRefInput } from './fields';

const NONE = '';
const SPEAKER_SOURCE = 'source';
const SPEAKER_USER = 'user';
const SPEAKER_PERSON_PREFIX = 'person:';

/** 発言者を選択欄の値に変換します。 */
function speakerToValue(speaker: Speaker): string {
  return speaker.kind === 'person' ? `${SPEAKER_PERSON_PREFIX}${speaker.personId}` : speaker.kind;
}

/** 選択欄の値を発言者に変換します。 */
function valueToSpeaker(value: string): Speaker {
  if (value === SPEAKER_SOURCE) return { kind: 'source' };
  if (value === SPEAKER_USER) return { kind: 'user' };
  return { kind: 'person', personId: value.slice(SPEAKER_PERSON_PREFIX.length) };
}

type ClaimFormProps = {
  initial?: Claim;
  onDone: () => void;
};

export function ClaimForm({ initial, onDone }: ClaimFormProps) {
  const { sources, persons, places, events } = useCaseStore((state) => state.currentCase);
  const upsert = useCaseStore((state) => state.upsert);

  const [speakerValue, setSpeakerValue] = useState(initial ? speakerToValue(initial.speaker) : SPEAKER_SOURCE);
  const [sourceId, setSourceId] = useState(initial?.sourceId ?? NONE);
  const [locator, setLocator] = useState(initial?.locator ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [statedAt, setStatedAt] = useState(timeRefToDraft(initial?.statedAt));
  const [eventId, setEventId] = useState(initial?.eventId ?? NONE);
  const [mentionedPersonIds, setMentionedPersonIds] = useState(initial?.mentionedPersonIds ?? []);
  const [when, setWhen] = useState(timeRefToDraft(initial?.when));
  const [placeId, setPlaceId] = useState(initial?.placeId ?? NONE);
  const [assessment, setAssessment] = useState<Assessment>(initial?.assessment ?? 'unverified');
  const [error, setError] = useState<string | null>(null);

  const toggleMentionedPerson = (personId: string) => {
    setMentionedPersonIds((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId]
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const speaker = valueToSpeaker(speakerValue);
    if (speaker.kind !== 'user' && sourceId === NONE) {
      setError('ユーザーの推測以外の主張にはソースを選択してください');
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
    const claim: Claim = {
      id: initial?.id ?? nanoid(),
      speaker,
      content: content.trim(),
      mentionedPersonIds,
      assessment,
    };
    if (sourceId !== NONE) claim.sourceId = sourceId;
    if (locator.trim()) claim.locator = locator.trim();
    if (statedAtResult.value) claim.statedAt = statedAtResult.value;
    if (eventId !== NONE) claim.eventId = eventId;
    if (whenResult.value) claim.when = whenResult.value;
    if (placeId !== NONE) claim.placeId = placeId;

    try {
      upsert('claims', claim);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <SelectField
        label="発言者"
        value={speakerValue}
        onChange={setSpeakerValue}
        options={[
          { value: SPEAKER_SOURCE, label: 'ソース自体の記述' },
          ...persons.map((person) => ({ value: `${SPEAKER_PERSON_PREFIX}${person.id}`, label: person.name })),
          { value: SPEAKER_USER, label: 'ユーザーの推測' },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="ソース"
          value={sourceId}
          onChange={setSourceId}
          options={[{ value: NONE, label: '（なし）' }, ...sources.map((source) => ({ value: source.id, label: source.title }))]}
        />
        <TextField label="ソース内の位置" value={locator} onChange={setLocator} placeholder="ページ、話数など" />
      </div>
      <TextField label="内容" value={content} onChange={setContent} required multiline />
      <TimeRefInput legend="述べられた時点" value={statedAt} onChange={setStatedAt} />
      <SelectField
        label="対象の出来事"
        value={eventId}
        onChange={setEventId}
        options={[{ value: NONE, label: '（なし）' }, ...events.map((item) => ({ value: item.id, label: item.title }))]}
      />
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-slate-600">言及している人物</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {persons.length === 0 && <span className="text-xs text-slate-400">人物が未登録です</span>}
          {persons.map((person) => (
            <label key={person.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={mentionedPersonIds.includes(person.id)}
                onChange={() => toggleMentionedPerson(person.id)}
              />
              {person.name}
            </label>
          ))}
        </div>
      </fieldset>
      <TimeRefInput legend="証言が述べる日時" value={when} onChange={setWhen} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="証言が述べる場所"
          value={placeId}
          onChange={setPlaceId}
          options={[{ value: NONE, label: '（なし）' }, ...places.map((place) => ({ value: place.id, label: place.name }))]}
        />
        <SelectField
          label="評価"
          value={assessment}
          onChange={(value) => setAssessment(value as Assessment)}
          options={Object.entries(ASSESSMENT_LABELS).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <FormError message={error} />
      <SubmitButton label="主張を保存" />
    </form>
  );
}
