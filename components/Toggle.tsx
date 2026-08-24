import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useTheme } from './themes';

const TRACK_WIDTH = 56;
const TRACK_HEIGHT = 32;
const TRACK_RADIUS = 16;
const THUMB_SIZE_ON = 27;
const THUMB_SIZE_OFF = 24;
const THUMB_INSET_ON = 2;
const THUMB_INSET_OFF = 4;

// Thumb is laid out once at its "on" size/position; going "off" is expressed as a
// scale + translateX from that resting box, so the animation can run on the native
// driver. Track color and shadow can't be natively driven, so they use a separate value
// on a separate Animated.View — mixing native- and JS-driven props on one node crashes RN.
const THUMB_ON_LEFT = TRACK_WIDTH - THUMB_INSET_ON - THUMB_SIZE_ON;
const THUMB_ON_TOP = (TRACK_HEIGHT - THUMB_SIZE_ON) / 2;
const THUMB_OFF_SCALE = THUMB_SIZE_OFF / THUMB_SIZE_ON;
const THUMB_OFF_TRANSLATE_X = THUMB_INSET_OFF + THUMB_SIZE_OFF / 2 - (THUMB_ON_LEFT + THUMB_SIZE_ON / 2);

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  testID?: string;
  disabled?: boolean;
}

const Toggle: React.FC<ToggleProps> = ({ value, onValueChange, accessibilityLabel, testID, disabled }) => {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;
  const colorProgress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    const toValue = value ? 1 : 0;
    Animated.parallel([
      Animated.spring(progress, { toValue, useNativeDriver: true, bounciness: 6 }),
      Animated.spring(colorProgress, { toValue, useNativeDriver: false, bounciness: 6 }),
    ]).start();
  }, [value, progress, colorProgress]);

  const trackColor = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.toggleTrackOff, colors.accentColor],
  });

  const thumbShadowOpacity = colorProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.3],
  });

  const thumbScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_OFF_SCALE, 1],
  });

  const thumbTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_OFF_TRANSLATE_X, 0],
  });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => !disabled && onValueChange(!value)}
      disabled={disabled}
      testID={testID}
      hitSlop={8}
    >
      <Animated.View style={[styles.track, disabled && styles.trackDisabled, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.thumbWrapper, { transform: [{ translateX: thumbTranslateX }, { scale: thumbScale }] }]}>
          <Animated.View style={[styles.thumb, { shadowOpacity: thumbShadowOpacity }]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
};

export default Toggle;

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_RADIUS,
  },
  trackDisabled: {
    opacity: 0.5,
  },
  thumbWrapper: {
    position: 'absolute',
    top: THUMB_ON_TOP,
    left: THUMB_ON_LEFT,
    width: THUMB_SIZE_ON,
    height: THUMB_SIZE_ON,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 2,
    elevation: 3,
  },
});
