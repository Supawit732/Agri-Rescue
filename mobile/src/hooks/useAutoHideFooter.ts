import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

/** Movement (pt) in one direction before the footer toggles; avoids flicker on tiny scrolls. */
const DIRECTION_THRESHOLD = 10;
/** Within this distance (pt) of the end of the content the footer is always shown. */
const NEAR_BOTTOM = 80;

/**
 * Hides a sticky footer while scrolling down and brings it back on scroll up.
 * The footer is forced visible near the top/bottom of the content, while the keyboard
 * is open, or whenever `forceVisible` is true (errors, submit in flight).
 */
export function useAutoHideFooter(forceVisible: boolean): {
  hidden: boolean;
  footerHeight: number;
  onFooterLayout: (height: number) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  reveal: () => void;
} {
  const [scrollHidden, setScrollHidden] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [footerHeight, setFooterHeight] = useState(0);
  const lastY = useRef(0);
  const travel = useRef(0);
  // Padding the content currently reserves for the footer; excluded from the near-bottom
  // distance so toggling the padding cannot flip the decision back and forth.
  const reserved = useRef(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const hidden = scrollHidden && !forceVisible && !keyboardOpen;
  reserved.current = hidden ? 0 : footerHeight;

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const y = contentOffset.y;
    const toBottom = contentSize.height - reserved.current - (y + layoutMeasurement.height);
    if (y <= 0 || toBottom < NEAR_BOTTOM) {
      travel.current = 0;
      lastY.current = y;
      setScrollHidden(false);
      return;
    }
    const delta = y - lastY.current;
    lastY.current = y;
    // Direction change restarts the accumulated travel.
    travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
    if (travel.current > DIRECTION_THRESHOLD) {
      setScrollHidden(true);
    } else if (travel.current < -DIRECTION_THRESHOLD) {
      setScrollHidden(false);
    }
  }, []);

  const onFooterLayout = useCallback((height: number) => setFooterHeight(height), []);
  const reveal = useCallback(() => {
    travel.current = 0;
    setScrollHidden(false);
  }, []);

  return { hidden, footerHeight, onFooterLayout, onScroll, reveal };
}
