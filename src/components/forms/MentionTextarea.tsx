/**
 * メンション（@ によるエンティティ参照）を入力できる複数行の入力欄
 *
 * 「@」を入力すると候補の一覧を開き、登録済みのエンティティを名前と別名で絞り込みます。
 * 一致する名前が無い種類については「新規作成」の選択肢を示します。
 * withDate を指定した入力欄（証言の本文）では、「@」に続けて日時を書くと、日時のメンションの候補も示します
 * （受け付ける表記は src/domain/date-input.ts を参照してください）。
 * 「@date」「@datetime」（日本語では「@日付」「@日時」）と書くと、候補から日時のピッカーを開けます。
 * ピッカーで選んだ値はそのまま時刻参照の形式のため、日時のメンションに変換して本文に差し込みます。
 * 登録済みの名前を正確に入力して空白で区切った場合は、候補を選ばなくてもメンションとして確定します。
 * 入力欄には `@表示名` の素の文字列を表示し、確定したメンションは value.mentions に保持します
 * （本文用のトークンへの変換は src/domain/mention.ts の draftToContent が行います）。
 *
 * 確定したメンションには、種類ごとの背景色をつけます。textarea は文字の一部だけを装飾できないため、
 * 同じ文字組みの層（ハイライト層）を textarea の背面に重ね、メンションの位置にだけ背景色を描きます。
 * 確定したメンションの直後（または途中）でBackspaceキーを押すと、1文字ずつではなくメンション全体を削除します。
 *
 * キーボード操作: 上下の矢印キーで候補を移動、Enterキーで選択、Escapeキーで候補を閉じます。
 * 先頭が登録済みのエンティティの場合は先頭が選択済みで、Enterキーだけで確定できます。
 * 新規作成の選択肢しか無い場合は、矢印キーで選ぶまでEnterキーは改行として働きます。
 * 注意: 日本語入力の変換を確定するEnterキーでは候補を選択せず、変換中のBackspaceキーではメンションを削除しません。
 */
'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { matchDatePickerTriggers, parseDateInput, type DatePickerKind } from '@/domain/date-input';
import { INPUT_CLASS } from './fields';
import { DATE_MENTION_LABEL, MENTION_KIND_LABELS } from '@/domain/labels';
import {
  MENTION_KINDS,
  dateMentionOf,
  findMentionQuery,
  parseDraft,
  type ClaimDraft,
  type ContentSegment,
  type DraftMention,
  type MentionKind,
  type SegmentKind,
} from '@/domain/mention';

/** 候補として示す登録済みのエンティティです。keywords には別名など、絞り込みに使う表示名以外の語を指定します。 */
export type MentionCandidate = DraftMention & { keywords?: string[] };

/** 一覧に表示する登録済みエンティティの最大件数です。 */
const MAX_EXISTING_OPTIONS = 8;

/**
 * ハイライト層でメンションにつける背景色です。
 * 注意: 文字の位置が textarea とずれるため、余白や文字の太さなど文字組みを変える指定は加えないでください。
 */
const MENTION_HIGHLIGHT_STYLES: Record<SegmentKind, string> = {
  person: 'bg-sky-100',
  place: 'bg-emerald-100',
  date: 'bg-amber-100',
};

/** textarea とハイライト層で一致させる文字組み（枠線の幅・余白・文字の大きさ・折り返し）の指定です。 */
const TEXT_LAYOUT_CLASSES = 'border px-2 py-1.5 text-sm whitespace-pre-wrap break-words [scrollbar-gutter:stable]';

/** 下書きの要素が、入力欄の文字列の中で占める長さを返します。 */
function segmentLength(segment: ContentSegment): number {
  return segment.type === 'mention' ? 1 + segment.label.length : segment.text.length;
}

type MentionOption =
  | { type: 'existing'; mention: DraftMention }
  | { type: 'create'; kind: MentionKind; name: string }
  | { type: 'picker'; picker: DatePickerKind };

/** 日時のピッカーの表示名と、対応する入力欄の型です。 */
const DATE_PICKERS: Record<DatePickerKind, { label: string; inputType: string }> = {
  date: { label: '日付を選ぶ', inputType: 'date' },
  datetime: { label: '日時を選ぶ', inputType: 'datetime-local' },
};

/**
 * 検索語に対する選択肢を、日時、登録済みのエンティティ、新規作成の順に並べて返します。
 * 日時の選択肢は、withDate を指定した入力欄で、検索語を日時として解釈できた場合にだけ示します。
 */
