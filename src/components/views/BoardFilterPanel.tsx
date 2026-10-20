/**
 * ボードの絞り込みの欄
 *
 * 時系列・グラフ・証言者別・人物の動き・地図の上に置き、表示する証言を、日時の範囲・人物・資料・論点で絞り込みます
 * （判定は src/domain/board-filter.ts）。
 *
 * 欄は、結果の行（件数と「解除」）と、条件の入力欄（開閉できる）の2段です。
 * 条件の入力欄は、普段は閉じておきます。ボードの本文（証言のカード）を最も目立たせるためです。
 * 結果の行は常に表示し、絞り込んでいるかどうかと件数が、欄を開かなくても分かるようにします。
 * 件数は読み上げにも届くよう、ライブリージョン（role="status"）にします。
 *
 * 条件は、入力してから「絞り込む」を押したときにまとめて反映します。選ぶたびに反映すると、
 * 日時を書いている途中や、複数の条件を選ぶ途中の状態で、証言の並びが何度も入れ替わるためです。
 * 「絞り込む」はフォームの送信ボタンのため、Enter キーでも反映できます（日本語入力の変換を確定する Enter では、ブラウザは送信しません）。
 *
 * 状態（条件）は持たず、いまの条件と、変更を伝える関数を受け取ります（持ち主は src/components/useBoardFilter.ts）。
 */
'use client';

import { ListFilter } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  BOARD_PERSON_ROLES,
  EMPTY_BOARD_FILTER,
  isBoardFilterActive,
  type BoardFilter,
  type BoardFilterResult,
  type BoardPersonRole,
} from '@/domain/board-filter';
import { parseDateInput } from '@/domain/date-input';
import { formatInterviewSourceLabel } from '@/domain/interview-source-label';
import { BOARD_PERSON_ROLE_LABELS } from '@/domain/labels';
import { formatTimeRef } from '@/domain/time-ref';
import type { Case, Id, TimeRef } from '@/domain/types';
import { INPUT_CLASS, LABEL_CLASS } from '../forms/fields';
import { boardFilterQuery } from '../routes';

/** 選択欄で「指定しない」を表す値です。IDとぶつからないよう空文字列にします。 */
const UNSELECTED = '';

/** 日時の範囲の入力欄の書き方の例です。 */
const WHEN_EXAMPLE = '例: 1998年8月12日19時〜20時';

type BoardFilterPanelProps = {
  /** 絞り込む前のケースです。人物・資料・論点の選択肢に使います。 */
  target: Case;
  /** いまの条件です。ケースに無い指定を外したもの（resolveBoardFilter）を渡します。 */
  filter: BoardFilter;
  /** いまの条件で絞り込んだ結果です。件数を示すために使います。 */
  result: BoardFilterResult;
  onChange: (next: BoardFilter) => void;
};

/** 選択欄の値を、IDか「指定しない」に直します。 */
function idOrUndefined(value: string): Id | undefined {
  return value === UNSELECTED ? undefined : value;
}

/**
 * 日時の範囲を、入力欄の初期値にします。
 * 画面の表記（「1998年8月」など）で入力し直せる場合はその表記にし、入力し直せない表記（時刻のある区間など）は、時刻参照のまま示します。
 * 入力欄の値は「絞り込む」を押すたびに読み直すため、読めない表記を初期値にすると、別の条件を変えただけで誤りになるからです。
 */
function whenInputValueOf(when: TimeRef | undefined): string {
  if (when === undefined) return '';
  const display = formatTimeRef(when);
  return parseDateInput(display) === when ? display : when;
}

