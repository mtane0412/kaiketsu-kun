/**
 * 証言の詳細に並べる「照合」（証言同士の突き合わせの結果の一覧・登録・編集・削除）のテスト
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleFictionalCase } from '@/domain/sample-fictional-case';
import { openedCase, openTestCase } from '@/test/open-case';
import { resetMockNavigation } from '@/test/mock-navigation';
import { CrossCheckSection } from './CrossCheckSection';

vi.mock('next/navigation', () => import('@/test/mock-navigation'));

beforeEach(() => {
  localStorage.clear();
  // 前提: サンプルのケースには、防犯カメラ↔隣家の住人（裏付ける）と、管理人↔隣家の住人（食い違う）の照合がある
  openTestCase(sampleFictionalCase);
  resetMockNavigation('/cases/case-lakeside/claims/claim-neighbor');
});

/** 隣家の住人の証言の詳細に並ぶ「照合」を描画します。 */
function 隣家の住人の照合を描画() {
  render(<CrossCheckSection claimId="claim-neighbor" tab="timeline" />);
  return screen.getByRole('region', { name: '照合' });
}

describe('CrossCheckSection', () => {
  it('照合した相手の証言を、種類・理由とともに、相手の証言の詳細へのリンクで並べる', () => {
    const 照合 = 隣家の住人の照合を描画();

    const 項目 = within(照合).getAllByRole('listitem');
    // 検証: 相手の証言の時系列の並び順（管理人 → 防犯カメラ）に並ぶ
    expect(within(項目[0]!).getByText('食い違う')).toBeInTheDocument();
    expect(within(項目[0]!).getByRole('link', { name: /見回りをしたとき/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-caretaker'
    );
    expect(within(項目[0]!).getByText(/管理人は別荘が真っ暗で/)).toBeInTheDocument();
    expect(within(項目[1]!).getByText('裏付ける')).toBeInTheDocument();
    expect(within(項目[1]!).getByRole('link', { name: /車が別荘の方向へ/ })).toHaveAttribute(
      'href',
      '/cases/case-lakeside/claims/claim-police-camera'
    );
  });

  it('照合が1件も無い証言では、照合の登録を促す案内を表示する', () => {
    render(<CrossCheckSection claimId="claim-user-guess" tab="timeline" />);

    const 照合 = screen.getByRole('region', { name: '照合' });
    expect(within(照合).getByRole('button', { name: '照合を追加' })).toBeInTheDocument();
    expect(within(照合).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('相手の証言・種類・理由を入力して保存すると、照合をケースに追加する', async () => {
    const user = userEvent.setup();
    隣家の住人の照合を描画();

    await user.click(screen.getByRole('button', { name: '照合を追加' }));
    const 登録 = screen.getByRole('region', { name: '照合の登録' });
    // 検証: 相手の選択肢に、開いている証言そのものは並ばない
    expect(within(登録).queryByRole('option', { name: /明かりがついていて/ })).not.toBeInTheDocument();
    await user.selectOptions(within(登録).getByLabelText('相手の証言'), 'claim-report');
    await user.click(within(登録).getByRole('radio', { name: '同じ事柄を述べている' }));
    await user.type(within(登録).getByLabelText('理由'), 'どちらも12日夜の持ち主の様子を述べている。');
    await user.click(within(登録).getByRole('button', { name: '照合を保存' }));

    const 追加した照合 = openedCase().crossChecks.find((crossCheck) => crossCheck.claimIds.includes('claim-report'));
    expect(追加した照合).toMatchObject({
      claimIds: ['claim-neighbor', 'claim-report'],
      kind: 'sameSubject',
      reason: 'どちらも12日夜の持ち主の様子を述べている。',
    });
    expect(screen.queryByRole('region', { name: '照合の登録' })).not.toBeInTheDocument();
  });

  it('理由を空白だけにして保存しようとすると、理由を示して保存しない', async () => {
    const user = userEvent.setup();
    隣家の住人の照合を描画();

    await user.click(screen.getByRole('button', { name: '照合を追加' }));
    const 登録 = screen.getByRole('region', { name: '照合の登録' });
    await user.selectOptions(within(登録).getByLabelText('相手の証言'), 'claim-report');
    await user.type(within(登録).getByLabelText('理由'), '   ');
    await user.click(within(登録).getByRole('button', { name: '照合を保存' }));

    expect(await within(登録).findByRole('alert')).toHaveTextContent('照合の理由がありません');
    expect(openedCase().crossChecks).toHaveLength(2);
  });

  it('照合の種類と理由を編集できる', async () => {
    const user = userEvent.setup();
    隣家の住人の照合を描画();

    await user.click(screen.getByRole('button', { name: /見回りをしたとき.*との照合（食い違う）を編集/ }));
    const 編集 = screen.getByRole('region', { name: '照合の編集' });
    // 検証: 編集では、登録済みの相手・種類・理由を初期値にする
    expect(within(編集).getByLabelText('相手の証言')).toHaveValue('claim-caretaker');
    expect(within(編集).getByRole('radio', { name: '食い違う' })).toBeChecked();
    await user.click(within(編集).getByRole('radio', { name: '同じ事柄を述べている' }));
    await user.clear(within(編集).getByLabelText('理由'));
    await user.type(within(編集).getByLabelText('理由'), '見た時刻が2時間ずれており、両立しうる。');
    await user.click(within(編集).getByRole('button', { name: '照合を保存' }));

    const 編集後 = openedCase().crossChecks.find((crossCheck) => crossCheck.id === 'cross-check-caretaker-neighbor');
    expect(編集後).toMatchObject({
      claimIds: ['claim-caretaker', 'claim-neighbor'],
      kind: 'sameSubject',
      reason: '見た時刻が2時間ずれており、両立しうる。',
    });
  });

  it('同じ相手との照合が複数ある場合も、編集・削除のボタンの名前を種類で区別する', () => {
    // 前提: 管理人の証言との間に、食い違う照合に加えて、同じ事柄を述べている照合も登録されている
    openTestCase({
      ...sampleFictionalCase,
      crossChecks: [
        ...sampleFictionalCase.crossChecks,
        {
          id: 'cross-check-caretaker-neighbor-subject',
          claimIds: ['claim-neighbor', 'claim-caretaker'],
          kind: 'sameSubject',
          reason: 'どちらも12日夜の別荘の様子を述べている。',
        },
      ],
    });

    隣家の住人の照合を描画();

    expect(screen.getByRole('button', { name: /見回りをしたとき.*との照合（食い違う）を編集/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /見回りをしたとき.*との照合（同じ事柄を述べている）を編集/ })).toBeInTheDocument();
  });

  it('照合を削除しても、照合した証言は残る', async () => {
    const user = userEvent.setup();
    隣家の住人の照合を描画();

    await user.click(screen.getByRole('button', { name: /車が別荘の方向へ.*との照合（裏付ける）を削除/ }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    const ケース = openedCase();
    expect(ケース.crossChecks.map((crossCheck) => crossCheck.id)).toEqual(['cross-check-caretaker-neighbor']);
    expect(ケース.claims.map((claim) => claim.id)).toContain('claim-police-camera');
  });
});
