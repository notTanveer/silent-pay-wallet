import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import triggerHapticFeedback, { HapticFeedbackTypes } from '../modules/hapticFeedback';
import { ShroudText } from '../ShroudComponents';
import { ClashFont } from '../constants/fonts';
import { useTheme } from './themes';

interface PillSegmentedControlProps {
  values: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

const TRACK_PADDING = 6;
const SEGMENT_GAP = 8;

const PillSegmentedControl: React.FC<PillSegmentedControlProps> = ({ values, selectedIndex, onChange }) => {
  const { colors } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const segmentWidth =
    values.length > 0 && trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2 - SEGMENT_GAP * (values.length - 1)) / values.length : 0;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: selectedIndex * (segmentWidth + SEGMENT_GAP),
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [selectedIndex, segmentWidth, translateX]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const handlePress = (index: number) => {
    if (index === selectedIndex) return;
    triggerHapticFeedback(HapticFeedbackTypes.Selection);
    onChange(index);
  };

  if (!Array.isArray(values) || values.length === 0) return null;

  return (
    <View style={[styles.track, { backgroundColor: colors.segmentTrack, borderColor: colors.segmentTrackBorder }]} onLayout={onTrackLayout}>
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              width: segmentWidth,
              backgroundColor: colors.background,
              borderColor: colors.segmentSelectedBorder,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {values.map((value, index) => (
        <Pressable
          key={value}
          style={styles.segment}
          accessibilityRole="button"
          accessibilityState={{ selected: index === selectedIndex }}
          onPress={() => handlePress(index)}
        >
          <ShroudText
            numberOfLines={1}
            style={[
              styles.label,
              {
                color: index === selectedIndex ? colors.textPrimarySoft : colors.textDisabled,
                fontFamily: ClashFont.medium,
              },
            ]}
          >
            {value}
          </ShroudText>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    width: '100%',
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    padding: TRACK_PADDING,
    gap: SEGMENT_GAP,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: TRACK_PADDING,
    left: TRACK_PADDING,
    bottom: TRACK_PADDING,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#101828',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    lineHeight: 24,
  },
});

export default PillSegmentedControl;
