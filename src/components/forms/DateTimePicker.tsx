/**
 * 日時を選ぶピッカー（カレンダーと時刻の選択）
 *
 * 証言の本文で「@date」「@datetime」（日本語では「@日付」「@日時」）と書いたときに開き、
 * 選んだ値を時刻参照（TimeRef、ISO 8601の部分表記）として呼び出し元に返します。
 *
 * ブラウザの日時入力欄（input[type=date] / input[type=datetime-local]）は使いません。
 * それらは値がそろった瞬間に change イベントを出すため、カレンダーで日を押しただけで確定してしまい、
 * 日時のピッカーでは時刻を選ぶ前に閉じてしまっていました。
 * このピッカーは「決定」を押したときにだけ値を返し、それまでは何度でも選び直せます。
 *
 * 年は入力欄、月は選択欄と前後の月のボタンで移します。数十年前の日付でも少ない操作で辿り着けるようにするためです。
 * 注意: このピッカーは証言のフォームの中で開くため、Enterキーはフォームの送信ではなく「決定」として扱います
 * （入力欄や選択欄でEnterキーを押すと、ブラウザがフォームを送信してしまうためです）。
 * 注意: 年・月を移した結果、選んでいた日がその月に存在しない場合（1月31日から2月へ移した場合など）は、日の選択を解除します。
 *
 * 「終わりを指定する」を選ぶと、「19:10から19:40の間」のような幅（区間）を選べます。
 * 終わりは、選んでいた始まりと同じ日時から編集を始めます。同じ日の中の幅なら、時刻だけを選び直せば済むためです。
 * 「始まり」「終わり」のボタンで、カレンダーと時刻の欄がどちらを編集するかを切り替えます。
 * 返す値は ISO 8601 の区間表記です。同じ日の中の日時の幅は、終わりの日付を省略します（'2026-09-28T19:10/19:40'）。
 * 終わりが始まりより前の間は「決定」を押せません。
 */
'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { DatePickerKind } from '@/domain/date-input';
import { INPUT_CLASS } from './fields';

/** 日曜から土曜までの見出しです。 */
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/** 月の選択欄に並べる月です。 */
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** 時・分の選択欄に並べる値です。 */
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);

/** 年の入力として受け付ける文字列（1〜4桁の数字）です。 */
const YEAR_PATTERN = /^\d{1,4}$/;

/** うるう年かどうかを返します。 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** その年月の日数を返します。 */
function daysInMonth(year: number, month: number): number {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1]!;
}

/**
 * その年月の1日の曜日（0が日曜）を返します。
 * 100年より前の年も正しく扱うため、いったん2000年で組み立ててから年を設定します
 * （Date のコンストラクタは0〜99の年を1900年代として解釈するためです）。
 */
function firstWeekdayOf(year: number, month: number): number {
  const first = new Date(Date.UTC(2000, month - 1, 1));
  first.setUTCFullYear(year);
  return first.getUTCDay();
}

/** 数値を、ISO 8601の部分表記の桁数に揃えます。 */
function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

/** 始まり・終わりのそれぞれで選んでいる日時です。 */
type Endpoint = {
  /** 年の入力欄の文字列です。打ち直す途中は空や不完全な値になりえます。 */
  yearText: string;
  month: number;
  /** 選んでいる日です。選んでいない場合は null です。 */
  day: number | null;
  hour: number;
  minute: number;
};

/** カレンダーと時刻の欄が編集している側です。 */
type EditingSide = 'start' | 'end';

/** 選び終えた日時を、ISO 8601の日付（YYYY-MM-DD）と時刻（HH:MM）に分けたものです。日か年が未確定なら null です。 */
function completedOf(endpoint: Endpoint): { date: string; time: string } | null {
  if (!YEAR_PATTERN.test(endpoint.yearText) || endpoint.day === null) return null;
  return {
    date: `${pad(Number(endpoint.yearText), 4)}-${pad(endpoint.month, 2)}-${pad(endpoint.day, 2)}`,
    time: `${pad(endpoint.hour, 2)}:${pad(endpoint.minute, 2)}`,
  };
}

/** 選んだ日時を、ピッカーの精度に合わせた部分表記にします。 */
function formatEndpoint({ date, time }: { date: string; time: string }, kind: DatePickerKind): string {
  return kind === 'datetime' ? `${date}T${time}` : date;
}

