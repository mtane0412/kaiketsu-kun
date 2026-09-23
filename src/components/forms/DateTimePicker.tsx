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

type DateTimePickerProps = {
  /** 選ぶ精度です。date は日まで、datetime は分までを選びます。 */
  kind: DatePickerKind;
  /** 「決定」を押したときに、選んだ日時を時刻参照として渡します。 */
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
  const yearRef = useRef<HTMLInputElement>(null);
  const today = new Date();
  const [yearText, setYearText] = useState(String(today.getFullYear()));
  const [month, setMonth] = useState(today.getMonth() + 1);
  /** 選んでいる日です。選んでいない場合は null です。 */
  const [day, setDay] = useState<number | null>(null);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    yearRef.current?.focus();
  }, []);

  const year = YEAR_PATTERN.test(yearText) ? Number(yearText) : null;
  const dayCount = year === null ? 0 : daysInMonth(year, month);
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const blanks = year === null ? [] : Array.from({ length: firstWeekdayOf(year, month) }, (_, index) => index);

  /** 年月を移します。移した先に選んでいた日が無い場合は、日の選択を解除します。 */
  const showMonth = (nextYearText: string, nextMonth: number) => {
    setYearText(nextYearText);
    setMonth(nextMonth);
    const nextYear = YEAR_PATTERN.test(nextYearText) ? Number(nextYearText) : null;
    if (day !== null && (nextYear === null || day > daysInMonth(nextYear, nextMonth))) setDay(null);
  };

  /** 前後の月へ移します。年をまたぐ場合は年も移します。 */
  const stepMonth = (step: number) => {
    if (year === null) return;
    const moved = month + step;
    const nextYear = year + Math.floor((moved - 1) / 12);
    const nextMonth = ((((moved - 1) % 12) + 12) % 12) + 1;
    showMonth(String(nextYear), nextMonth);
  };

  const confirm = () => {
    if (year === null || day === null) return;
    const date = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
    onSelect(kind === 'datetime' ? `${date}T${pad(hour, 2)}:${pad(minute, 2)}` : date);
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
            onClick={() => setDay(value)}
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
            onChange={(event) => setHour(Number(event.target.value))}
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
            onChange={(event) => setMinute(Number(event.target.value))}
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
          disabled={day === null}
          onClick={confirm}
        >
          決定
        </button>
      </div>
    </div>
  );
}