function buildOptions(query: string, candidates: MentionCandidate[], withDate: boolean): MentionOption[] {
  const when = withDate ? parseDateInput(query) : null;
  const date: MentionOption[] = when === null ? [] : [{ type: 'existing', mention: dateMentionOf(when) }];
  const pickers: MentionOption[] = withDate
    ? matchDatePickerTriggers(query).map((picker): MentionOption => ({ type: 'picker', picker }))
    : [];
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
  if (pickers.length > 0) return [...pickers, ...existing];

  // 同じ種類に同じ名前のエンティティがある場合は、重複を作らないよう新規作成の選択肢を出さない
  const creatable = MENTION_KINDS.filter(
    (kind) => !candidates.some((candidate) => candidate.kind === kind && candidate.label === query)
  ).map((kind): MentionOption => ({ type: 'create', kind, name: query }));
  return [...date, ...existing, ...creatable];
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
  autoFocus?: boolean;
  /** ラベルを画面に表示せず、読み上げだけに使うかどうかです。 */
  hideLabel?: boolean;
  /** 「@」に続けて書いた日時を、日時のメンションの候補として示すかどうかです。 */
  withDate?: boolean;
};

export function MentionTextarea({
  label,
  value,
  onChange,
  candidates,
  onCreate,
  required,
  placeholder,
  autoFocus,
  hideLabel,
  withDate = false,
}: MentionTextareaProps) {
  const id = useId();
  const listboxId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  /** メンションの確定後に移動させるカーソルの位置です。確定後の描画で反映します。 */
  const caretAfterUpdate = useRef<number | null>(null);
  const [caret, setCaret] = useState(value.text.length);
  /** 矢印キーで明示的に選んだ候補の位置です。選んでいない場合は null です。 */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  /** Escapeキーで候補を閉じた「@」の位置です。同じ「@」については候補を開き直しません。 */
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);
  /** 開いている日時のピッカーです。開いていない場合は null です。 */
  const [openPicker, setOpenPicker] = useState<{ kind: DatePickerKind; start: number } | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  // 新規作成では入力済みの文字列と確定後の文字列が同じになり得るため、文字列の変化を条件にせず描画のたびに確認する
  useLayoutEffect(() => {
    if (caretAfterUpdate.current === null) return;
    textareaRef.current?.setSelectionRange(caretAfterUpdate.current, caretAfterUpdate.current);
    caretAfterUpdate.current = null;
  });

  // ピッカーは、開いた直後にフォーカスを移してカレンダーを開く（候補を選んでからの操作を1回減らすため）
  useLayoutEffect(() => {
    const input = pickerRef.current;
    if (openPicker === null || input === null || document.activeElement === input) return;
    input.focus();
    // showPicker はカレンダーを開くブラウザの機能で、未対応の環境では入力欄へのフォーカスだけを行う
    if (typeof input.showPicker === 'function') input.showPicker();
  }, [openPicker]);

  const segments = parseDraft(value);

  const found = findMentionQuery(
    value.text,
    caret,
    value.mentions.map((mention) => mention.label)
  );
  const query = found !== null && found.start !== dismissedStart ? found : null;
  const options = query === null ? [] : buildOptions(query.query, candidates, withDate);
  const isOpen = query !== null && options.length > 0 && openPicker === null;
  // 先頭が登録済みのエンティティか日時のピッカーの場合だけ、矢印キーで選ばなくても先頭を選択中とする。
  // 新規作成の選択肢しか無い場合に既定で選択すると、メールアドレスの「@」の後のEnterキーなどで
  // 意図しないエンティティを作ってしまうため、明示的な選択を必須にする。
  // ピッカーは開くだけで本文を変えないため、既定で選択していても書き損じにならない。
  const activeIndex = selectedIndex ?? (options[0]?.type === 'create' ? null : 0);

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

  /** 日時のメンションを、検索語の「@」の位置に差し込みます。ピッカーで値を選んだときに呼び出します。 */
  const insertDateMention = (start: number, when: string) => {
    const mention = dateMentionOf(when);
    const inserted = `@${mention.label}`;
    caretAfterUpdate.current = start + inserted.length;
    setCaret(start + inserted.length);
    setOpenPicker(null);
    setSelectedIndex(null);
    onChange({
      text: value.text.slice(0, start) + inserted + value.text.slice(caret),
      mentions: [...value.mentions.filter((item) => item.label !== mention.label), mention],
    });
    textareaRef.current?.focus();
  };

  const choose = (option: MentionOption) => {
    if (query === null) return;
    if (option.type === 'picker') {
      setOpenPicker({ kind: option.picker, start: query.start });
      return;
    }
    const mention = option.type === 'existing' ? option.mention : onCreate(option.kind, option.name);
    const { kind, id: mentionId, label: mentionLabel } = mention;
    const inserted = `@${mentionLabel}`;
    const nextCaret = query.start + inserted.length;
    caretAfterUpdate.current = nextCaret;
    setCaret(nextCaret);
    setSelectedIndex(null);
    onChange({
      text: value.text.slice(0, query.start) + inserted + value.text.slice(caret),
      mentions: [
        ...value.mentions.filter((item) => item.label !== mentionLabel),
        { kind, id: mentionId, label: mentionLabel },
      ],
    });
    textareaRef.current?.focus();
  };

  /**
   * カーソルが確定したメンションの直後または途中にある場合に、メンション全体を削除します。削除した場合は true を返します。
   * 範囲を選択している場合は、ブラウザの既定の動作（選択範囲の削除）に任せます。
   */
  const deleteMentionBeforeCaret = (textarea: HTMLTextAreaElement): boolean => {
    if (textarea.selectionStart !== textarea.selectionEnd) return false;
    const position = textarea.selectionStart;
    let start = 0;
    for (const segment of segments) {
      const end = start + segmentLength(segment);
      if (segment.type === 'mention' && start < position && position <= end) {
        const text = value.text.slice(0, start) + value.text.slice(end);
        // 入力欄から消えたメンションは登録からも外す（同じ名前を打ち直したときに、意図せずメンションへ戻さないため）
        const remaining = parseDraft({ text, mentions: value.mentions });
        const mentions = value.mentions.filter((mention) =>
          remaining.some((item) => item.type === 'mention' && item.kind === mention.kind && item.id === mention.id)
        );
        caretAfterUpdate.current = start;
        setCaret(start);
        setSelectedIndex(null);
        setDismissedStart(null);
        onChange({ text, mentions });
        return true;
      }
      start = end;
    }
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Backspace' && !event.nativeEvent.isComposing) {
      if (deleteMentionBeforeCaret(event.currentTarget)) event.preventDefault();
      return;
    }
    if (!isOpen || query === null) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // 未選択の状態からは、下矢印キーで先頭、上矢印キーで末尾に移動する
      const from = activeIndex ?? (step === 1 ? -1 : 0);
      setSelectedIndex((from + step + options.length) % options.length);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && activeIndex !== null) {
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
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'mb-1 block text-xs font-medium text-slate-600'}>
        {label}
      </label>
      <div className="relative">
        {/* ハイライト層。文字は透明にして背景色だけを見せ、文字そのものは前面の textarea が表示する */}
        <div
          ref={highlightRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 overflow-hidden rounded border-transparent bg-white text-transparent ${TEXT_LAYOUT_CLASSES}`}
        >
          {segments.map((segment, index) =>
            segment.type === 'mention' ? (
              <span key={index} className={`rounded ${MENTION_HIGHLIGHT_STYLES[segment.kind]}`}>
                @{segment.label}
              </span>
            ) : (
              segment.text
            )
          )}
          {/* 末尾が改行の場合も textarea と同じ高さにするため、最後に改行を補う */}
          {'\n'}
        </div>
        <textarea
          ref={textareaRef}
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={isOpen && activeIndex !== null ? optionId(activeIndex) : undefined}
          className={`relative block w-full rounded border-slate-300 bg-transparent focus:border-sky-500 focus:outline-none ${TEXT_LAYOUT_CLASSES}`}
          rows={4}
          value={value.text}
          required={required}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(event) => {
            const nextText = event.target.value;
            const nextCaret = event.target.selectionStart;
            setCaret(nextCaret);
            setSelectedIndex(null);
            setDismissedStart(null);
            onChange({
              text: nextText,
              mentions: [...value.mentions, ...findTypedMention(nextText, nextCaret)],
            });
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
          onClick={(event) => setCaret(event.currentTarget.selectionStart)}
          // textarea の中をスクロールしたときに、背景色の位置がずれないようハイライト層も同じだけ動かす
          onScroll={(event) => {
            if (highlightRef.current) highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>
      {openPicker !== null && (
        <div className="absolute z-10 mt-1 rounded border border-slate-300 bg-white p-2 shadow-lg">
          <input
            ref={pickerRef}
            type={DATE_PICKERS[openPicker.kind].inputType}
            aria-label={DATE_PICKERS[openPicker.kind].label}
            className={INPUT_CLASS}
            onChange={(event) => {
              if (event.target.value) insertDateMention(openPicker.start, event.target.value);
            }}
            onKeyDown={(event) => {
              // 日時を選ばずに書き続けられるよう、Escapeキーでピッカーを閉じて本文に戻る
              if (event.key !== 'Escape') return;
              event.preventDefault();
              setOpenPicker(null);
              setDismissedStart(openPicker.start);
              textareaRef.current?.focus();
            }}
          />
        </div>
      )}
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="メンションの候補"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded border border-slate-300 bg-white py-1 text-sm shadow-lg"
        >
          {options.map((option, index) => (
            <li
              key={
                option.type === 'picker'
                  ? `picker:${option.picker}`
                  : option.type === 'existing'
                    ? `${option.mention.kind}:${option.mention.id}`
                    : `create:${option.kind}`
              }
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={`cursor-pointer px-2 py-1 ${index === activeIndex ? 'bg-sky-100' : 'hover:bg-slate-100'}`}
              // クリックで入力欄からフォーカスが外れないよう、mousedown の既定の動作を止める
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              {option.type === 'picker' ? (
                <span className="text-sky-700">{DATE_PICKERS[option.picker].label}</span>
              ) : option.type === 'existing' ? (
                <>
                  <span className="mr-1 rounded bg-slate-100 px-1 text-xs text-slate-600">
                    {option.mention.kind === 'date' ? DATE_MENTION_LABEL : MENTION_KIND_LABELS[option.mention.kind]}
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