/** 「始まり」「終わり」のボタンに添える、選んでいる日時の表示です。 */
function describeEndpoint(endpoint: Endpoint, kind: DatePickerKind): string {
  const completed = completedOf(endpoint);
  if (!completed) return '未選択';
  const text = `${Number(endpoint.yearText)}年${endpoint.month}月${endpoint.day}日`;
  return kind === 'datetime' ? `${text} ${completed.time}` : text;
}

/**
 * 選んだ始まりと終わりから、ピッカーが返す値を組み立てます。
 * 終わりを指定していない場合は区間ではない部分表記を、指定した場合は区間表記を返します。
 * 同じ日の中の日時の幅は終わりの日付を省略し、日付のピッカーで始まりと終わりが同じ日なら区間にしません。
 * 未確定の日時がある場合と、終わりが始まりより前の場合は null を返します。
 */
function buildValue(start: Endpoint, end: Endpoint | null, kind: DatePickerKind): string | null {
  const startValue = completedOf(start);
  if (!startValue) return null;
  const startText = formatEndpoint(startValue, kind);
  if (end === null) return startText;

  const endValue = completedOf(end);
  if (!endValue) return null;
  const endText = formatEndpoint(endValue, kind);
  // 同じ桁数に揃えた ISO 8601 の表記は、文字列の大小が日時の前後と一致する
  if (endText < startText) return null;
  if (endText === startText && kind === 'date') return startText;
  return startValue.date === endValue.date && kind === 'datetime'
    ? `${startText}/${endValue.time}`
    : `${startText}/${endText}`;
}

type DateTimePickerProps = {
  /** 選ぶ精度です。date は日まで、datetime は分までを選びます。 */
  kind: DatePickerKind;
  /** 「決定」を押したときに、選んだ日時を時刻参照（区間を選んだ場合は区間表記）として渡します。 */
  onSelect: (value: string) => void;
  /** 「キャンセル」またはEscapeキーで閉じるときに呼び出します。 */
  onCancel: () => void;
};

/**
 * 日時を選ぶピッカーです。開いた時点では今日の年月を表示し、日は選んでいない状態から始めます。
 * 開いた直後に年の入力欄へフォーカスを移し、キーボードだけでも操作を続けられるようにします。
 */
