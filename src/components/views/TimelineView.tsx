/**
 * 時系列ビュー
 *
 * 出来事を起きた時点の早い順に縦に並べ、各出来事の下に、その出来事についての主張を並置します。
 * 出来事の見出しにはユーザーの見立て（日時・場所・関与人物）を表示し、
 * 見立てと食い違う主張には食い違いの表示を付けます。
 */
import { useMemo } from 'react';
import { buildTimeline } from '@/domain/case-views';
import type { Case } from '@/domain/types';
import { ClaimCard } from './ClaimCard';

export function TimelineView({ target }: { target: Case }) {
  const timeline = useMemo(() => buildTimeline(target), [target]);

  if (timeline.entries.length === 0 && timeline.unlinkedClaims.length === 0) {
    return <p className="text-sm text-slate-500">出来事がまだ登録されていません。「入力」タブから登録してください。</p>;
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-4 border-l-2 border-slate-200 pl-4">
        {timeline.entries.map((entry) => (
          <li key={entry.event.id}>
            <article aria-label={entry.event.title}>
              <header className="mb-2">
                <p className="text-xs font-medium text-sky-700">{entry.event.when?.text ?? '時期不明'}</p>
                <h3 className="text-base font-semibold text-slate-900">{entry.event.title}</h3>
                <p className="text-xs text-slate-500">
                  {[entry.place?.name, entry.participants.map((person) => person.name).join('、')]
                    .filter(Boolean)
                    .join(' ／ ')}
                </p>
                {entry.event.description && <p className="mt-1 text-sm text-slate-700">{entry.event.description}</p>}
              </header>
              {entry.claims.length === 0 ? (
                <p className="text-xs text-slate-400">この出来事についての主張はまだありません。</p>
              ) : (
                <ul className="space-y-2">
                  {entry.claims.map((view) => (
                    <ClaimCard key={view.claim.id} view={view} showSpeaker showEvent={false} />
                  ))}
                </ul>
              )}
            </article>
          </li>
        ))}
      </ol>

      {timeline.unlinkedClaims.length > 0 && (
        <section aria-label="出来事に紐づかない主張">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">出来事に紐づかない主張</h3>
          <ul className="space-y-2">
            {timeline.unlinkedClaims.map((view) => (
              <ClaimCard key={view.claim.id} view={view} showSpeaker showEvent={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
