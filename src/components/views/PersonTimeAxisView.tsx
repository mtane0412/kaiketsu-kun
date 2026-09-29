/**
 * 人物の動きビューの時刻軸の表示
 *
 * 縦軸を時刻に取り、人物ごとの列に、その人物が登場する証言の日時の区間を帯として描きます（src/domain/person-time-axis.ts）。
 * 帯の無い時間帯は斜線で塗り、その人物の所在を述べる証言が無い時間帯（アリバイの穴）として見せます。
 * 帯は、その証言の詳細ページへのリンクです。帯の色は、列の人物にとっての役割（発言・言及）を表します。
 *
 * 「注目する時間帯」（犯行の推定時刻など）を入力すると、その時間帯を全列に重ねて塗り、
 * 各列の見出しに、その時間帯と重なる証言があるか（「証言あり」）、無いか（「空白」）を示します。
 * 「表示する範囲」を入力すると、時刻軸をその範囲に絞ります。入力しない場合は、注目する時間帯の前後、
 * または、すべての帯を含む範囲を表示します（resolveAxisRange）。
 * どちらも、本文の「@」と同じ日時の表記（「〜」でつないだ区間を含む。src/domain/date-input.ts）で書きます。
 * 入力はケースに保存しません。表示の都合であり、犯行の推定時刻そのものも、誰かの証言として記録するものだからです。
 *
 * 注意: 精度の粗い証言（年・月だけの日時）は、その期間全体の帯になります。注目する時間帯と重なれば「証言あり」に数えるため、
 * 帯の長さを見て、所在を確かめられるほど細かい証言かどうかを読み手が判断します。
 */
'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { claimLabelOf } from '@/domain/case-views';
import { parseDateInput } from '@/domain/date-input';
import { PERSON_KIND_LABELS } from '@/domain/labels';
import {
  buildPersonTimeAxis,
  buildTimeTicks,
  placeInRange,
  resolveAxisRange,
  type PersonTimeBand,
} from '@/domain/person-time-axis';
import { formatTimeRef, intervalsOverlap, toInterval, type Interval } from '@/domain/time-ref';
import type { Case, PersonKind } from '@/domain/types';
import { EntityAvatar } from '../EntityAvatar';
import { INPUT_CLASS } from '../forms/fields';
import { claimHref } from '../routes';
import { useCaseId } from '../useCaseId';
import { ROLE_LABELS, ROLE_STYLES } from './lane-role-style';

/** 時刻軸の高さ（ピクセル）です。 */
const AXIS_HEIGHT_PX = 720;

/**
 * 時刻軸の上下の余白です。範囲の端にある目盛りの表記（目盛りの位置を中心に描く）が、見出しや枠に隠れないようにするためです。
 * 目盛りの列と人物の列で同じ余白にし、目盛りと帯の高さをそろえます。
 */
const AXIS_PADDING_CLASS = 'py-3';

/** 帯の最小の高さです。1分間の証言も、見出しを読める高さで描くためです。 */
const MIN_BAND_HEIGHT = '1.25rem';

/** 帯の無い時間帯の斜線です。 */
const GAP_PATTERN = 'repeating-linear-gradient(135deg, transparent 0 6px, var(--muted) 6px 8px)';

/** 日時の入力欄の書き方の例です。 */
const WINDOW_EXAMPLE = '例: 1998年8月12日19時〜20時';

/** 入力欄の日時を解釈した結果です。空欄は interval が null、解釈できない場合は invalid が true です。 */
type ParsedWindow = { interval: Interval | null; invalid: boolean };

/** 入力欄の日時を解釈します。 */
function parseWindow(text: string): ParsedWindow {
  if (text.trim() === '') return { interval: null, invalid: false };
  const ref = parseDateInput(text);
  return ref === null ? { interval: null, invalid: true } : { interval: toInterval(ref), invalid: false };
}

type TimeWindowFieldProps = {
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
};

/** 時間帯を書く入力欄です。解釈できない場合は、理由を欄の下に示します。 */
function TimeWindowField({ label, value, invalid, onChange }: TimeWindowFieldProps) {
  const id = useId();
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1 text-xs">
      <label htmlFor={id} className="font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className={`${INPUT_CLASS} w-64`}
        placeholder={WINDOW_EXAMPLE}
        value={value}
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid && (
        <p id={errorId} className="text-destructive">
          日時として解釈できません（{WINDOW_EXAMPLE}、1998-08-12T19:00/20:00）
        </p>
      )}
    </div>
  );
}

type PersonTimeAxisViewProps = {
  target: Case;
  /** 列にする人物の種別です。 */
  shownKinds: ReadonlySet<PersonKind>;
};

