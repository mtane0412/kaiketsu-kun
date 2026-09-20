/**
 * 主張の発言者を選ぶボタンと、その選択肢のパネル
 *
 * 投稿ボタンの横に「発言者: ○○」のボタンを置き、押すと選択肢のパネルを開きます。
 * 発言の種類（人物の証言・ソース自体の記述・ユーザーの推測）を必ず明示的に選びます。
 * 「人物の証言」では、登録済みの人物を複数選べます（1つのソースが、複数人が同じことを述べたと伝える場合のためです）。
 * 未登録の人物は「人物を追加」から名前だけで新規作成できます。
 *
 * パネルは、ボタンをもう一度押す・Escapeキーを押す・パネルの外を押す、のいずれかで閉じます。
 * ボード上の入力欄は画面の下端にも上端にも開くため、パネルは、開く時点でボタンの上下のうち空きが広い側に開きます。
 */
'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { USER_SPEAKER_LABEL } from '@/domain/case-views';
import type { Id, Speaker } from '@/domain/types';

/**
 * 入力中の発言者です。
 * 注意: 発言の種類を「人物の証言」から切り替えても選んだ人物を失わないよう、種類に関わらず personIds を保持します。
 * 保存時に toSpeaker で Speaker に変換します。
 */
export type SpeakerDraft = { kind: Speaker['kind']; personIds: Id[] };

/** 発言者として選べる人物です。 */
export type SpeakerPersonOption = { id: Id; label: string };

/** 発言の種類の選択肢です。この順序で表示します。 */
export const SPEAKER_KIND_LABELS: { kind: Speaker['kind']; label: string }[] = [
  { kind: 'person', label: '人物の証言' },
  { kind: 'source', label: 'ソース自体の記述' },
  { kind: 'user', label: USER_SPEAKER_LABEL },
];

const NO_PERSON_SELECTED_LABEL = '人物を選択';

/** 保存済みの発言者を、入力中の発言者に変換します。省略時は「ユーザーの推測」です。 */
export function speakerToDraft(speaker: Speaker | undefined): SpeakerDraft {
  if (speaker === undefined) return { kind: 'user', personIds: [] };
  return { kind: speaker.kind, personIds: speaker.kind === 'person' ? speaker.personIds : [] };
}

/** 入力中の発言者を、保存用の発言者に変換します。 */
export function toSpeaker(draft: SpeakerDraft): Speaker {
  return draft.kind === 'person' ? { kind: 'person', personIds: draft.personIds } : { kind: draft.kind };
}

type SpeakerPickerProps = {
  value: SpeakerDraft;
  onChange: (value: SpeakerDraft) => void;
  /** 発言者として選べる人物です（このフォームで新規作成した、保存前の人物を含みます）。 */
  persons: SpeakerPersonOption[];
  /** 未登録の名前から人物を新規作成し、その人物を返します。 */
  onCreatePerson: (name: string) => SpeakerPersonOption;
};

export function SpeakerPicker({ value, onChange, persons, onCreatePerson }: SpeakerPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  /** パネルをボタンの上側に開くかどうかです。開く時点の画面内の位置から決めます。 */
  const [opensUpward, setOpensUpward] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const newPersonInputId = useId();

  // パネルの外を押したら閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  const kindLabel = SPEAKER_KIND_LABELS.find((item) => item.kind === value.kind)?.label;
  const selectedNames = value.personIds.flatMap((id) => persons.find((person) => person.id === id)?.label ?? []);
  const currentLabel =
    value.kind === 'person' ? selectedNames.join('、') || NO_PERSON_SELECTED_LABEL : kindLabel;

  const toggleOpen = () => {
    if (!isOpen && toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect();
      setOpensUpward(window.innerHeight - rect.bottom < rect.top);
    }
    setIsOpen(!isOpen);
  };

  const togglePerson = (id: Id, checked: boolean) => {
    const personIds = checked ? [...value.personIds, id] : value.personIds.filter((personId) => personId !== id);
    onChange({ ...value, personIds });
  };

  /** 入力した名前の人物を発言者に加えます。登録済みの名前ならその人物を選び、未登録なら新規作成します。 */
  const addPerson = () => {
    const name = newPersonName.trim();
    if (name === '') return;
    const person = persons.find((candidate) => candidate.label === name) ?? onCreatePerson(name);
    if (!value.personIds.includes(person.id)) togglePerson(person.id, true);
    setNewPersonName('');
  };

  const handleContainerKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault();
    setIsOpen(false);
    toggleRef.current?.focus();
  };

  const handleNewPersonKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    // Enterキーでフォーム全体が送信されないようにする。日本語入力の変換を確定するEnterキーでは追加しない
    event.preventDefault();
    if (!event.nativeEvent.isComposing) addPerson();
  };

  return (
    <div ref={containerRef} onKeyDown={handleContainerKeyDown} className="relative mr-auto">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggleOpen}
        className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        {`発言者: ${currentLabel}`}
      </button>
      {isOpen && (
        <div
          id={panelId}
          role="group"
          aria-label="発言者を選ぶ"
          className={`absolute left-0 z-10 w-64 space-y-2 rounded border border-slate-300 bg-white p-2 text-sm shadow-lg ${opensUpward ? 'bottom-full mb-1' : 'mt-1'}`}
        >
          <fieldset className="space-y-1">
            <legend className="sr-only">発言の種類</legend>
            {SPEAKER_KIND_LABELS.map((item) => (
              <label key={item.kind} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${panelId}-kind`}
                  checked={value.kind === item.kind}
                  onChange={() => onChange({ ...value, kind: item.kind })}
                />
                {item.label}
              </label>
            ))}
          </fieldset>
          {value.kind === 'person' && (
            <fieldset className="space-y-1 border-t border-slate-200 pt-2">
              <legend className="sr-only">発言者の人物</legend>
              <div className="max-h-40 space-y-1 overflow-auto">
                {persons.map((person) => (
                  <label key={person.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={value.personIds.includes(person.id)}
                      onChange={(event) => togglePerson(person.id, event.target.checked)}
                    />
                    {person.label}
                  </label>
                ))}
              </div>
              <div className="flex items-end gap-1">
                <div className="min-w-0 flex-1">
                  <label htmlFor={newPersonInputId} className="mb-1 block text-xs font-medium text-slate-600">
                    人物を追加
                  </label>
                  <input
                    id={newPersonInputId}
                    type="text"
                    value={newPersonName}
                    onChange={(event) => setNewPersonName(event.target.value)}
                    onKeyDown={handleNewPersonKeyDown}
                    placeholder="未登録の名前は新規作成"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={addPerson}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  追加
                </button>
              </div>
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}
