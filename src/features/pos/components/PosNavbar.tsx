import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { RECEIPT_FONT } from '../../../fonts';
import { colors } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
  // Shows the 'ကြည့်နည်း' button, opening the screen's how-to videos
  onTutorialPress?: () => void;
}

// Tailwind's `sm` breakpoint, where the web header's title grows and the video button gets its label
const SM_MIN_WIDTH = 640;

// Top bar drawn to match the web app's inner-page header (Autoshop-Frontend/components/TopHeader.tsx)
// point for point, so moving between web and native pages doesn't show: the grey card, white back
// tile, blue bold title over a grey subtitle, all in Z06-Walone like the web's Burmese mode.
export default function PosNavbar({ title, subtitle, onBack, onTutorialPress }: Props) {
  const { width } = useWindowDimensions();
  const isWide = width >= SM_MIN_WIDTH;

  return (
    <View style={[styles.header, isWide && styles.headerWide]}>
      <View style={styles.card}>
        <View style={styles.left}>
          <TouchableOpacity onPress={onBack} style={styles.back} activeOpacity={0.8} accessibilityLabel="Back">
            <Ionicons name="arrow-back-outline" size={20} color={colors.primary} />
          </TouchableOpacity>

          <View style={styles.titles}>
            <Text style={[styles.title, isWide && styles.titleWide]} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        {!!onTutorialPress && (
          <TouchableOpacity
            onPress={onTutorialPress}
            style={[styles.tutorial, isWide && styles.tutorialWide]}
            activeOpacity={0.8}
            accessibilityLabel="ကြည့်နည်း ဗီဒီယို"
          >
            <Ionicons name="play-circle-outline" size={20} color={colors.primary} />
            {isWide && <Text style={styles.tutorialText}>ကြည့်နည်း</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Values are the web classes in px: px-3 = 12, py-2 = 8, rounded-xl = 12, text-base = 16 ...
const styles = StyleSheet.create({
  // header: bg-[#f5f5f3] px-3 sm:px-4 pt-3
  header: {
    backgroundColor: '#f5f5f3',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  headerWide: {
    paddingHorizontal: 16,
  },
  // rounded-2xl bg-[#ececec] px-2.5 py-2 gap-3
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#ececec',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  // gap-2.5
  left: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // h-11 w-11 rounded-xl bg-white
  back: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  // text-[#2216a8] font-bold text-base sm:text-lg
  title: {
    fontFamily: RECEIPT_FONT,
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
  },
  titleWide: {
    fontSize: 18,
  },
  // text-slate-500 text-xs font-medium (Walone has one weight, so medium draws as regular on the web too)
  subtitle: {
    fontFamily: RECEIPT_FONT,
    fontSize: 12,
    color: '#64748b',
  },
  // h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-xl bg-white gap-1.5
  tutorial: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tutorialWide: {
    height: 44,
    paddingHorizontal: 14,
  },
  // text-sm font-bold
  tutorialText: {
    fontFamily: RECEIPT_FONT,
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary,
  },
});
