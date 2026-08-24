import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme';

// Matches web's ApexCharts donut (plotOptions.pie.donut.size: "70%") - a
// ring built from stacked SVG circles with dash-offset segments, since
// there's no charting library in this app (see DashboardScreen's other
// charts, all hand-built with plain Views/SVG rather than a dependency).
export default function DonutChart({ data, size = 180, strokeWidth = 28, centerLabel, centerValue }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetSoFar = 0;
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const fraction = total ? d.value / total : 0;
      const segmentLength = fraction * circumference;
      const segment = {
        ...d,
        strokeDasharray: `${segmentLength} ${circumference - segmentLength}`,
        strokeDashoffset: -offsetSoFar,
      };
      offsetSoFar += segmentLength;
      return segment;
    });

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {segments.map((s) => (
            <Circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeDasharray={s.strokeDasharray}
              strokeDashoffset={s.strokeDashoffset}
              strokeLinecap="butt"
              fill="none"
              rotation={-90}
              originX={size / 2}
              originY={size / 2}
            />
          ))}
        </Svg>
        <View style={styles.centerLabelWrap} pointerEvents="none">
          <Text style={styles.centerValue}>{centerValue}</Text>
          <Text style={styles.centerLabel}>{centerLabel}</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {data.map((d) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <View key={d.label} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={styles.legendText} numberOfLines={1}>
                {d.label} ({pct}%)
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  centerLabelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  centerLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 160 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 12, color: colors.pillText },
});
