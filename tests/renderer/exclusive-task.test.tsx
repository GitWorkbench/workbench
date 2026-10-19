// @vitest-environment jsdom
import './setup';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useExclusiveTask } from '../../src/renderer/lib/useExclusiveTask';

it('reserves a task before rerender and releases it on success or failure', async () => {
  const { result } = renderHook(useExclusiveTask);
  let finish!: () => void;
  const task = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  act(() => { pending = result.current.run(task); void result.current.run(task); });
  expect(task).toHaveBeenCalledOnce(); expect(result.current.busy).toBe(true);
  await act(async () => { finish(); await pending; });
  expect(result.current.busy).toBe(false);
  const failure = new Error('operation failed');
  await act(async () => { await expect(result.current.run(async () => { throw failure; })).rejects.toBe(failure); });
  expect(result.current.busy).toBe(false);
  const retry = vi.fn().mockResolvedValue(undefined);
  await act(async () => { await result.current.run(retry); });
  expect(retry).toHaveBeenCalledOnce();
}, 1000);
