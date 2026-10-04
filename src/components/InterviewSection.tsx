/**
 * 人物の詳細に並べる「供述の変遷」
 *
 * その人物が発言者の証言を含む資料（Interview。証言を得た機会）を日時の早い順に並べ、
 * 各資料の下に、その資料で得た証言を並べます。資料に載っている人物は、資料にひもづく証言の発言者から導きます。
 * 初回の供述と後の供述の食い違いを、資料ごとに見比べられるようにするためです（導出は src/domain/interviews.ts）。
 * 資料1件の表示と、編集・削除・証言の書き足し・本文からの書き起こしは、資料のカード（InterviewCard）が担います。
 * 「この資料の証言を書き足す」では、開いている人物を発言者に選んでおきます。
 *
 * 資料の登録は、サイドバーの「資料」の「＋」から行います（src/app/cases/[caseId]/interviews/new/page.tsx）。
 * 人物の詳細から登録しても、証言をひもづけるまではこの節に並ばず、かえって分かりにくいためです。
 */
'use client';

import { buildPersonInterviews } from '@/domain/interviews';
import type { Id } from '@/domain/types';
import { useCurrentCase } from '@/stores/useCaseStore';
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
  const interviews = buildPersonInterviews(currentCase, personId);

  return (
    <section aria-label={SECTION_LABEL} className="space-y-2">
      <h3 className="text-sm font-semibold">
        {SECTION_LABEL}
        <span className="ml-2 text-xs font-normal text-muted-foreground">資料{interviews.length}件</span>
      </h3>

      {interviews.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          この人物の証言を資料にひもづけると、ここに資料ごとに並びます。資料は、サイドバーの「資料」から登録できます。
        </p>
      ) : (
        <ol className="space-y-2">
          {interviews.map((view) => (
            <li key={view.interview.id}>
              <InterviewCard view={view} tab={tab} speakerPersonId={personId} collapsesLongTranscript />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
