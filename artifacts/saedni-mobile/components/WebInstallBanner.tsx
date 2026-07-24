import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function WebInstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    try {
      if (localStorage.getItem('pwa-banner-dismissed')) return;
    } catch {
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible) return null;

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') setVisible(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem('pwa-banner-dismissed', '1');
    } catch {}
    setVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>يمكنك إضافة ساعدني إلى الشاشة الرئيسية</Text>
      <View style={styles.buttons}>
        <TouchableOpacity onPress={handleInstall} style={styles.installBtn}>
          <Text style={styles.installText}>تثبيت</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDismiss} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>لاحقاً</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1AA87D',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 8,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
    textAlign: 'right',
    marginEnd: 12,
  },
  buttons: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  installBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  installText: {
    color: '#1AA87D',
    fontWeight: '600',
    fontSize: 14,
  },
  dismissBtn: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  dismissText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
});
