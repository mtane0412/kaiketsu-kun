/**
 * 主張の発言者と経由を選ぶボタンと、その選択肢のパネル
 *
 * 投稿ボタンの横に「発言者: ○○」のボタンを置き、押すと選択肢のパネルを開きます。パネルには2つの欄があります。
 * - 発言者: 内容を述べた人物です。複数人が同じことを述べたと伝えられている場合は、全員を選びます。
 *   誰も選ばない場合は、ユーザーの推測になります。
 * - 経由: 発言者の話をユーザーに伝えた人物や媒体です。選んだ順が、伝えた順になります。
 *   例「防犯カメラに映っていたと県警が発表したと新聞が報じた」→ 発言者: 防犯カメラ、経由: 県警 → 新聞
 * どちらの欄でも、未登録の人物を「人物を追加」から名前だけで新規作成できます。
 *
 * パネルは、ボタンをもう一度押す・Escapeキーを押す・パネルの外を押す、のいずれかで閉じます。
 * ボード上の入力欄は画面の下端にも上端にも開くため、パネルは、開く時点でボタンの上下のうち空きが広い側に開きます。
 */
'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { USER_SPEAKER_LABEL } from '@/domain/case-views';
import type { Claim, Id, Speaker } from '@/domain/types';

/** 入力中の発言者と経由です。どちらも選んだ順に並びます。 */
export type SpeakerDraft = { personIds: Id[]; viaPersonIds: Id[] };

/** 発言者・経由として選べる人物です。 */
export type SpeakerPersonOption = { id: Id; label: string };

/** 保存済みの主張の発言者と経由を、入力中の形に変換します。省略時は、どちらも未選択（ユーザーの推測）です。 */
export function speakerToDraft(claim: Pick<Claim, 'speaker' | 'viaPersonIds'> | undefined): SpeakerDraft {
  return {
    personIds: claim?.speaker.kind === 'person' ? claim.speaker.personIds : [],
    viaPersonIds: claim?.viaPersonIds ?? [],
  };
}

/** 入力中の発言者を、保存用の発言者に変換します。誰も選んでいない場合は、ユーザーの推測です。 */
export function toSpeaker(draft: SpeakerDraft): Speaker {
  return draft.personIds.length > 0 ? { kind: 'person', personIds: draft.personIds } : { kind: 'user' };
}

type PersonChecklistProps = {
  /** 欄の名前です（「発言者」「経由」）。 */
  legend: string;
  description: string;
  selectedIds: Id[];
  onChange: (selectedIds: Id[]) => void;
  persons: SpeakerPersonOption[];
  onCreatePerson: (name: string) => SpeakerPersonOption;
};

/** 人物を複数選ぶ欄です。選んだ順を保ち、未登録の人物を名前だけで新規作成できます。 */
function PersonChecklist({ legend, description, selectedIds, onChange, persons, onCreatePerson }: PersonChecklistProps) {
  const [newPersonName, setNewPersonName] = useState('');
  const newPersonInputId = useId();

  const toggle = (id: Id, checked: boolean) => {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((selectedId) => selectedId !== id));
  };

  /** 入力した名前の人物を選びます。登録済みの名前ならその人物を選び、未登録なら新規作成します。 */
  const addPerson = () => {
    const name = newPersonName.trim();
    if (name === '') return;
    const person = persons.find((candidate) => candidate.label === name) ?? onCreatePerson(name);
    if (!selectedIds.includes(person.id)) toggle(person.id, true);
    setNewPersonName('');
  };

  const handleNewPersonKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    // Enterキーでフォーム全体が送信されないようにする。日本語入力の変換を確定するEnterキーでは追加しない
    event.preventDefault();
    if (!event.nativeEvent.isComposing) addPerson();
  };

  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-semibold text-slate-700">{legend}</legend>
      <p className="text-xs text-slate-500">{description}</p>
      <div className="max-h-32 space-y-1 overflow-auto">
        {persons.map((person) => (
          <label key={person.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.includes(person.id)}
              onChange={(event) => toggle(person.id, event.target.checked)}
            />
            {person.label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <label htmlFor={newPersonInputId} className="sr-only">
          {`${legend}に人物を追加`}
        </label>
        <input
          id={newPersonInputId}
          type="text"
          value={newPersonName}
          onChange={(event) => setNewPersonName(event.target.value)}
          onKeyDown={handleNewPersonKeyDown}
          placeholder="人物を追加（新規作成も可）"
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:border-sky-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={addPerson}
          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          追加
        </button>
      </div>
    </fieldset>
  );
}

type SpeakerPickerProps = {
  value: SpeakerDraft;
  onChange: (value: SpeakerDraft) => void;
  /** 発言者・経由として選べる人物です（このフォームで新規作成した、保存前の人物を含みます）。 */
  persons: SpeakerPersonOption[];
  /** 未登録の名前から人物を新規作成し、その人物を返します。 */
  onCreatePerson: (name: string) => SpeakerPersonOption;
};

export function SpeakerPicker({ value, onChange, persons, onCreatePerson }: SpeakerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  /** パネルをボタンの上側に開くかどうかです。開く時点の画面内の位置から決めます。 */
  const [opensUpward, setOpensUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // パネルの外を押したら閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const namesOf = (ids: Id[]) => ids.flatMap((id) => persons.find((person) => person.id === id)?.label ?? []);
  const speakerNames = namesOf(value.personIds).join('、') || `なし（${USER_SPEAKER_LABEL}）`;
  const viaNames = namesOf(value.viaPersonIds).join(' → ');
  const currentLabel = viaNames ? `${speakerNames}（${viaNames} による）` : speakerNames;

  const toggleOpen = () => {
    if (!isOpen && toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect();
      setOpensUpward(window.innerHeight - rect.bottom < rect.top);
    }
    setIsOpen(!isOpen);
  };

  const handleContainerKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault();
    setIsOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div ref={containerRef} onKeyDown={handleContainerKeyDown} className="relative mr-auto min-w-0">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggleOpen}
        className="max-w-full truncate rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        {`発言者: ${currentLabel}`}
      </button>
      {isOpen && (
        <div
          id={panelId}
          role="group"
          aria-label="発言者を選ぶ"
          className={`absolute left-0 z-10 w-72 space-y-3 rounded border border-slate-300 bg-white p-2 text-sm shadow-lg ${opensUpward ? 'bottom-full mb-1' : 'mt-1'}`}
        >
          <PersonChecklist
            legend="発言者"
            description={`内容を述べた人物や媒体です。誰も選ばない場合は、${USER_SPEAKER_LABEL}になります。`}
            selectedIds={value.personIds}
            onChange={(personIds) => onChange({ ...value, personIds })}
            persons={persons}
            onCreatePerson={onCreatePerson}
          />
          <PersonChecklist
            legend="経由"
            description="発言者の話を伝えた人物や媒体です。伝えた順に選びます（例: 県警 → 新聞）。"
            selectedIds={value.viaPersonIds}
            onChange={(viaPersonIds) => onChange({ ...value, viaPersonIds })}
            persons={persons}
            onCreatePerson={onCreatePerson}
          />
        </div>
      )}
    </div>
  );
}
