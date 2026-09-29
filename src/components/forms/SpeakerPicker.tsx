/**
 * 証言の発言者と経由を選ぶボタンと、その選択肢のパネル
 *
 * 投稿ボタンの横に「発言者: ○○」のボタンを置き、押すと選択肢のパネルを開きます。パネルには2つの欄があります。
 * - 発言者: 内容を述べた人物です。複数人が同じことを述べたと伝えられている場合は、全員を選びます。
 *   誰も選ばない場合は、ユーザーの推測になります。
 * - 経由: 発言者の話をユーザーに伝えた人物や媒体です。選んだ順が、伝えた順になります。
 *   例「防犯カメラに映っていたと県警が発表したと新聞が報じた」→ 発言者: 防犯カメラ、経由: 県警 → 新聞
 * どちらの欄でも、未登録の人物を「人物を追加」から名前だけで新規作成できます。
 * 選択肢の名前には、人物ではない種別（組織・記録・媒体・物）を「（記録・媒体）」のように添えます（personKindSuffixOf）。
 *
 * パネルは、ボタンをもう一度押す・Escapeキーを押す・パネルの外を押す、のいずれかで閉じます。
 * ボード上の入力欄は画面の下端にも上端にも開くため、パネルは、開く時点でボタンの上下のうち空きが広い側に開きます。
 * 開いたまま画面の高さが変わった場合（スマートフォンでキーボードが出た場合など）は、向きと高さを決め直します。
 * 空きは、実際に見えている表示領域（visualViewport）の上端・下端から測ります。キーボードは表示領域だけを縮め、
 * window の高さと resize イベントが変わらない場合があるためです。
 * 注意: visualViewport を持たない環境では、window の高さ（上端は0）を表示領域として扱います。
 * 注意: 開く側の空きよりパネルが高い場合は、パネルの高さを空きに収め、はみ出す分はパネルの中でスクロールします
 * （画面の端からはみ出すと、パネルの一部を見ることも押すこともできなくなるためです）。
 */
'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { formatViaLabel, USER_SPEAKER_LABEL } from '@/domain/case-views';
import { personKindSuffixOf } from '@/domain/labels';
import type { Claim, Id, PersonKind, Speaker } from '@/domain/types';

/** パネルとボタンの間隔（px）です。パネルの mt-1 / mb-1 と揃えます。 */
const PANEL_GAP = 4;

/** パネルと画面の端との間に空ける余白（px）です。 */
const VIEWPORT_MARGIN = 8;

/** 入力中の発言者と経由です。どちらも選んだ順に並びます。 */
export type SpeakerDraft = { personIds: Id[]; viaPersonIds: Id[] };

/** 発言者・経由として選べる人物です。personKind は人物の種別で、選択肢の名前に添える表記に使います。 */
export type SpeakerPersonOption = { id: Id; label: string; personKind: PersonKind };

/** 保存済みの証言の発言者と経由を、入力中の形に変換します。省略時は、どちらも未選択（ユーザーの推測）です。 */
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
      <legend className="text-xs font-semibold text-foreground">{legend}</legend>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="max-h-32 space-y-1 overflow-auto">
        {persons.map((person) => (
          <label key={person.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.includes(person.id)}
              onChange={(event) => toggle(person.id, event.target.checked)}
            />
            <span>
              {person.label}
              <span className="text-muted-foreground">{personKindSuffixOf(person.personKind)}</span>
            </span>
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
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus-visible:border-ring focus:outline-none"
        />
        <button
          type="button"
          onClick={addPerson}
          className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/40"
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
  /** パネルをボタンの上側に開くかどうかです。開く時点（と画面の高さが変わった時点）の画面内の位置から決めます。 */
  const [opensUpward, setOpensUpward] = useState(false);
  /** パネルの最大の高さ（px）です。開く側の空きから決めます。 */
  const [maxPanelHeight, setMaxPanelHeight] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  /** ボタンの今の位置から、パネルを開く向きと最大の高さを決めます。 */
  const placePanel = () => {
    if (!toggleRef.current) return;
    const rect = toggleRef.current.getBoundingClientRect();
    // 表示領域の上端・下端（ボタンの位置と同じく、window の左上を原点とする座標）
    const viewport = window.visualViewport;
    const viewportTop = viewport ? viewport.offsetTop : 0;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
    const spaceAbove = rect.top - viewportTop;
    const spaceBelow = viewportBottom - rect.bottom;
    const upward = spaceBelow < spaceAbove;
    setOpensUpward(upward);
    setMaxPanelHeight((upward ? spaceAbove : spaceBelow) - PANEL_GAP - VIEWPORT_MARGIN);
  };

  // 開いたまま画面の高さや表示領域の位置が変わったら、向きと高さを決め直す
  useEffect(() => {
    if (!isOpen) return;
    const viewport = window.visualViewport;
    window.addEventListener('resize', placePanel);
    viewport?.addEventListener('resize', placePanel);
    viewport?.addEventListener('scroll', placePanel);
    return () => {
      window.removeEventListener('resize', placePanel);
      viewport?.removeEventListener('resize', placePanel);
      viewport?.removeEventListener('scroll', placePanel);
    };
  }, [isOpen]);

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
  const currentLabel = `${speakerNames}${formatViaLabel(namesOf(value.viaPersonIds))}`;

  const toggleOpen = () => {
    if (!isOpen) placePanel();
    setIsOpen(!isOpen);
  };

  const handleContainerKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !isOpen) return;
    event.preventDefault();
    setIsOpen(false);
    toggleRef.current?.focus();
  };

  return (
    <div ref={containerRef} onKeyDown={handleContainerKeyDown} className="relative min-w-0">
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggleOpen}
        className="max-w-full truncate rounded border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted/40"
      >
        {`発言者: ${currentLabel}`}
      </button>
      {isOpen && (
        <div
          id={panelId}
          role="group"
          aria-label="発言者を選ぶ"
          style={{ maxHeight: maxPanelHeight }}
          className={`absolute left-0 z-10 w-72 space-y-3 overflow-y-auto rounded border border-border bg-background p-2 text-sm shadow-lg ${opensUpward ? 'bottom-full mb-1' : 'mt-1'}`}
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
