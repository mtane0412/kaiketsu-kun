/**
 * 証言1件の表示
 *
 * 時系列ビューと証言者別ビューで共有します。
 * ユーザーの推測は、人物の発言と見分けられるよう破線の枠と「推測」の表示で区別します。
 * 本文のメンションは、種類ごとに色分けして「@現在の名前」の形で表示します。
 * 見出しのある証言は、見出しを表示し、本文は「本文を表示」を開くまで折りたたみます（長い本文がボードを占めないようにするためです）。
 * onOpenEntity を渡すとメンションがボタンになり、onEdit・onOpenDetails を渡すと証言の編集・詳細ボタンを表示します。
 */
import { formatViaLabel, type ClaimView } from '@/domain/case-views';
import type { MentionKind } from '@/domain/mention';
import type { Id } from '@/domain/types';

const MENTION_STYLES: Record<MentionKind, string> = {
  person: 'bg-sky-100 text-sky-800',
  place: 'bg-emerald-100 text-emerald-800',
};

type ClaimCardProps = {
  view: ClaimView;
  /** 発言者名を表示するかどうかです。証言者別ビューではグループ見出しと重複するため非表示にします。 */
  showSpeaker: boolean;
  /** 本文のメンションが選ばれたときに呼び出します。エンティティの編集を開く導線です。 */
  onOpenEntity?: (kind: MentionKind, id: Id) => void;
  /** 証言の編集ボタンが選ばれたときに呼び出します。 */
  onEdit?: () => void;
  /** 証言の詳細ボタンが選ばれたときに呼び出します。日時を編集する導線です。 */
  onOpenDetails?: () => void;
};

export function ClaimCard({ view, showSpeaker, onOpenEntity, onEdit, onOpenDetails }: ClaimCardProps) {
  const { claim } = view;
  const isUserSpeculation = claim.speaker.kind === 'user';
  const content = (
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
  );

  return (
    <li
      className={`rounded border p-3 text-sm ${
        isUserSpeculation ? 'border-dashed border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
        {isUserSpeculation && <span className="rounded bg-violet-200 px-1.5 py-0.5 font-medium text-violet-800">推測</span>}
        {showSpeaker && <span className="font-semibold text-slate-800">{view.speakerLabel}</span>}
        {view.viaPersons.length > 0 && (
          <span className="text-slate-500">{formatViaLabel(view.viaPersons.map((person) => person.name))}</span>
        )}
        <span className="ml-auto flex gap-2">
          {onEdit && (
            <button type="button" aria-label="この証言を編集" onClick={onEdit} className="text-sky-700 hover:underline">
              編集
            </button>
          )}
          {onOpenDetails && (
            <button type="button" aria-label="この証言の詳細" onClick={onOpenDetails} className="text-sky-700 hover:underline">
              詳細
            </button>
          )}
        </span>
      </div>

      {claim.title ? (
        <>
          <p className="font-semibold text-slate-900">{claim.title}</p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-slate-500">本文を表示</summary>
            <div className="mt-1">{content}</div>
          </details>
        </>
      ) : (
        content
      )}

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-slate-500">
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
        {claim.locator && (
          <>
            <dt>資料内の位置</dt>
            <dd>{claim.locator}</dd>
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
