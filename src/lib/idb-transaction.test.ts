/**
 * IndexedDB のトランザクションの中で要求を出す補助（inTransaction）のテスト
 *
 * トランザクションは、中断（abort）と完了（done）だけを持つ偽物で代用します。
 * 中断されると、終わっていない要求と完了は AbortError で失敗します（ブラウザの IndexedDB と同じです）。
 */
import { describe, expect, it } from 'vitest';
import { inTransaction } from './idb-transaction';

/** 中断できる偽のトランザクションです。abort を呼ぶと、done と、abortable で作った要求が AbortError で失敗します。 */
function createFakeTransaction() {
  const abortListeners: (() => void)[] = [];
  let resolveDone: () => void = () => undefined;
  let aborted = false;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    abortListeners.push(() => reject(new DOMException('The transaction was aborted.', 'AbortError')));
  });
  return {
    done,
    abort() {
      if (aborted) throw new DOMException('The transaction has finished.', 'InvalidStateError');
      aborted = true;
      for (const listener of abortListeners) listener();
    },
    /** トランザクションの完了を知らせます。 */
    complete: () => resolveDone(),
    /** 中断されるまで終わらない要求を作ります。 */
    abortable: () => new Promise<never>((_resolve, reject) => abortListeners.push(() => reject(new DOMException('aborted', 'AbortError')))),
  };
}

describe('inTransaction', () => {
  it('要求とトランザクションがすべて成功した場合は、body の結果を返す', async () => {
    const transaction = createFakeTransaction();

    const result = await inTransaction(transaction, async (track) => {
      const revision = await track(Promise.resolve('版-1'));
      track(Promise.resolve('書き込み'));
      transaction.complete();
      return revision;
    });

    expect(result).toBe('版-1');
  });

  it('body が途中で例外を投げた場合は、トランザクションを中断し、その例外を投げる', async () => {
    const transaction = createFakeTransaction();
    const pendingWrite = transaction.abortable();

    await expect(
      inTransaction(transaction, async (track) => {
        track(pendingWrite);
        throw new DOMException('値を複製できません', 'DataCloneError');
      })
    ).rejects.toMatchObject({ name: 'DataCloneError' });
  });

  it('先に要求が失敗した後で body が例外を投げた場合は、後の例外ではなく、先の失敗（元の原因）を投げる', async () => {
    const transaction = createFakeTransaction();

    await expect(
      inTransaction(transaction, async (track) => {
        // 前提: 1件目の書き込みが容量の不足で失敗し、その後の書き込みは、トランザクションが終わっているため例外になる
        await track(Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))).catch(() => undefined);
        throw new DOMException('The transaction is not active.', 'TransactionInactiveError');
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });

  it('body が成功しても、待たなかった要求が失敗した場合は、その失敗を投げる', async () => {
    const transaction = createFakeTransaction();

    await expect(
      inTransaction(transaction, async (track) => {
        track(Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')));
        transaction.complete();
      })
    ).rejects.toMatchObject({ name: 'QuotaExceededError' });
  });
});
