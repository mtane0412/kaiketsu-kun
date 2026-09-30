/**
 * 未了事項の一覧（ボードの「未了事項」タブ）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { TaskListView } from './TaskListView';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  // 前提: サンプルのケースには、対応中の「防犯カメラの映像の確認」・未着手の「管理人への再聴取」・完了した「当夜の天気の確認」がある
  resetMockNavigation('/cases/case-lakeside?tab=tasks');
});

describe('TaskListView', () => {
  it('未完了の未了事項を、状態・担当・期限・ひもづけた対象とともに、対応中・未着手の順に並べる', () => {
    render(<TaskListView target={sampleFictionalCase} />);

    const list = screen.getByRole('list', { name: '未完了の未了事項の一覧' });
    const [securityCameraCheck, caretakerReinterview] = within(list).getAllByRole('listitem');
    expect(within(securityCameraCheck!).getByRole('link', { name: /防犯カメラの映像/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/task-camera?tab=tasks'
    );
    expect(securityCameraCheck).toHaveTextContent('対応中');
    expect(securityCameraCheck).toHaveTextContent('担当: 捜査1係');
    expect(securityCameraCheck).toHaveTextContent('期限: 1998年8月20日');
    expect(caretakerReinterview).toHaveTextContent('未着手');
    expect(caretakerReinterview).toHaveTextContent('対象: 証言1件・管理人・湖畔の別荘');
    // 検証: 完了した未了事項は、未完了の一覧には並べない
    expect(within(list).queryByText(/天気/)).not.toBeInTheDocument();
  });

  it('完了した未了事項を、結果のメモとともに、別の一覧に区別して並べる', () => {
    render(<TaskListView target={sampleFictionalCase} />);

    const completeButton = screen.getByRole('list', { name: '完了した未了事項の一覧' });
    const [item] = within(completeButton).getAllByRole('listitem');
    expect(within(item!).getByRole('link', { name: /当夜の湖畔の天気を調べる/ })).toBeInTheDocument();
    expect(item).toHaveTextContent('月明かりがあった');
  });

  it('未了事項を追加するページへのリンクを置く', () => {
    render(<TaskListView target={sampleFictionalCase} />);

    expect(screen.getByRole('link', { name: '未了事項を追加' })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/tasks/new?tab=tasks'
    );
  });

  it('未了事項が1件も無い場合は、登録を促す文を表示する', () => {
    render(<TaskListView target={{ ...sampleFictionalCase, tasks: [] }} />);

    expect(screen.getByText(/まだ未了事項がありません/)).toBeInTheDocument();
  });
});
