'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';

/** Nothing to subscribe to, for values that only need to be read once. */
const subscribeNothing = () => () => {};

/**
 * Reports whether an element has scrolled into view, once.
 *
 * Once it has entered it stays entered: replaying a reveal over text the
 * reader has already read is just noise.
 *
 * The bottom inset keeps a block from firing the instant its last pixel
 * touches the fold, where the reader is not yet looking at it.
 *
 * This only answers the question. Whether a reveal *should* run is the
 * caller's decision, since that also depends on the motion preference.
 */
export function useEnteredView<T extends Element>({
  rootMargin = '0px 0px -8% 0px',
}: { rootMargin?: string } = {}): {
  ref: RefObject<T | null>;
  entered: boolean;
} {
  const ref = useRef<T | null>(null);
  const [observed, setObserved] = useState(false);

  // A browser without an observer has nothing to wait for, but the server has
  // no observer either and nothing has been painted yet there. Reading the
  // support flag through useSyncExternalStore answers "not yet" on the server
  // and "no observer, so go ahead" on the client, without hydrating a lie.
  const isClient = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const supported = useSyncExternalStore(
    subscribeNothing,
    () => typeof IntersectionObserver !== 'undefined',
    () => false,
  );

  useEffect(() => {
    if (observed || !supported) return;

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setObserved(true);
      },
      { rootMargin },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [observed, supported, rootMargin]);

  return { ref, entered: isClient && (observed || !supported) };
}
