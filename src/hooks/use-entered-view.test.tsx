// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEnteredView } from './use-entered-view';

function Probe({ rootMargin }: { rootMargin?: string }) {
  const { ref, entered } = useEnteredView<HTMLDivElement>({ rootMargin });
  return <div ref={ref} data-entered={entered ? 'yes' : 'no'} />;
}

type ObserverStub = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const observers: ObserverStub[] = [];
const globals = globalThis as unknown as Record<string, unknown>;

function installMatchMedia(matches: Record<string, boolean> = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: Boolean(matches[query]),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function installObserver() {
  globals.IntersectionObserver = class {
    callback: IntersectionObserverCallback;
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
    root = null;
    rootMargin = '';
    thresholds = [];

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.push(this as unknown as ObserverStub);
    }
  };
}

function entryFor(element: Element, isIntersecting: boolean) {
  return { isIntersecting, target: element } as IntersectionObserverEntry;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  observers.length = 0;
  installMatchMedia();
  installObserver();
});

describe('useEnteredView', () => {
  it('waits for the element to intersect before reporting entered', () => {
    const { container } = render(<Probe />);
    const element = container.firstElementChild as HTMLElement;

    expect(element.dataset.entered).toBe('no');
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(element);

    act(() => {
      observers[0].callback([entryFor(element, true)], observers[0] as never);
    });

    expect(element.dataset.entered).toBe('yes');
  });

  it('ignores a batch that reports nothing intersecting', () => {
    const { container } = render(<Probe />);
    const element = container.firstElementChild as HTMLElement;

    act(() => {
      observers[0].callback([entryFor(element, false)], observers[0] as never);
    });
    act(() => {
      observers[0].callback([], observers[0] as never);
    });

    expect(element.dataset.entered).toBe('no');
  });

  it('stays entered once it has entered', () => {
    const { container } = render(<Probe />);
    const element = container.firstElementChild as HTMLElement;

    act(() => {
      observers[0].callback([entryFor(element, true)], observers[0] as never);
    });
    act(() => {
      observers[0].callback([entryFor(element, false)], observers[0] as never);
    });

    // Scrolling back up must not replay a reveal the reader has already read.
    expect(element.dataset.entered).toBe('yes');
  });

  it('stops observing as soon as it has entered', () => {
    const { container } = render(<Probe />);
    const element = container.firstElementChild as HTMLElement;

    act(() => {
      observers[0].callback([entryFor(element, true)], observers[0] as never);
    });

    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it('enters straight away when there is no observer to wait for', () => {
    delete globals.IntersectionObserver;

    const { container } = render(<Probe />);

    // Otherwise the reveal would wait forever on a trigger that can never
    // fire, and the text would never appear.
    expect((container.firstElementChild as HTMLElement).dataset.entered).toBe(
      'yes',
    );
  });
});
