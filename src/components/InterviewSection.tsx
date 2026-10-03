/**
 * 人物の詳細に並べる「供述の変遷」
 *
 * その人物が相手（相手が複数の資料では、そのうちの1人）の資料（Interview。証言を得た機会）を日時の早い順に並べ、
 * 各資料の下に、その資料で得た証言を並べます。
 * 初回の供述と後の供述の食い違いを、資料ごとに見比べられるようにするためです（導出は src/domain/interviews.ts）。
 * 資料1件の表示と、編集・削除・証言の書き足し・本文からの書き起こしは、資料のカード（InterviewCard）が担います。
 * 「この資料の証言を書き足す」では、開いている人物を発言者に選んでおきます。
 *
 * 「資料を追加」は、開いている人物を相手に選んだ状態の資料のフォーム（InterviewForm）を、この節の中に開きます。
 * 資料はサイドバーの「資料」の「＋」からも登録できます（src/app/cases/[caseId]/interviews/new/page.tsx）。
 */
'use client';

import { useState } from 'react';
import { buildPersonInterviews } from '@/domain/interviews';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
import { Button } from '@/components/ui/button';
import { InterviewForm } from './forms/InterviewForm';
import { InterviewCard } from './InterviewCard';
import type { TabKey } from './routes';

/** この節の見出しです。読み上げのための名前（aria-label）にも使います。 */
const SECTION_LABEL = '供述の変遷';

type InterviewSectionProps = {
  personId: Id;
  /** リンク先のURLに引き継ぐ、開いているタブです。 */
  tab: TabKey;
};

export function InterviewSection({ personId, tab }: InterviewSectionProps) {
  const currentCase = useCurrentCase();
  const [isAdding, setIsAdding] = useState(false);

  const interviews = buildPersonInterviews(currentCase, personId);
  const closeForm = () => setIsAdding(false);

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">資料{interviews.length}件</span>
      </h3>

      {interviews.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          「資料を追加」から、この人物の供述が載った資料（記事・動画・調書や、聴き取った機会）を登録できます。
        </p>
      ) : (
        <ol className="space-y-2">
          {interviews.map((view) => (
            <li key={view.interview.id}>
              <InterviewCard view={view} tab={tab} speakerPersonId={personId} />
            </li>
          ))}
        </ol>
      )}

      {isAdding ? (
        <section aria-label="資料の登録" className="rounded-lg border bg-card p-3">
          <InterviewForm defaultSubjectPersonIds={[personId]} onDone={closeForm} onCancel={closeForm} />
        </section>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsAdding(true)}>
          資料を追加
        </Button>
      )}
    </section>
  );
}
