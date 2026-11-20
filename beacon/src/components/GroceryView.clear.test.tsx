import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroceryView } from './GroceryView';
import { TasksCard } from './cards/TasksCard';
import type { DashboardCardContext } from '../types/dashboard-cards';
const m = vi.hoisted(() => ({ service: vi.fn(), clear: vi.fn(), records: [
  { uid: 'open', summary: 'Milk', status: 'needs_action' },
  { uid: 'done', summary: 'Bread', status: 'completed' },
] }));
vi.mock('../i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../api/ha-rest', () => ({ hasToken: () => true, callHaService: m.service }));
vi.mock('../api/anylist', () => ({ AnyListClient: class { async getLists() { return [{id:'todo.shopping',name:'Shopping'}]; } } }));
vi.mock('../hooks/useLocalTasks', () => ({ useLocalTasks: () => ({
  lists: [{id:'beacon-shopping',name:'Shopping List'}],
  getTasksForList: () => m.records.map(i => ({...i,id:i.uid})), clearCompleted: m.clear,
}) }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  m.service.mockImplementation(async (_domain, service) => service === 'get_items'
    ? {service_response:{'todo.shopping':{items:m.records}}} : {});
});
describe('clear checked shopping items', () => {
  it('targets only the selected HA list', async () => {
    render(<GroceryView defaultListId="todo.shopping" />);
    const button = screen.getByRole('button', {name:'Clear checked'});
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await waitFor(() => expect(m.service).toHaveBeenCalledWith('todo','remove_completed_items',{entity_id:'todo.shopping'}));
    expect(screen.getByText('Milk')).toBeTruthy();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Shopping List');
    expect(options[0]).toHaveValue('todo.shopping');
  });
  it('uses the selected local list for clearing', async () => {
    render(<GroceryView defaultListId="beacon-shopping" />);
    const button = screen.getByRole('button', {name:'Clear checked'});
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    expect(m.clear).toHaveBeenCalledWith('beacon-shopping');
    expect(m.service).not.toHaveBeenCalledWith('todo','remove_completed_items',expect.anything());
  });
  it('shows an error and retains checked items if HA rejects the request', async () => {
    m.service.mockImplementation(async (_domain, service) => {
      if (service === 'remove_completed_items') throw new Error('denied');
      return {service_response:{'todo.shopping':{items:m.records}}};
    });
    render(<GroceryView defaultListId="todo.shopping" />);
    const button=screen.getByRole('button',{name:'Clear checked'});
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);
    await screen.findByRole('alert');
    expect(screen.getByText('Bread')).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
  });
  it('hides completed tasks from the dashboard card', () => {
    render(<TasksCard config={{}} context={{todoItems:m.records,taskmateUsers:[],filteredChores:[],completedChoreIds:new Set(),members:[]} as unknown as DashboardCardContext} />);
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.queryByText('Bread')).toBeNull();
  });
});
