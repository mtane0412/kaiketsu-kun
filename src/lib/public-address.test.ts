// @vitest-environment node
/**
 * 記事の取得で接続してよいアドレス（インターネット上の公開アドレス）かどうかの判定と、
 * 名前解決の結果を検証する lookup のテスト
 */
import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';
import { createPublicOnlyLookup, isPublicAddress } from './public-address';

describe('isPublicAddress', () => {
  it.each([
    ['127.0.0.1', 'ループバック'],
    ['10.1.2.3', 'プライベート（10.0.0.0/8）'],
    ['172.16.0.1', 'プライベート（172.16.0.0/12）'],
    ['192.168.1.1', 'プライベート（192.168.0.0/16）'],
    ['169.254.169.254', 'リンクローカル（クラウドのメタデータ）'],
    ['100.64.0.1', 'キャリアグレード NAT'],
    ['0.0.0.0', '未指定'],
    ['224.0.0.1', 'マルチキャスト'],
    ['::1', 'IPv6 のループバック'],
    ['::', 'IPv6 の未指定'],
    ['fe80::1', 'IPv6 のリンクローカル'],
    ['fd00::1', 'IPv6 のユニークローカル'],
    ['::ffff:127.0.0.1', 'IPv4 射影の IPv6 で表したループバック'],
    ['::ffff:7f00:1', 'IPv4 射影の IPv6 を16進で表したループバック'],
  ])('%s（%s）は公開アドレスとみなさない', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])('%s は公開アドレスとみなす', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it('IPアドレスとして読めない文字列は、公開アドレスとみなさない', () => {
    expect(isPublicAddress('localhost')).toBe(false);
  });
});

/** 名前解決を、指定したアドレスを返す代役に置き換えた lookup を呼び、結果を返します。 */
function lookupWith(addresses: LookupAddress[], all: boolean) {
  const lookup = createPublicOnlyLookup((_hostname, _options, callback) => callback(null, addresses));
  return new Promise<{ error: NodeJS.ErrnoException | null; result: unknown }>((resolve) => {
    lookup('news.example.com', { all }, (error, address, family) => resolve({ error, result: all ? address : { address, family } }));
  });
}

describe('createPublicOnlyLookup', () => {
  it('解決したアドレスがすべて公開アドレスなら、そのまま返す', async () => {
    const { error, result } = await lookupWith([{ address: '93.184.216.34', family: 4 }], true);

    expect(error).toBeNull();
    expect(result).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it('1件だけを求められたときは、最初のアドレスを返す', async () => {
    const { error, result } = await lookupWith([{ address: '93.184.216.34', family: 4 }], false);

    expect(error).toBeNull();
    expect(result).toEqual({ address: '93.184.216.34', family: 4 });
  });

  it('解決したアドレスに内部のアドレスが1件でも含まれる場合は、接続させない', async () => {
    const { error } = await lookupWith(
      [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ],
      true
    );

    expect(error?.code).toBe('ENOTPUBLIC');
  });
});
