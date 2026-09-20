/**
 * 主張1件の表示
 *
 * 時系列ビューと証言者別ビューで共有します。
 * ユーザーの推測は、証言と見分けられるよう破線の枠と「推測」の表示で区別します。
 * 本文のメンションは、種類ごとに色分けして「@現在の名前」の形で表示します。
 * onOpenEntity を渡すとメンションがボタンになり、onEdit・onOpenDetails を渡すと主張の編集・詳細ボタンを表示します。
 */
import type { ClaimView } from '@/domain/case-views';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';

const MENTION_STYLES: Record<MentionKind, string> = {
  person: 'bg-sky-100 text-sky-800',
  place: 'bg-emerald-100 text-emerald-800',
  event: 'bg-amber-100 text-amber-800',
  source: 'bg-slate-200 text-slate-700',
};

type ClaimCardProps = {
  view: ClaimView;
  /** 発言者名を表示するかどうかです。証言者別ビューではグループ見出しと重複するため非表示にします。 */
  showSpeaker: boolean;
  /** 対象の出来事名を表示するかどうかです。時系列ビューでは出来事の下に並ぶため非表示にします。 */
  showEvent: boolean;
  /** 本文のメンションが選ばれたときに呼び出します。エンティティの編集を開く導線です。 */
  onOpenEntity?: (kind: MentionKind, id: Id) => void;
  /** 主張の編集ボタンが選ばれたときに呼び出します。 */
  onEdit?: () => void;
  /** 主張の詳細ボタンが選ばれたときに呼び出します。日時・ソース内の位置を編集する導線です。 */
  onOpenDetails?: () => void;
};

export function ClaimCard({ view, showSpeaker, showEvent, onOpenEntity, onEdit, onOpenDetails }: ClaimCardProps) {
  const { claim } = view;
  const isUserSpeculation = claim.speaker.kind === 'user';

  return (
    <li
      className={`rounded border p-3 text-sm ${
        isUserSpeculation ? 'border-dashed border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
        {isUserSpeculation && <span className="rounded bg-violet-200 px-1.5 py-0.5 font-medium text-violet-800">推測</span>}
        {showSpeaker && <span className="font-semibold text-slate-800">{view.speakerLabel}</span>}
        {view.hasTimeConflict && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">他の主張と時刻が食い違う</span>
        )}
        {view.hasPlaceConflict && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">他の主張と場所が食い違う</span>
        )}
        <span className="ml-auto flex gap-2">
          {onEdit && (
            <button type="button" aria-label="この主張を編集" onClick={onEdit} className="text-sky-700 hover:underline">
              編集
            </button>
          )}
          {onOpenDetails && (
            <button type="button" aria-label="この主張の詳細" onClick={onOpenDetails} className="text-sky-700 hover:underline">
              詳細
            </button>
          )}
        </span>
      </div>

      <p className="whitespace-pre-line text-slate-900">
        {view.contentSegments.map((segment, index) =>
          segment.type !== 'mention' ? (
            segment.text
          ) : onOpenEntity ? (
            <button
              key={index}
              type="button"
              onClick={() => onOpenEntity(segment.kind, segment.id)}
              className={`rounded px-0.5 hover:underline ${MENTION_STYLES[segment.kind]}`}
            >
              @{segment.label}
            </button>
          ) : (
            <span key={index} className={`rounded px-0.5 ${MENTION_STYLES[segment.kind]}`}>
              @{segment.label}
            </span>
          )
        )}
      </p>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-slate-500">
        {showEvent && view.event && (
          <>
            <dt>出来事</dt>
            <dd>{view.event.title}</dd>
          </>
        )}
        {claim.when && (
          <>
            <dt>述べる日時</dt>
            <dd>{claim.when.text}</dd>
          </>
        )}
        {view.place && (
          <>
            <dt>述べる場所</dt>
            <dd>{view.place.name}</dd>
          </>
        )}
        {view.mentionedPersons.length > 0 && (
          <>
            <dt>言及</dt>
            <dd>{view.mentionedPersons.map((person) => person.name).join('、')}</dd>
          </>
        )}
        {view.source && (
          <>
            <dt>ソース</dt>
            <dd>
              {view.source.title}
              {claim.locator && `（${claim.locator}）`}
            </dd>
          </>
        )}
        {claim.statedAt && (
          <>
            <dt>述べた時点</dt>
            <dd>{claim.statedAt.text}</dd>
          </>
        )}
      </dl>
    </li>
  );
}
