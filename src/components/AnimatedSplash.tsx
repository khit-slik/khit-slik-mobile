import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useSplashStore } from '../store/splashStore';

// Same blue and image as the native splash (app.json), so the hand-over isn't visible
const BACKGROUND = '#1F1FB8';
// Android 12+ draws the splash icon in a 240dp box
const LOGO_SIZE = 240;
// Shown at least this long, so a fast load doesn't flash the animation
const MIN_VISIBLE_MS = 900;
// Leaves after this even if the web app never reports in
const MAX_VISIBLE_MS = 6000;
const EXIT_MS = 450;

// Takes over from the native splash: the logo breathes while the web app loads, then zooms and fades away
export default function AnimatedSplash() {
  const webReady = useSplashStore((state) => state.webReady);
  // Opened straight into a native screen (deep link, notification): there's no web page to wait for
  const onWebShell = usePathname() === '/';
  const reduceMotion = useReducedMotion();
  const [timedOut, setTimedOut] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [isGone, setIsGone] = useState(false);
  const hiddenNativeRef = useRef(false);

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    const maxTimer = setTimeout(() => setTimedOut(true), MAX_VISIBLE_MS);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, []);

  // Gentle pulse while waiting
  useEffect(() => {
    if (reduceMotion) return;
    scale.set(
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, scale]);

  const isLeaving = ((webReady || !onWebShell) && minElapsed) || timedOut;
  useEffect(() => {
    if (!isLeaving) return;
    scale.set(withTiming(reduceMotion ? 1 : 1.35, { duration: EXIT_MS, easing: Easing.out(Easing.cubic) }));
    opacity.set(withTiming(0, { duration: EXIT_MS, easing: Easing.out(Easing.quad) }));
    const timer = setTimeout(() => setIsGone(true), EXIT_MS);
    return () => clearTimeout(timer);
  }, [isLeaving, reduceMotion, scale, opacity]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  // The native splash goes once this identical screen is drawn underneath it
  const handleLayout = () => {
    if (hiddenNativeRef.current) return;
    hiddenNativeRef.current = true;
    SplashScreen.hide();
  };

  if (isGone) return null;

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      onLayout={handleLayout}
      pointerEvents={isLeaving ? 'none' : 'auto'}
    >
      <StatusBar style="light" />
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BACKGROUND,
    zIndex: 1000,
    elevation: 1000,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
