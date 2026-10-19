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
 * 精度の粗い証言（年・月・日までの日時や、日付で書いた期間）は、その期間全体の長い帯になります。
 * 時刻のある証言の帯を覆わないよう、列の左端の細い段に分けて描きます（帯の段は src/domain/person-time-axis.ts の BandTrack）。
 * 帯の幅が狭くて見出しが切れる場合に備え、帯にマウスを乗せるか、キーボードでフォーカスすると、日時と見出しの全文を帯の横に示します。
 *
 * 注意: 粗い証言も、注目する時間帯と重なれば「証言あり」に数えます。
 * 帯の段と長さを見て、所在を確かめられるほど細かい証言かどうかを読み手が判断します。
 */
'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { claimLabelOf } from '@/domain/case-views';
import { parseDateInput } from '@/domain/date-input';
import { PERSON_KIND_LABELS } from '@/domain/labels';
import {
  arrangeBands,
  buildPersonTimeAxis,
  buildTimeTicks,
  placeInRange,
  resolveAxisRange,
  type BandTrack,
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

/** 帯の最小の高さ（ピクセル）です。1分間の証言も、見出しを読める高さで描くためです。 */
const MIN_BAND_HEIGHT_PX = 20;

/** 粗い段の、帯を横に並べる1つの位置の幅（rem）です。帯の色が見分けられる最小限の幅にします。 */
const COARSE_COLUMN_REM = 0.75;

/** 粗い段と細かい段の間の隙間（rem）です。 */
const TRACK_GAP_REM = 0.125;

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
  // 最小の高さで描いた短い帯どうしが重ならないよう、最小の高さが表示する範囲の中で占める長さを考えて、横に並べる位置を決め直す
  const minVisibleMs = range ? ((range.end - range.start) * MIN_BAND_HEIGHT_PX) / AXIS_HEIGHT_PX : 0;
  const bandsByPerson = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(axis.bandsByPerson).map(([personId, bands]) => [personId, arrangeBands(bands, minVisibleMs)])
      ),
    [axis, minVisibleMs]
  );

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
        <p>列の左端の細い帯は、日付だけ・期間で述べた証言です。帯にマウスを乗せるか、Tab キーで移ると、日時と見出しを読めます。</p>
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
              const bands = bandsByPerson[lane.personId] ?? [];
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
                      <LaneTracks bands={bands} caseId={caseId} styleOf={styleOf} />
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

type LaneTracksProps = {
  bands: PersonTimeBand[];
  caseId: string;
  styleOf: (interval: Interval) => { top: string; height: string } | null;
};

/**
 * 1人の列の帯を、粗い段（左端の細い段）と細かい段（残りの幅）に分けて描きます。
 * 粗い段の幅は、その列で粗い帯を横に並べる位置の数の最大に合わせます。粗い帯が無い列では、細かい段が列の幅をすべて使います。
 */
function LaneTracks({ bands, caseId, styleOf }: LaneTracksProps) {
  const coarseColumnCount = Math.max(0, ...bands.filter((band) => band.track === 'coarse').map((band) => band.columnCount));
  const coarseWidthRem = coarseColumnCount * COARSE_COLUMN_REM;
  const fineLeftRem = coarseColumnCount === 0 ? 0 : coarseWidthRem + TRACK_GAP_REM;
  const trackBands = (track: BandTrack) =>
    bands
      .filter((band) => band.track === track)
      .map((band) => <TimeBand key={band.key} band={band} caseId={caseId} style={styleOf(band.interval)} />);
  return (
    <>
      {coarseColumnCount > 0 && (
        <div data-track="coarse" className="absolute inset-y-0 left-0" style={{ width: `${coarseWidthRem}rem` }}>
          {trackBands('coarse')}
        </div>
      )}
      <div data-track="fine" className="absolute inset-y-0 right-0" style={{ left: `${fineLeftRem}rem` }}>
        {trackBands('fine')}
      </div>
    </>
  );
}

type TimeBandProps = {
  band: PersonTimeBand;
  caseId: string;
  /** 時刻軸の中の上端と高さです。範囲の外の帯は null で、描きません。 */
  style: { top: string; height: string } | null;
};

/**
 * 1件の証言の帯です。証言の詳細ページへのリンクになります。同じ段で重なる帯は、横に並べて描きます。
 * 粗い段の帯は細いため、帯の中には見出しを書かず、色だけで描きます。
 * どちらの段の帯も、マウスを乗せるかフォーカスすると、日時と見出しの全文を帯の右に重ねて示します（data-band-popup）。
 * 全文の表示は見た目のためのもので、読み上げはリンクの名前（aria-label）が担うため、読み上げの対象から外します。
 */
function TimeBand({ band, caseId, style }: TimeBandProps) {
  if (!style) return null;
  const when = band.view.claim.when === undefined ? '' : formatTimeRef(band.view.claim.when);
  const heading = claimLabelOf(band.view);
  const label = `${ROLE_LABELS[band.role]} ${when} ${heading}`;
  const width = 100 / band.columnCount;
  return (
    <Link
      href={claimHref(caseId, band.view.claim.id, 'lanes')}
      aria-label={label}
      className={`group absolute rounded text-xs leading-5 shadow-sm hover:z-30 hover:ring-2 hover:ring-ring focus-visible:z-30 ${band.track === 'fine' ? 'px-1' : ''} ${ROLE_STYLES[band.role]}`}
      style={{ ...style, minHeight: MIN_BAND_HEIGHT_PX, left: `${band.column * width}%`, width: `${width}%` }}
    >
      {band.track === 'fine' && <span className="block truncate">{heading}</span>}
      <span
        data-band-popup
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-full z-30 ml-1 hidden w-max max-w-64 rounded border bg-popover px-2 py-1 text-xs whitespace-normal text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
      >
        <span className="block text-muted-foreground">{when}</span>
        <span className="block">{heading}</span>
      </span>
    </Link>
  );
}
