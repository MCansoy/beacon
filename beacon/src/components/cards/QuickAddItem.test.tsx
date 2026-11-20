import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { QuickAddItem } from './QuickAddItem';
afterEach(cleanup);
describe('dashboard quick add', () => {
  it('trims a task and clears input after success', async () => {
    const add = vi.fn();
    render(<QuickAddItem onAdd={add} label="Add task" hint="Beacon To-Do" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Buy milk  ' } });
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
    expect(add).toHaveBeenCalledWith('Buy milk');
  });
  it('preserves a chore name when saving fails', async () => {
    render(<QuickAddItem onAdd={async () => { throw new Error('offline'); }} label="Add chore" hint="Chores" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Tidy room' } });
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('Tidy room');
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
  it('ignores whitespace and blocks duplicate submissions while saving', async () => {
    let finish!: () => void;
    const add = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<QuickAddItem onAdd={add} label="Add task" hint="To-Do" />);
    const field = screen.getByRole('textbox');
    const form = field.closest('form')!;
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.submit(form); expect(add).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'Call school' } });
    fireEvent.submit(form); fireEvent.submit(form);
    expect(add).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(field).toHaveValue(''));
  });
});
