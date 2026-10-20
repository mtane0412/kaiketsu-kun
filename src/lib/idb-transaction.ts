/**
 * IndexedDB のトランザクションの中で要求を出す補助
 *
 * トランザクションの中で出した要求（読み書きの Promise）と、トランザクションの完了を、すべて待ってから結果を返します。
 * 途中で例外が出た場合はトランザクションを中断し、それまでの書き込みも取り消します。
 *
 * 注意:
 * - 要求には、出したその場で失敗の受け手を付けます。別の要求を待っている間に失敗しても、処理されない Promise の失敗として報告されないためです。
 * - 失敗が複数ある場合は、元の原因を投げます。中断の結果として起きる AbortError や、終わったトランザクションへの要求の例外（TransactionInactiveError）は、
 *   元の原因（容量の不足など）の結果のため、利用者に伝える理由にしません。
 */

/** inTransaction が使う、トランザクションの部分です。 */
export type AbortableTransaction = { abort(): void; done: Promise<void> };

/** 失敗の理由が、別の失敗の結果として起きるもの（中断・終わったトランザクションへの要求）かどうかを返します。 */
function isConsequentialFailure(reason: unknown): boolean {
  return reason instanceof DOMException && (reason.name === 'AbortError' || reason.name === 'TransactionInactiveError');
}

/**
 * トランザクションの中で body を実行し、body が出した要求とトランザクションの完了をすべて待ってから、body の結果を返します。
 * body は、待たずに出しっぱなしにする要求も含めて、要求をすべて track に渡します。
 *
 * - body が例外を投げた場合は、トランザクションを中断して、それまでの書き込みを取り消します
 *   （中断しないと、例外より前に出した書き込みだけが反映されてしまうためです）。
 * - 失敗した場合は、元の原因を投げます。先に失敗した要求がある場合はその失敗を、無い場合は body の例外を投げます。
 */
export async function inTransaction<T>(
  transaction: AbortableTransaction,
  body: (track: <V>(request: Promise<V>) => Promise<V>) => Promise<T>
): Promise<T> {
  const settled: Promise<PromiseSettledResult<unknown>>[] = [];
  const track = <V>(request: Promise<V>): Promise<V> => {
    settled.push(
      request.then(
        (value): PromiseSettledResult<unknown> => ({ status: 'fulfilled', value }),
        (reason: unknown): PromiseSettledResult<unknown> => ({ status: 'rejected', reason })
      )
    );
    return request;
  };
  track(transaction.done);

  let outcome: { succeeded: true; value: T } | { succeeded: false; error: unknown };
  try {
    outcome = { succeeded: true, value: await body(track) };
  } catch (error) {
    outcome = { succeeded: false, error };
    try {
      transaction.abort();
    } catch (abortError) {
      // ブラウザが既にトランザクションを中断している場合は、中断し直せない（InvalidStateError）。書き込みは取り消されているため、元の例外を伝える
      if (!(abortError instanceof DOMException && abortError.name === 'InvalidStateError')) throw abortError;
    }
  }

  const failures = (await Promise.all(settled)).flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
  const cause = failures.find((reason) => !isConsequentialFailure(reason));
  if (!outcome.succeeded) throw cause ?? outcome.error;
  if (failures.length > 0) throw cause ?? failures[0];
  return outcome.value;
}