export function DateTimePicker({ kind, onSelect, onCancel }: DateTimePickerProps) {
  const labelId = useId();
  const reversedMessageId = useId();
  const yearRef = useRef<HTMLInputElement>(null);
  const [start, setStart] = useState<Endpoint>(() => {
    const today = new Date();
    return { yearText: String(today.getFullYear()), month: today.getMonth() + 1, day: null, hour: 0, minute: 0 };
  });
  /** 区間の終わりです。「終わりを指定する」を選んでいない場合は null です。 */
  const [end, setEnd] = useState<Endpoint | null>(null);
  const [editing, setEditing] = useState<EditingSide>('start');

  useEffect(() => {
    yearRef.current?.focus();
  }, []);

  const current = editing === 'end' && end !== null ? end : start;
  const updateCurrent = (changes: Partial<Endpoint>) => {
    if (editing === 'end' && end !== null) {
      setEnd({ ...end, ...changes });
    } else {
      setStart({ ...start, ...changes });
    }
  };

  const { yearText, month, day, hour, minute } = current;
  const year = YEAR_PATTERN.test(yearText) ? Number(yearText) : null;
  const dayCount = year === null ? 0 : daysInMonth(year, month);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const blanks = year === null ? [] : Array.from({ length: firstWeekdayOf(year, month) }, (_, index) => index);

  const value = buildValue(start, end, kind);
  /** 始まりと終わりを選び終えているのに、終わりが始まりより前になっているかどうかです。 */
  const isReversed = value === null && completedOf(start) !== null && end !== null && completedOf(end) !== null;

  /**
   * 年月を移します。移した先に選んでいた日が無い場合は、日の選択を解除します。
   * 注意: 年を打ち直す途中は入力欄が空になりますが、その一時的な状態では選択を解除しません
   * （打ち直した年に同じ日があるのに選び直しを強いることになるためです）。年が空の間は「決定」を押せません。
   */
  const showMonth = (nextYearText: string, nextMonth: number) => {
    const changes: Partial<Endpoint> = { yearText: nextYearText, month: nextMonth };
    if (YEAR_PATTERN.test(nextYearText) && day !== null && day > daysInMonth(Number(nextYearText), nextMonth)) {
      changes.day = null;
    }
    updateCurrent(changes);
  };

  /** 前後の月へ移します。年をまたぐ場合は年も移します。 */
  const stepMonth = (step: number) => {
    if (year === null) return;
    const moved = month + step;
    const nextYear = year + Math.floor((moved - 1) / 12);
    const nextMonth = ((((moved - 1) % 12) + 12) % 12) + 1;
    showMonth(String(nextYear), nextMonth);
  };

  /** 終わりの指定を切り替えます。指定するときは、始まりと同じ日時から終わりの編集を始めます。 */
  const toggleEnd = (checked: boolean) => {
    setEnd(checked ? start : null);
    setEditing(checked ? 'end' : 'start');
  };

  const confirm = () => {
    if (value === null) return;
    onSelect(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // 日本語入力の変換を確定するキーでは、閉じたり確定したりしない
    if (event.nativeEvent.isComposing) return;
    // 日時を選ばずに本文へ戻れるよう、Escapeキーで閉じる
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    // 外側のフォームを送信させないため、日を選んでいない場合もEnterキーの既定の動作を止める
    if (event.key !== 'Enter') return;
    event.preventDefault();
    confirm();
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="w-64 rounded border border-border bg-background p-2 shadow-lg"
      onKeyDown={handleKeyDown}
    >
      <p id={labelId} className="sr-only">
        {kind === 'datetime' ? '日時を選ぶ' : '日付を選ぶ'}
      </p>
      {end !== null && (
        <div className="mb-2 grid grid-cols-2 gap-1">
          {(['start', 'end'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={editing === side}
              className={`rounded border px-1.5 py-1 text-left text-xs ${editing === side ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => setEditing(side)}
            >
              <span className="block font-medium">{side === 'start' ? '始まり' : '終わり'}</span>
              <span className="block">{describeEndpoint(side === 'start' ? start : end, kind)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="前の月"
          className="rounded px-1.5 py-1 text-sm text-foreground hover:bg-muted"
          onClick={() => stepMonth(-1)}
        >
          ‹
        </button>
        <input
          ref={yearRef}
          type="number"
          aria-label="年"
          className={`${INPUT_CLASS} w-20`}
          value={yearText}
          onChange={(event) => showMonth(event.target.value, month)}
        />
        <select
          aria-label="月"
          className={`${INPUT_CLASS} w-16`}
          value={String(month)}
          onChange={(event) => showMonth(yearText, Number(event.target.value))}
        >
          {MONTHS.map((value) => (
            <option key={value} value={String(value)}>
              {value}月
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="次の月"
          className="rounded px-1.5 py-1 text-sm text-foreground hover:bg-muted"
          onClick={() => stepMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
        {blanks.map((index) => (
          <span key={`blank-${index}`} />
        ))}
        {days.map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${year}年${month}月${value}日`}
            aria-pressed={value === day}
            className={`rounded py-1 text-sm ${value === day ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
            onClick={() => updateCurrent({ day: value })}
          >
            {value}
          </button>
        ))}
      </div>
      {kind === 'datetime' && (
        <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          <select
            aria-label="時"
            className={`${INPUT_CLASS} w-16`}
            value={String(hour)}
            onChange={(event) => updateCurrent({ hour: Number(event.target.value) })}
          >
            {HOURS.map((value) => (
              <option key={value} value={String(value)}>
                {pad(value, 2)}
              </option>
            ))}
          </select>
          <span>時</span>
          <select
            aria-label="分"
            className={`${INPUT_CLASS} w-16`}
            value={String(minute)}
            onChange={(event) => updateCurrent({ minute: Number(event.target.value) })}
          >
            {MINUTES.map((value) => (
              <option key={value} value={String(value)}>
                {pad(value, 2)}
              </option>
            ))}
          </select>
          <span>分</span>
        </div>
      )}
      <label className="mt-2 flex items-center gap-1.5 text-xs text-foreground">
        <input type="checkbox" checked={end !== null} onChange={(event) => toggleEnd(event.target.checked)} />
        終わりを指定する
      </label>
      {isReversed && (
        <p id={reversedMessageId} className="mt-1 text-xs text-destructive">
          終わりが始まりより前です
        </p>
      )}
      <div className="mt-2 flex justify-end gap-1">
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={onCancel}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          disabled={value === null}
          aria-describedby={isReversed ? reversedMessageId : undefined}
          onClick={confirm}
        >
          決定
        </button>
      </div>
    </div>
  );
}
