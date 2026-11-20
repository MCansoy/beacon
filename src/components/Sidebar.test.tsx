import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Sidebar, SIDEBAR_PAGES } from './Sidebar';
vi.mock('../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
describe('sidebar page visibility', () => {
  it('preserves existing pages when no preferences exist', () => {
    render(<Sidebar activeView="dashboard" onChangeView={() => {}} />);
    for (const page of SIDEBAR_PAGES) expect(screen.getAllByRole('button', { name: page.labelKey }).length).toBeGreaterThan(0);
  });
  it('hides pages on desktop, mobile tabs, and mobile overflow', () => {
    const { rerender } = render(<Sidebar activeView="settings" onChangeView={() => {}} hiddenPages={['calendar', 'recipes']} />);
    fireEvent.click(screen.getByRole('button', { name: 'nav.more' }));
    expect(screen.queryByRole('button', { name: 'nav.calendar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'nav.recipes' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'nav.settings' }).length).toBeGreaterThan(0);
    rerender(<Sidebar activeView="settings" onChangeView={() => {}} hiddenPages={[]} />);
    expect(screen.getAllByRole('button', { name: 'nav.recipes' }).length).toBeGreaterThan(0);
  });
  it('keeps settings reachable even with all pages hidden', () => {
    render(<Sidebar activeView="settings" onChangeView={() => {}} hiddenPages={SIDEBAR_PAGES.map(p => p.id)} />);
    fireEvent.click(screen.getByRole('button', { name: 'nav.more' }));
    expect(screen.getAllByRole('button', { name: 'nav.settings' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'nav.dashboard' })).toBeNull();
  });
});
