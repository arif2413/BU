import React from 'react';
import {View, Text, StyleSheet, Image, ScrollView} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

type RootStackParamList = {
  Camera: undefined;
  Results: {metrics: Record<string, unknown>; imageBase64: string};
};

type ResultsScreenProps = NativeStackScreenProps<RootStackParamList, 'Results'>;

function extractMetrics(metrics: Record<string, unknown>) {
  const r = (metrics.result as Record<string, unknown>) || {};
  const s = (r.score_info as Record<string, unknown>) || {};

  const mainMetrics = [
    ['Skin Age', r.skin_age && typeof r.skin_age === 'object' ? (r.skin_age as Record<string, unknown>).value : '-'],
    ['Skin Type', r.skin_type && typeof r.skin_type === 'object' ? (r.skin_type as Record<string, unknown>).skin_type : '-'],
    ['Skin Tone (ITA)', r.skintone_ita && typeof r.skintone_ita === 'object' ? ((r.skintone_ita as Record<string, unknown>).ITA as number)?.toFixed(2) : '-'],
    ['Skin Hue', r.skin_hue_ha && typeof r.skin_hue_ha === 'object' ? (r.skin_hue_ha as Record<string, unknown>).skin_hue : '-'],
  ];

  const scores = [
    ['Total', s.total_score],
    ['Wrinkle', s.wrinkle_score],
    ['Pores', s.pores_score],
    ['Blackhead', s.blackhead_score],
    ['Acne', s.acne_score],
    ['Dark Circle', s.dark_circle_score],
    ['Water', s.water_score],
    ['Roughness', s.rough_score],
    ['Melanin', s.melanin_score],
  ];

  const counts = [
    ['Blackheads', r.blackhead_count],
    ['Brown Spots', r.brown_spot && typeof r.brown_spot === 'object' ? (r.brown_spot as Record<string, unknown>).count : '-'],
    ['Acne', r.acne && typeof r.acne === 'object' ? (r.acne as Record<string, unknown>).count : '-'],
    ['Closed Comedones', r.closed_comedones && typeof r.closed_comedones === 'object' ? (r.closed_comedones as Record<string, unknown>).count : '-'],
    ['Acne Marks', r.acne_mark && typeof r.acne_mark === 'object' ? (r.acne_mark as Record<string, unknown>).count : '-'],
  ];

  const wrinkleCount = (r.wrinkle_count as Record<string, unknown>) || {};
  const wrinkleItems = Object.entries(wrinkleCount).map(([k, v]) => [
    k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    String(v),
  ]);

  const poreCount = (r.enlarged_pore_count as Record<string, unknown>) || {};
  const poreItems = Object.entries(poreCount).map(([k, v]) => [
    k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    String(v),
  ]);

  const sevKeys = [
    'dark_circle_severity', 'eye_pouch_severity', 'forehead_wrinkle_severity',
    'left_crows_feet_severity', 'right_crows_feet_severity',
    'left_eye_finelines_severity', 'right_eye_finelines_severity',
    'glabella_wrinkle_severity', 'left_nasolabial_fold_severity',
    'right_nasolabial_fold_severity',
  ];
  const severityItems = sevKeys.map(k => {
    const val = r[k];
    const v = val && typeof val === 'object' ? (val as Record<string, unknown>).value : val;
    return [k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), String(v ?? '-')];
  });

  return [
    {title: 'Main Metrics', data: mainMetrics},
    {title: 'Scores (0-100)', data: scores},
    {title: 'Counts', data: counts},
    {title: 'Wrinkle Counts', data: wrinkleItems},
    {title: 'Enlarged Pores', data: poreItems},
    {title: 'Severity (0-3)', data: severityItems},
  ];
}

export default function ResultsScreen({route}: ResultsScreenProps) {
  const {metrics, imageBase64} = route.params;
  const sections = extractMetrics(metrics);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Image source={{uri: imageBase64}} style={styles.image} resizeMode="contain" />
        <View style={styles.metricsContainer}>
          <Text style={styles.metricsTitle}>Analysis Results</Text>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map(([label, value], i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.value}>{String(value)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scroll: {
    flex: 1,
  },
  image: {
    width: '100%',
    aspectRatio: 1.2,
    backgroundColor: '#0f0f1a',
  },
  metricsContainer: {
    padding: 20,
  },
  metricsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4a90d9',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  label: {
    fontSize: 14,
    color: '#b0b0b0',
  },
  value: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
});
