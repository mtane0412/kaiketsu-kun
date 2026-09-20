/**
 * メンション（@ によるエンティティ参照）を入力できる複数行の入力欄
 *
 * 「@」を入力すると候補の一覧を開き、登録済みのエンティティを名前と別名で絞り込みます。
 * 一致する名前が無い種類については「新規作成」の選択肢を示します。
 * 登録済みの名前を正確に入力して空白で区切った場合は、候補を選ばなくてもメンションとして確定します。
 * 入力欄には `@表示名` の素の文字列を表示し、確定したメンションは value.mentions に保持します
 * （本文用のトークンへの変換は src/domain/mention.ts の draftToContent が行います）。
 *
 * キーボード操作: 上下の矢印キーで候補を移動、Enterキーで選択、Escapeキーで候補を閉じます。
 * 注意: 日本語入力の変換を確定するEnterキーでは、候補を選択しません。
 */
'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MENTION_KIND_LABELS } from '@/domain/labels';
import {
  MENTION_KINDS,
  findMentionQuery,
  type ClaimDraft,
  type DraftMention,
  type MentionKind,
} from '@/domain/mention';

/** 候補として示す登録済みのエンティティです。keywords には別名など、絞り込みに使う表示名以外の語を指定します。 */
export type MentionCandidate = DraftMention & { keywords?: string[] };

/** 一覧に表示する登録済みエンティティの最大件数です。 */
const MAX_EXISTING_OPTIONS = 8;

type MentionOption = { type: 'existing'; mention: DraftMention } | { type: 'create'; kind: MentionKind; name: string };

/** 検索語に対する選択肢を、登録済みのエンティティ、新規作成の順に並べて返します。 */
function buildOptions(query: string, candidates: MentionCandidate[]): MentionOption[] {
  const normalizedQuery = query.toLowerCase();
  const existing = candidates
    .filter((candidate) =>
      [candidate.label, ...(candidate.keywords ?? [])].some((word) => word.toLowerCase().includes(normalizedQuery))
    )
    .slice(0, MAX_EXISTING_OPTIONS)
    .map((candidate): MentionOption => ({
      type: 'existing',
      mention: candidate,
    }));
  if (query === '') return existing;

  // 同じ種類に同じ名前のエンティティがある場合は、重複を作らないよう新規作成の選択肢を出さない
  const creatable = MENTION_KINDS.filter(
    (kind) => !candidates.some((candidate) => candidate.kind === kind && candidate.label === query)
  ).map((kind): MentionOption => ({ type: 'create', kind, name: query }));
  return [...existing, ...creatable];
}

type MentionTextareaProps = {
  label: string;
  value: ClaimDraft;
  onChange: (value: ClaimDraft) => void;
  candidates: MentionCandidate[];
  /** 新規作成が選ばれたときに呼び出します。作成したエンティティを指すメンションを返してください。 */
  onCreate: (kind: MentionKind, name: string) => DraftMention;
  required?: boolean;
  placeholder?: string;
};

export function MentionTextarea({
  label,
  value,
  onChange,
  candidates,
  onCreate,
  required,
  placeholder,
}: MentionTextareaProps) {
  const id = useId();
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** メンションの確定後に移動させるカーソルの位置です。確定後の描画で反映します。 */
  const caretAfterUpdate = useRef<number | null>(null);
  const [caret, setCaret] = useState(value.text.length);
  const [activeIndex, setActiveIndex] = useState(0);
  /** Escapeキーで候補を閉じた「@」の位置です。同じ「@」については候補を開き直しません。 */
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  // 新規作成では入力済みの文字列と確定後の文字列が同じになり得るため、文字列の変化を条件にせず描画のたびに確認する
  useLayoutEffect(() => {
    if (caretAfterUpdate.current === null) return;
    textareaRef.current?.setSelectionRange(caretAfterUpdate.current, caretAfterUpdate.current);
    caretAfterUpdate.current = null;
  });

  const found = findMentionQuery(
    value.text,
    caret,
    value.mentions.map((mention) => mention.label)
  );
  const query = found !== null && found.start !== dismissedStart ? found : null;
  const options = query === null ? [] : buildOptions(query.query, candidates);
  const isOpen = query !== null && options.length > 0;

  /**
   * 候補を選ばずに、登録済みの名前を正確に入力して空白で区切った場合のメンションを返します。
   * 関連づけが気づかないうちに抜けることを防ぐための処理で、同じ名前の候補が複数ある場合は確定しません。
   */
  const findTypedMention = (text: string, nextCaret: number): DraftMention[] => {
    if (!/\s/.test(text[nextCaret - 1] ?? '')) return [];
    const labels = value.mentions.map((mention) => mention.label);
    const typed = findMentionQuery(text, nextCaret - 1, labels);
    if (typed === null) return [];
    const matched = candidates.filter((candidate) => candidate.label === typed.query);
    return matched.length === 1
      ? matched.map(({ kind, id: mentionId, label: mentionLabel }) => ({
          kind,
          id: mentionId,
          label: mentionLabel,
        }))
      : [];
  };

  const choose = (option: MentionOption) => {
    if (query === null) return;
    const mention = option.type === 'existing' ? option.mention : onCreate(option.kind, option.name);
    const { kind, id: mentionId, label: mentionLabel } = mention;
    const inserted = `@${mentionLabel}`;
    const nextCaret = query.start + inserted.length;
    caretAfterUpdate.current = nextCaret;
    setCaret(nextCaret);
    setActiveIndex(0);
    onChange({
      text: value.text.slice(0, query.start) + inserted + value.text.slice(caret),
      mentions: [
        ...value.mentions.filter((item) => item.label !== mentionLabel),
        { kind, id: mentionId, label: mentionLabel },
      ],
    });
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || query === null) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((current) => (current + step + options.length) % options.length);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissedStart(query.start);
    }
  };

  const optionId = (index: number) => `${listboxId}-${index}`;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
        rows={4}
        value={value.text}
        required={required}
        placeholder={placeholder}
        onChange={(event) => {
          const nextText = event.target.value;
          const nextCaret = event.target.selectionStart;
          setCaret(nextCaret);
          setActiveIndex(0);
          setDismissedStart(null);
          onChange({
            text: nextText,
            mentions: [...value.mentions, ...findTypedMention(nextText, nextCaret)],
          });
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
        onClick={(event) => setCaret(event.currentTarget.selectionStart)}
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="メンションの候補"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-slate-300 bg-white py-1 text-sm shadow-lg"
        >
          {options.map((option, index) => (
            <li
              key={option.type === 'existing' ? `${option.mention.kind}:${option.mention.id}` : `create:${option.kind}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-2 py-1 ${index === activeIndex ? 'bg-sky-100' : 'hover:bg-slate-100'}`}
              // クリックで入力欄からフォーカスが外れないよう、mousedown の既定の動作を止める
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.type === 'existing' ? (
                <>
                  <span className="mr-1 rounded bg-slate-100 px-1 text-xs text-slate-600">
                    {MENTION_KIND_LABELS[option.mention.kind]}
                  </span>{' '}
                  {option.mention.label}
                </>
              ) : (
                <span className="text-sky-700">
                  「{option.name}」を{MENTION_KIND_LABELS[option.kind]}
                  として新規作成
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
