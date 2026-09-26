import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SegmentedProgressBarProps {
  segments: number;
  filled: number;
  filledColor: string;
  trackColor: string;
}

const SegmentedProgressBar: React.FC<SegmentedProgressBarProps> = ({ segments, filled, filledColor, trackColor }) => (
  <View style={styles.row}>
    {Array.from({ length: segments }).map((_, idx) => (
      <View key={idx} style={[styles.segment, { backgroundColor: idx < filled ? filledColor : trackColor }]} />
    ))}
  </View>
);

export default SegmentedProgressBar;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
});