/** 条件を、結果の行に添える短い説明にします（例「人物: 管理人（発言者）・論点: 12日夜、持ち主は別荘にいたか」）。 */
function describeFilter(target: Case, filter: BoardFilter): string {
  const parts: string[] = [];
  if (filter.when !== undefined) {
    parts.push(`日時: ${formatTimeRef(filter.when)}${filter.includeUndated ? '（日時の無い証言を含む）' : ''}`);
  }
  const person = target.persons.find((candidate) => candidate.id === filter.personId);
  if (person) {
    const role = filter.personRole === 'any' ? '' : `（${BOARD_PERSON_ROLE_LABELS[filter.personRole]}）`;
    parts.push(`人物: ${person.name}${role}`);
  }
  const interview = target.interviews.find((candidate) => candidate.id === filter.interviewId);
  if (interview) parts.push(`資料: ${formatInterviewSourceLabel(target, interview)}`);
  const dispute = target.disputes.find((candidate) => candidate.id === filter.disputeId);
  if (dispute) parts.push(`論点: ${dispute.title}`);
  return parts.join('・');
}

/** 絞り込みの結果を、件数の文にします。 */
function describeResult(result: BoardFilterResult, isActive: boolean): string {
  if (!isActive) return `すべての証言（${result.totalCount}件）を表示しています。`;
  const undated = result.undatedExcludedCount > 0 ? `日時の無い証言${result.undatedExcludedCount}件は除いています。` : '';
  return `${result.totalCount}件中${result.shownCount}件の証言を表示しています。${undated}`;
}

type FilterFormProps = {
  target: Case;
  filter: BoardFilter;
  id: string;
  onSubmit: (next: BoardFilter) => void;
};

/**
 * 条件の入力欄です。入力中の条件は、この部品の中だけで持ちます。
 * 呼び出し側は、条件が変わったときに key を変えて作り直し、入力欄を新しい条件にそろえます。
 */
