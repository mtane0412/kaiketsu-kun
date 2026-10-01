/**
 * 地図の画像（OpenStreetMap のタイル）の表示のテスト
 */
import { render, screen } from '@testing-library/react';
import { MapContainer } from 'react-leaflet';
import { describe, expect, it } from 'vitest';
import { MapTileLayer } from './MapTileLayer';

describe('MapTileLayer', () => {
  it('OpenStreetMap のタイルを、出典（OpenStreetMap の協力者）と共に読み込む', async () => {
    const { container } = render(
      <MapContainer center={[36.5, 137.5]} zoom={5}>
        <MapTileLayer />
      </MapContainer>
    );

    expect(await screen.findByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    const tileUrls = [...container.querySelectorAll('img.leaflet-tile')].map((tile) => tile.getAttribute('src'));
    // 検証: タイルが1枚以上読み込まれ、そのすべてが OpenStreetMap のタイルであること
    expect(tileUrls.length).toBeGreaterThan(0);
    expect(tileUrls.every((url) => url?.startsWith('https://tile.openstreetmap.org/'))).toBe(true);
  });

  it('地図の種類を切り替える選択肢は表示しない', async () => {
    render(
      <MapContainer center={[36.5, 137.5]} zoom={5}>
        <MapTileLayer />
      </MapContainer>
    );
    await screen.findByRole('link', { name: 'OpenStreetMap' });

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
