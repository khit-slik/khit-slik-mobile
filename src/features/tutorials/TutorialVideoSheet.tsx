import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WebView } from 'react-native-webview';

import { WEB_APP_URL } from '../../config';
import { colors } from '../pos/theme';
import { buildPlayerHtml } from './playerHtml';
import type { TutorialVideo } from './tutorialVideos';

interface Props {
  videos: TutorialVideo[];
  onClose: () => void;
}

// Popup with a screen's how-to videos, like the web app's: the chosen video's player, and a picker
// when there are several. Closing unmounts the player, which also stops the video.
export default function TutorialVideoSheet({ videos, onClose }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [selected, setSelected] = useState(0);
  const video = videos[Math.min(selected, videos.length - 1)];

  // Served as if from the web app, so YouTube sees a real embedding site (it refuses players without one)
  const source = useMemo(
    () => (video ? { html: buildPlayerHtml(video.videoId, WEB_APP_URL), baseUrl: WEB_APP_URL } : null),
    [video],
  );

  if (!video || !source) return null;

  // 16:9 picture plus the control bar under it, at the card's width
  const cardWidth = Math.min(windowWidth - BACKDROP_PADDING * 2, CARD_MAX_WIDTH);
  const playerHeight = Math.round((cardWidth * 9) / 16) + CONTROL_BAR_HEIGHT;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {video.title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.close} accessibilityLabel="ပိတ်မယ်">
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={[styles.player, { height: playerHeight }]}>
            <WebView
              // A fresh player per video
              key={video.videoId}
              source={source}
              originWhitelist={['*']}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              setSupportMultipleWindows={false}
              // The player page and YouTube's own frames only; nothing navigates away from the popup
              onShouldStartLoadWithRequest={(request) =>
                request.isTopFrame === false ||
                request.url.startsWith(WEB_APP_URL) ||
                request.url.startsWith('about:') ||
                request.url.startsWith('https://www.youtube-nocookie.com/embed/')
              }
              style={styles.webview}
            />
          </View>

          {videos.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {videos.map((v, index) => {
                const active = v.videoId === video.videoId;
                return (
                  <TouchableOpacity
                    key={v.videoId}
                    onPress={() => setSelected(index)}
                    style={[styles.chip, active && styles.chipActive]}
                    activeOpacity={0.85}
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name="play-circle" size={16} color={active ? '#fff' : colors.primary} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{v.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const BACKDROP_PADDING = 12;
const CARD_MAX_WIDTH = 900;
// Height of the play / seek / sound bar in playerHtml
const CONTROL_BAR_HEIGHT = 54;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: BACKDROP_PADDING,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  card: {
    width: '100%',
    maxWidth: CARD_MAX_WIDTH,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#f7f6f2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
  },
  close: {
    padding: 4,
  },
  player: {
    width: '100%',
    backgroundColor: '#000',
  },
  webview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  chips: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  chipTextActive: {
    color: '#fff',
  },
});