function FilterForm({ target, filter, id, onSubmit }: FilterFormProps) {
  const fieldId = useId();
  const whenErrorId = useId();
  const [whenText, setWhenText] = useState(() => whenInputValueOf(filter.when));
  const [whenInvalid, setWhenInvalid] = useState(false);
  const [includeUndated, setIncludeUndated] = useState(filter.includeUndated);
  const [personId, setPersonId] = useState(filter.personId ?? UNSELECTED);
  const [personRole, setPersonRole] = useState<BoardPersonRole>(filter.personRole);
  const [interviewId, setInterviewId] = useState(filter.interviewId ?? UNSELECTED);
  const [disputeId, setDisputeId] = useState(filter.disputeId ?? UNSELECTED);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = whenText.trim();
    const when = trimmed === '' ? undefined : parseDateInput(trimmed);
    if (when === null) {
      setWhenInvalid(true);
      return;
    }
    setWhenInvalid(false);
    const next: BoardFilter = { ...EMPTY_BOARD_FILTER };
    if (when !== undefined) {
      next.when = when;
      next.includeUndated = includeUndated;
    }
    const selectedPersonId = idOrUndefined(personId);
    // 関わり方は人物を選んだときだけ条件にする。人物を外した後に、前に選んだ関わり方が残らないようにするため
    if (selectedPersonId !== undefined) {
      next.personId = selectedPersonId;
      next.personRole = personRole;
    }
    const selectedInterviewId = idOrUndefined(interviewId);
    if (selectedInterviewId !== undefined) next.interviewId = selectedInterviewId;
    const selectedDisputeId = idOrUndefined(disputeId);
    if (selectedDisputeId !== undefined) next.disputeId = selectedDisputeId;
    onSubmit(next);
  };

  return (
    <form id={id} onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-when`} className={LABEL_CLASS}>
          日時の範囲
        </label>
        <input
          id={`${fieldId}-when`}
          type="text"
          className={INPUT_CLASS}
          placeholder={WHEN_EXAMPLE}
          value={whenText}
          aria-invalid={whenInvalid}
          aria-describedby={whenInvalid ? whenErrorId : undefined}
          onChange={(event) => setWhenText(event.target.value)}
        />
        {whenInvalid && (
          <p id={whenErrorId} className="mt-1 text-xs text-destructive">
            日時として解釈できません（{WHEN_EXAMPLE}、1998-08-12T19:00/20:00）
          </p>
        )}
        <div className="mt-2 flex min-h-6 items-center gap-1.5 text-xs">
          <input
            id={`${fieldId}-undated`}
            type="checkbox"
            className="size-4 accent-foreground"
            checked={includeUndated}
            onChange={(event) => setIncludeUndated(event.target.checked)}
          />
          <label htmlFor={`${fieldId}-undated`} className="text-muted-foreground">
            日時の無い証言も含める
          </label>
        </div>
      </div>

      <div>
        <label htmlFor={`${fieldId}-person`} className={LABEL_CLASS}>
          人物
        </label>
        <select id={`${fieldId}-person`} className={INPUT_CLASS} value={personId} onChange={(event) => setPersonId(event.target.value)}>
          <option value={UNSELECTED}>指定しない</option>
          {target.persons.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-role`} className={LABEL_CLASS}>
          関わり方
        </label>
        <select
          id={`${fieldId}-role`}
          className={INPUT_CLASS}
          value={personRole}
          disabled={personId === UNSELECTED}
          onChange={(event) => setPersonRole(BOARD_PERSON_ROLES.find((role) => role === event.target.value) ?? 'any')}
        >
          {BOARD_PERSON_ROLES.map((role) => (
            <option key={role} value={role}>
              {BOARD_PERSON_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${fieldId}-interview`} className={LABEL_CLASS}>
          資料
        </label>
        <select
          id={`${fieldId}-interview`}
          className={INPUT_CLASS}
          value={interviewId}
          onChange={(event) => setInterviewId(event.target.value)}
        >
          <option value={UNSELECTED}>指定しない</option>
          {target.interviews.map((interview) => (
            <option key={interview.id} value={interview.id}>
              {formatInterviewSourceLabel(target, interview)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-dispute`} className={LABEL_CLASS}>
          論点
        </label>
        <select id={`${fieldId}-dispute`} className={INPUT_CLASS} value={disputeId} onChange={(event) => setDisputeId(event.target.value)}>
          <option value={UNSELECTED}>指定しない</option>
          {target.disputes.map((dispute) => (
            <option key={dispute.id} value={dispute.id}>
              {dispute.title}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <Button type="submit" size="sm">
          絞り込む
        </Button>
      </div>
    </form>
  );
}

export function BoardFilterPanel({ target, filter, result, onChange }: BoardFilterPanelProps) {
  const formId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const isActive = isBoardFilterActive(filter);

  return (
    <section aria-label="証言の絞り込み" className="mb-4 rounded-lg border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={isOpen}
          aria-controls={isOpen ? formId : undefined}
          aria-label={isOpen ? '絞り込みの条件を閉じる' : '絞り込みの条件を開く'}
          onClick={() => setIsOpen((current) => !current)}
        >
          <ListFilter aria-hidden="true" />
          絞り込み
        </Button>
        <p role="status" aria-label="絞り込みの結果" className="min-w-0 flex-1 text-xs text-muted-foreground">
          {describeResult(result, isActive)}
        </p>
        {isActive && (
          <Button type="button" variant="outline" size="sm" aria-label="絞り込みを解除" onClick={() => onChange(EMPTY_BOARD_FILTER)}>
            解除
          </Button>
        )}
      </div>
      {isActive && <p className="mt-1 text-xs text-muted-foreground">条件: {describeFilter(target, filter)}</p>}
      {isOpen && (
        <FilterForm
          // 条件が変わったら（解除・URLの変更を含む）、入力欄を新しい条件にそろえる。
          // 同じ条件なら同じ文字列になるクエリ（boardFilterQuery）で見分け、意味の変わらない違いで作り直さないようにする
          key={boardFilterQuery(filter)}
          id={formId}
          target={target}
          filter={filter}
          onSubmit={onChange}
        />
      )}
    </section>
  );
}
