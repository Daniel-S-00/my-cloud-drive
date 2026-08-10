// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { toast } from 'sonner';
import { TrashLoginToast, JUST_LOGGED_IN_KEY } from './trash-login-toast';

const toastSpy = vi.spyOn(toast, 'warning').mockImplementation(() => '');

afterEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('TrashLoginToast', () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastSpy.mockClear();
  });

  it('shows the warning when the marker is set and there is trash', () => {
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
    render(<TrashLoginToast trashCount={3} />);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0][0]).toMatch(/3 items in your trash/);
  });

  it('uses singular wording for a single item', () => {
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
    render(<TrashLoginToast trashCount={1} />);
    expect(toastSpy.mock.calls[0][0]).toMatch(/1 item in your trash/);
  });

  it('is silent when the marker is set but the trash is empty', () => {
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
    render(<TrashLoginToast trashCount={0} />);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('is silent without the marker even if trash exists', () => {
    render(<TrashLoginToast trashCount={5} />);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('consumes the marker after showing the toast', () => {
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
    const { rerender } = render(<TrashLoginToast trashCount={2} />);
    expect(sessionStorage.getItem(JUST_LOGGED_IN_KEY)).toBeNull();
    rerender(<TrashLoginToast trashCount={2} />);
    expect(toastSpy).toHaveBeenCalledTimes(1);
  });
});
