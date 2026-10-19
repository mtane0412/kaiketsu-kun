/**
 * 資料の格（Interview.grade）の一覧
 *
 * 格の並び（INTERVIEW_GRADES）は、資料の入力フォームの選択肢の並びと、読み込み時の検証（case-schema.ts）に使います。
 * 表示名は src/domain/labels.ts の INTERVIEW_GRADE_LABELS を参照してください。
 */
import type { InterviewGrade } from './types';

/** すべての格です。出来事に近く、検証を経た格から順に並べます。 */
export const INTERVIEW_GRADES = ['primary', 'majorReport', 'specialist', 'secondaryReport', 'sns', 'unverified'] as const satisfies readonly InterviewGrade[];