export function PersonTimeAxisView({ target, shownKinds }: PersonTimeAxisViewProps) {
  const caseId = useCaseId();
  const [focusText, setFocusText] = useState('');
  const [rangeText, setRangeText] = useState('');
  const axis = useMemo(() => buildPersonTimeAxis(target, shownKinds), [target, shownKinds]);
  const focus = parseWindow(focusText);
  const explicitRange = parseWindow(rangeText);
  const range = resolveAxisRange(axis.extent, focus.interval, explicitRange.interval);
  const ticks = range ? buildTimeTicks(range) : [];

  /** 区間を、時刻軸の中の上端と高さの指定（CSS）にします。範囲の外の区間は null を返します。 */
  const styleOf = (interval: Interval) => {
    const placed = range && placeInRange(interval, range);
    if (!placed) return null;
    return { top: `${placed.top * 100}%`, height: `${(placed.bottom - placed.top) * 100}%` };
  };
  const focusStyle = focus.interval && styleOf(focus.interval);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <TimeWindowField label="注目する時間帯" value={focusText} invalid={focus.invalid} onChange={setFocusText} />
        <TimeWindowField label="表示する範囲" value={rangeText} invalid={explicitRange.invalid} onChange={setRangeText} />
      </div>
      <div className="text-xs text-muted-foreground">
        <p>帯は、証言が述べる日時の幅です。斜線の時間帯は、その人物の所在を述べる証言がありません。</p>
        {axis.undatedCount > 0 && <p>日時を述べない証言（{axis.undatedCount}件）は、時刻軸に表示しません。</p>}
      </div>
      {range === null ? (
        <p className="text-sm text-muted-foreground">日時を述べる証言がありません。時間帯を入力すると、その範囲を表示します。</p>
      ) : (
        <section
          aria-label="人物の動きの時刻軸"
          className="max-h-[calc(100svh-14rem)] overflow-auto rounded-lg border"
        >
          <div className="flex min-w-max">
            {/* 目盛りの列。横にスクロールしても見えるよう、枠の左端に貼り付ける */}
            <div className="sticky left-0 z-20 w-28 shrink-0 border-r bg-background">
              <div className="sticky top-0 z-10 h-20 border-b bg-muted p-2 text-xs font-medium">日時</div>
              <div className={AXIS_PADDING_CLASS}>
                <div className="relative" style={{ height: AXIS_HEIGHT_PX }}>
                  {ticks.map((tick) => (
                    <span
                      key={tick.at}
                      className="absolute left-2 -translate-y-1/2 text-xs text-muted-foreground"
                      style={{ top: styleOf({ start: tick.at, end: tick.at })?.top }}
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {axis.lanes.map((lane) => {
              const bands = axis.bandsByPerson[lane.personId] ?? [];
              const focusInterval = focus.interval;
              const focusCount = focusInterval
                ? bands.filter((band) => intervalsOverlap(band.interval, focusInterval)).length
                : null;
              return (
                <section key={lane.personId} aria-label={lane.label} className="w-48 shrink-0 border-r">
                  <div className="sticky top-0 z-10 h-20 border-b bg-muted p-2 text-sm font-semibold">
                    <span className="flex items-center gap-2">
                      <EntityAvatar
                        imageDataUrl={lane.imageDataUrl}
                        iconText={lane.iconText}
                        personKind={lane.personKind}
                        size="md"
                      />
                      <span className="truncate">
                        {lane.label}
                        {lane.personKind !== 'individual' && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {PERSON_KIND_LABELS[lane.personKind]}
                          </span>
                        )}
                      </span>
                    </span>
                    {focusCount !== null && (
                      <span
                        className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-normal ${focusCount > 0 ? 'bg-foreground text-background' : 'border border-destructive text-destructive'}`}
                      >
                        {focusCount > 0 ? `証言あり（${focusCount}件）` : '空白'}
                      </span>
                    )}
                  </div>
                  <div className={AXIS_PADDING_CLASS}>
                    <div className="relative" style={{ height: AXIS_HEIGHT_PX, backgroundImage: GAP_PATTERN }}>
                      {ticks.map((tick) => (
                        <span
                          key={tick.at}
                          aria-hidden="true"
                          className="absolute inset-x-0 border-t border-dashed border-border"
                          style={{ top: styleOf({ start: tick.at, end: tick.at })?.top }}
                        />
                      ))}
                      {focusStyle && (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 bg-amber-300/30 ring-1 ring-amber-500/50"
                          style={focusStyle}
                        />
                      )}
                      {bands.map((band) => (
                        <TimeBand key={band.key} band={band} caseId={caseId} style={styleOf(band.interval)} />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

type TimeBandProps = {
  band: PersonTimeBand;
  caseId: string;
  /** 時刻軸の中の上端と高さです。範囲の外の帯は null で、描きません。 */
  style: { top: string; height: string } | null;
};

/** 1件の証言の帯です。証言の詳細ページへのリンクになります。同じ列で重なる帯は、横に並べて描きます。 */
function TimeBand({ band, caseId, style }: TimeBandProps) {
  if (!style) return null;
  const when = band.view.claim.when === undefined ? '' : formatTimeRef(band.view.claim.when);
  const label = `${ROLE_LABELS[band.role]} ${when} ${claimLabelOf(band.view)}`;
  const width = 100 / band.columnCount;
  return (
    <Link
      href={claimHref(caseId, band.view.claim.id, 'lanes')}
      aria-label={label}
      title={label}
      className={`absolute overflow-hidden rounded px-1 text-xs leading-5 shadow-sm hover:z-10 hover:ring-2 hover:ring-ring ${ROLE_STYLES[band.role]}`}
      style={{ ...style, minHeight: MIN_BAND_HEIGHT, left: `${band.column * width}%`, width: `${width}%` }}
    >
      <span className="block truncate">{claimLabelOf(band.view)}</span>
    </Link>
  );
}
