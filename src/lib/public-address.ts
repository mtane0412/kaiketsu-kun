/**
 * 記事の取得で接続してよいアドレス（インターネット上の公開アドレス）かどうかの判定（サーバーだけで使います）
 *
 * 本文の取得 API（src/app/api/fetch-article/route.ts）は、ユーザーが入力したURLへサーバーから接続します。
 * そのままでは、localhost・社内のネットワーク・クラウドのメタデータ（169.254.169.254）などへの接続の踏み台にされる（SSRF）ため、
 * 接続する直前に、名前解決した結果のアドレスを検証します（createPublicOnlyLookup）。
 * 名前解決のあとに検証するのは、検証したときと接続するときで名前解決の結果を変える攻撃（DNS リバインディング）を防ぐためです。
 */
import dns, { type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/** 接続を拒否した理由を表すエラーのコードです。src/lib/article-download.ts で、内部のアドレスとして理由を示すために使います。 */
export const NOT_PUBLIC_ADDRESS_CODE = 'ENOTPUBLIC';

/** 公開アドレスでない IPv4 の範囲です（RFC 6890 の特別な用途のアドレスと、マルチキャスト・予約済みの範囲）。 */
const BLOCKED_IPV4_SUBNETS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

/**
 * 公開アドレスでない IPv6 の範囲です。
 * IPv4 射影（::ffff:0:0/96）・NAT64・6to4 のように IPv4 のアドレスを埋め込める範囲は、
 * 埋め込んだ内部の IPv4 のアドレスへ届くおそれがあるため、範囲ごと拒否します。
 */
const BLOCKED_IPV6_SUBNETS: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

// BlockList は IPv4 のアドレスを IPv4 射影の IPv6 としても照らし合わせるため、1つにまとめると ::ffff:0:0/96 がすべての IPv4 に一致してしまう。
// そのため、IPv4 と IPv6 で別の BlockList に分ける
const blockedIpv4 = new BlockList();
for (const [network, prefix] of BLOCKED_IPV4_SUBNETS) blockedIpv4.addSubnet(network, prefix, 'ipv4');
const blockedIpv6 = new BlockList();
for (const [network, prefix] of BLOCKED_IPV6_SUBNETS) blockedIpv6.addSubnet(network, prefix, 'ipv6');

/** IPアドレスが、インターネット上の公開アドレスかどうかを返します。IPアドレスとして読めない文字列は false です。 */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return family === 4 ? !blockedIpv4.check(address, 'ipv4') : !blockedIpv6.check(address, 'ipv6');
}

/** 名前解決の処理です。解決したすべてのアドレスを返します。 */
export type Resolver = (
  hostname: string,
  options: LookupOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void
) => void;

/** OS の名前解決（dns.lookup）で、すべてのアドレスを返す処理です。 */
const systemResolver: Resolver = (hostname, options, callback) => dns.lookup(hostname, { ...options, all: true }, callback);

/**
 * 名前解決した結果に公開アドレスでないものが1件でもあれば、接続させずにエラー（コード ENOTPUBLIC）にする lookup を作ります。
 * 接続（net.connect・tls.connect）の lookup に渡して使います。
 * @param resolver - テストで名前解決を置き換えるための処理です。
 */
export function createPublicOnlyLookup(resolver: Resolver = systemResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, options, (error, addresses) => {
      if (error) {
        callback(error, '', undefined);
        return;
      }
      const blocked = addresses.find(({ address }) => !isPublicAddress(address));
      if (blocked || addresses.length === 0) {
        const refused: NodeJS.ErrnoException = new Error(`${hostname} は公開アドレスに解決されませんでした。`);
        refused.code = NOT_PUBLIC_ADDRESS_CODE;
        callback(refused, '', undefined);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const [first] = addresses;
      callback(null, first!.address, first!.family);
    });
  };
}
