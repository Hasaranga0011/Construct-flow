/**
 * ConstructAi — Home / Landing Page (rewritten)
 *
 * SCROLL-DRIVEN VIDEO BACKGROUND
 * ─────────────────────────────────
 * injectVideoBackground() (web-only, called in useEffect) creates a fixed
 * <video> element behind all content and drives it with a requestAnimationFrame
 * loop that maps scroll progress (0→1) to video.currentTime (0→duration).
 * Lerp easing (LERP_FACTOR) makes forward and reverse scrubbing feel smooth.
 *
 * TUNEABLE constants at the top of this file:
 *   BLUR          — video layer backdrop blur        (default "10px")
 *   DIM           — dark overlay opacity, 0–1        (default "0.45")
 *   SCROLL_LENGTH — scroll height for one full orbit (default "600vh")
 *   LERP_FACTOR   — easing smoothness, lower=smoother (default 0.10)
 *
 * VIDEO ASSET
 * ───────────
 * Place homepage.mp4 (or homepage_scroll.mp4) at:
 *   frontend/assets/images/homepage.mp4
 *
 * For smooth reverse scrubbing, re-encode with ffmpeg (all-keyframe):
 *   ffmpeg -i homepage.mp4 -c:v libx264 -g 1 -crf 23 -an
 *          -movflags +faststart -vf "scale=1920:-2" homepage_scroll.mp4
 *
 * ffmpeg install on Windows (if missing):
 *   winget install Gyan.FFmpeg
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import {
  View, Text, ScrollView, Pressable, Image,
  TextInput, useWindowDimensions, Platform, Animated,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getDashboardForRole } from '../utils/auth';
import { getApiUrl } from '../lib/apiUrl';


import { LinearGradient } from 'expo-linear-gradient';

// ─── Tuneable constants (adjust here — no other file needs changing) ──────────
const BLUR: string   = '3px';   // CSS blur on the video layer
const DIM: string    = '0.45';   // dark overlay opacity 0=none 1=black
const SCROLL_LENGTH  = '600vh';  // scroll distance for one full video pass
const LERP_FACTOR    = 0.10;    // easing factor (lower=smoother/more lag)
// ─────────────────────────────────────────────────────────────────────────────

import { injectVideoBackground } from '@/components/landing/LandingVideoBg';


const AnimatedCounter = ({
  value, suffix = '', isDecimal = false, triggered,
}: { value: number; suffix?: string; isDecimal?: boolean; triggered: boolean }) => {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!triggered) return;
    let s = 0;
    const step = value / (2200 / 30);
    const t = setInterval(() => {
      s += step;
      if (s >= value) { setCount(value); clearInterval(t); }
      else setCount(s);
    }, 30);
    return () => clearInterval(t);
  }, [value, triggered]);
  const d = isDecimal ? count.toFixed(1) : Math.floor(count).toLocaleString();
  return <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-4xl md:text-5xl mb-2">{d}{suffix}</Text>;
};

const PortalToggle = () => {
  const router = useRouter();
  const [active, setActive] = useState<'team' | 'partner'>('team');
  const anim = useRef(new Animated.Value(1)).current; // 0=partner, 1=team

  const handlePress = (portal: 'team' | 'partner', e: any) => {
    if (Platform.OS === 'web') e?.preventDefault?.();
    if (active === portal) {
      router.push(portal === 'team' ? '/team-login' : '/partner-login');
      return;
    }
    setActive(portal);
    Animated.spring(anim, {
      toValue: portal === 'team' ? 1 : 0,
      useNativeDriver: false,
      stiffness: 250,
      damping: 20
    }).start(() => {
      router.push(portal === 'team' ? '/team-login' : '/partner-login');
    });
  };

  const left = anim.interpolate({ inputRange: [0, 1], outputRange: ['2%', '50%'] });
  const right = anim.interpolate({ inputRange: [0, 1], outputRange: ['50%', '2%'] });

  return (
    <View className="flex-row items-center p-1 rounded-full w-[240px] sm:w-[280px] bg-slate-900/70 border border-white/20 backdrop-blur-md">
      <Animated.View style={{
        position: 'absolute',
        top: 4, bottom: 4,
        left, right,
        backgroundColor: '#F97316',
        borderRadius: 9999,
        shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 10, elevation: 4,
      }} />
      <Link href="/partner-login" asChild>
        <Pressable className="flex-1 items-center justify-center z-10" style={{ minHeight: 40 }} onPress={(e) => handlePress('partner', e)}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-xs sm:text-sm ${active === 'partner' ? 'text-white' : 'text-gray-300'}`}>Partner Portal</Text>
        </Pressable>
      </Link>
      <Link href="/team-login" asChild>
        <Pressable className="flex-1 items-center justify-center z-10" style={{ minHeight: 40 }} onPress={(e) => handlePress('team', e)}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className={`font-bold text-xs sm:text-sm ${active === 'team' ? 'text-white' : 'text-gray-300'}`}>Team Portal</Text>
        </Pressable>
      </Link>
    </View>
  );
};

import { BlurView } from 'expo-blur';

const GlassSection = ({ style, className, children, id, onLayout, intensity = 20, tint = 'dark' }: any) => {
  if (Platform.OS === 'web') {
    return <View id={id} onLayout={onLayout} style={style} className={className}>{children}</View>;
  }
  
  let bg = 'transparent';
  let newStyle = { ...style };
  if (newStyle.backgroundColor) {
    bg = newStyle.backgroundColor;
    delete newStyle.backgroundColor;
  }
  
  return (
    <View id={id} onLayout={onLayout} style={[newStyle, { overflow: 'hidden' }]} className={className}>
      <BlurView intensity={intensity} tint={tint} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: bg }} />
      {children}
    </View>
  );
};

export default function LandingPage() {
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactProject, setContactProject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleContactSubmit = async () => {
    if (!contactName || !contactEmail || !contactMessage) {
      if (Platform.OS === 'web') { alert('Please fill in your name, email, and message.'); }
      else { Alert.alert('Missing Fields', 'Please fill in your name, email, and message.'); }
      return;
    }
    setIsSubmitting(true);
    try {
      const targetUrl = `${getApiUrl()}/public-inquiry`;
      console.log('[Inquiry] Submitting to:', targetUrl);
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          project_name: contactProject,
          message: contactMessage
        })
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Server status ${response.status}: ${errText}`);
      }
      
      if (Platform.OS === 'web') { alert('Message Sent! Our team will get back to you shortly.'); }
      else { Alert.alert('Message Sent', 'Our team will get back to you shortly.'); }
      
      setContactName('');
      setContactEmail('');
      setContactProject('');
      setContactMessage('');
    } catch (e: any) {
      console.warn('[Inquiry Error]', e);
      if (Platform.OS === 'web') { alert('Failed to send message: ' + e.message); }
      else { Alert.alert('Error', 'Failed to send message. Please ensure the backend server is reachable: ' + (e.message || 'Network error')); }
    } finally {
      setIsSubmitting(false);
    }
  };

  const { session, role } = useAuth();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [countersTriggered, setCountersTriggered] = useState(false);
  const [countersY, setCountersY] = useState(0);
  const { height: wh, width: ww } = useWindowDimensions();
  const isMobile = ww < 768;
  const isTablet = ww >= 768 && ww < 1024;
  const isSmallPhone = ww < 480;
  const isSm = ww >= 640;
  const isWeb = Platform.OS === 'web';
  const cleanup = useRef<() => void>(() => {});
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  useEffect(() => {
    if (Platform.OS === 'web') cleanup.current = injectVideoBackground();
    return () => cleanup.current?.();
  }, []);

  const handleCTA = () => {
    if (session) router.push((role ? getDashboardForRole(role) : '/') as any);
    else router.push('/team-register');
  };

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const contentHeight = e.nativeEvent.contentSize.height;
    const layoutHeight = e.nativeEvent.layoutMeasurement.height;
    
    if (Platform.OS === 'web') {
      const sm = contentHeight - layoutHeight;
      (window as any).__cfScrollProgress = sm > 0 ? Math.max(0, Math.min(y / sm, 1)) : 0;
    }

    setIsScrolled(y > 50);
    if (!countersTriggered && countersY > 0 && y + wh > countersY + 200) setCountersTriggered(true);
  };

  const scrollTo = (id: string) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, (sectionOffsets.current[id] ?? 0) - 80), animated: true });
  };

  const g: any = {
    backgroundColor: 'rgba(17,24,39,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(20px)' } : {})
  };

  const slProjects = [
    { img: require('../../assets/images/projects/proj1.jpg'), type: 'Commercial Tower',   name: 'WTC Colombo Expansion',          location: 'Colombo 01',           budget: 'LKR 4.2Bn' },
    { img: require('../../assets/images/projects/proj2.jpg'), type: 'Luxury Residential', name: 'Cinnamon Life Residencies',      location: 'Beira Lake, Colombo',  budget: 'LKR 2.8Bn' },
    { img: require('../../assets/images/projects/proj3.jpg'), type: 'Infrastructure',    name: 'Colombo–Kandy Expressway Ph.3', location: 'Kadugannawa, Kandy',   budget: 'LKR 18Bn'  },
    { img: require('../../assets/images/projects/proj4.jpg'), type: 'Hospitality',       name: 'Jetwing Galle Fort Hotel',       location: 'Galle Fort',           budget: 'LKR 650M'  },
    { img: require('../../assets/images/projects/proj5.jpg'), type: 'Retail Complex',    name: 'One Galle Face Mall Ph.2',       location: 'Colombo 03',           budget: 'LKR 3.1Bn' },
    { img: require('../../assets/images/projects/proj1.jpg'), type: 'Industrial',        name: 'Hambantota Port Dry Zone',       location: 'Hambantota',           budget: 'LKR 9.4Bn' },
  ];

  const features = [
    { icon: <Ionicons name="people" size={28} color="#F97316" />,          title: 'Role-Based Portals',  desc: 'Separate dashboards for Admin, PM, Site Manager, Supplier, Client and Worker \u2014 each scoped to their data with live Supabase sync.' },
    { icon: <Ionicons name="layers" size={26} color="#F97316" />,          title: 'Live Inventory',      desc: 'Track Portland Cement, River Sand, Steel Rebar and 200+ materials across all sites with instant low-stock alerts to your phone.' },
    { icon: <Ionicons name="hammer" size={28} color="#F97316" />,          title: 'QR Attendance',       desc: 'Workers scan site-specific QR codes to check in. Masons, carpenters, plumbers \u2014 all tracked with hours worked and daily snapshots.' },
    { icon: <Ionicons name="pie-chart" size={28} color="#F97316" />,       title: 'AI Cost Estimator',   desc: 'RandomForest ML trained on 50,000 Sri Lankan data points. Get LKR-accurate predictions with R\u00b2 = 0.95 confidence in seconds.' },
    { icon: <Ionicons name="globe-outline" size={28} color="#F97316" />,   title: 'Client Portal',       desc: 'Give clients real-time milestone visibility, LKR budget charts, and direct in-app messaging \u2014 no more phone calls for updates.' },
    { icon: <Ionicons name="notifications" size={28} color="#F97316" />,  title: 'Push Notifications',  desc: 'Instant alerts for delayed deliveries, absent workers, pending approvals, and budget overruns on web and native iOS/Android.' },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: 'transparent' }}>
      {Platform.OS !== 'web' && (
        <LinearGradient
          colors={['#0F172A', '#1E293B', '#0C1A2E']}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: -1 }}
        />
      )}

      
      <ScrollView bounces={false} keyboardShouldPersistTaps="handled" ref={scrollRef} className="flex-1" showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>

      {/* NAVBAR */}
      <View
        className="w-full px-6 md:px-10"
        style={{
          paddingTop: isScrolled ? 12 : 24,
          paddingBottom: isScrolled ? 12 : 24,
          backgroundColor: isScrolled ? 'rgba(10,15,30,0.92)' : 'transparent',
          ...(Platform.OS === 'web' ? { backdropFilter: isScrolled ? 'blur(24px)' : 'none' } : {}),
          borderBottomWidth: isScrolled ? 1 : 0,
          borderBottomColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <View className="max-w-7xl mx-auto w-full flex-row items-center justify-between">
          <View className="flex-row items-center flex-shrink" style={{ minWidth: 0 }}>
            <View className="mr-3 flex-shrink-0" style={{ shadowColor: '#F97316', shadowOpacity: 0.45, shadowRadius: 14 }}>
              <Image source={require('../../assets/images/main-logo.png')} style={{ width: 44, height: 44, borderRadius: 10 }} />
            </View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base sm:text-xl tracking-tight" numberOfLines={1}>
              Construct<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Ai</Text>
            </Text>
          </View>

          <View className="flex-row items-center hidden xl:flex flex-shrink-0">
            {[{ label: 'Home', id: 'home' }, { label: 'Services', id: 'services' }, { label: 'Gallery', id: 'projects' }, { label: 'Contact', id: 'contact' }].map(item => (
              <Pressable style={{ minHeight: 44, minWidth: 44 }} key={item.id} className="mx-4 cursor-pointer" onPress={() => scrollTo(item.id)}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 font-extrabold text-base hover:text-white hover:scale-110 transition-transform">{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-row items-center flex-shrink-0">
            {isSm ? (
              session ? (
                <Link href={(role ? getDashboardForRole(role) : '/') as any} asChild>
                  <Pressable className="bg-brand-orange px-3 sm:px-6 py-2.5 rounded-full"
                    style={{ shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 10, minHeight: 44, minWidth: 44 }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xs sm:text-base">Go to Dashboard</Text>
                  </Pressable>
                </Link>
              ) : (
                <PortalToggle />
              )
            ) : (
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => setMobileMenuOpen(!mobileMenuOpen)} className="items-center justify-center p-2 rounded-lg bg-gray-800/50 border border-gray-700 ml-2">
                <Ionicons name={mobileMenuOpen ? 'close' : 'menu'} size={24} color="white" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Mobile Menu Dropdown */}
        {mobileMenuOpen && !isSm && (
          <View className="absolute top-full left-0 right-0 w-full mt-2 bg-[#0B1120] border-t border-gray-800 shadow-2xl px-4 py-4 rounded-b-2xl">
            {session ? (
              <Link href={(role ? getDashboardForRole(role) : '/') as any} asChild>
                <Pressable onPress={() => setMobileMenuOpen(false)} className="bg-brand-orange items-center justify-center rounded-xl mb-3" style={{ minHeight: 48, width: '100%' }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Go to Dashboard</Text>
                </Pressable>
              </Link>
            ) : (
              <>
                <Link href="/team-login" asChild>
                  <Pressable onPress={() => setMobileMenuOpen(false)} className="bg-brand-orange items-center justify-center rounded-xl mb-3" style={{ minHeight: 48, width: '100%' }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Team Portal</Text>
                  </Pressable>
                </Link>
                <Link href="/partner-login" asChild>
                  <Pressable onPress={() => setMobileMenuOpen(false)} className="border border-gray-600 bg-gray-800/50 items-center justify-center rounded-xl mb-2" style={{ minHeight: 48, width: '100%' }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base">Partner Portal</Text>
                  </Pressable>
                </Link>
              </>
            )}
          </View>
        )}
      </View>


        {/* HERO */}
        <View className="px-5 md:px-12 relative overflow-hidden flex items-center justify-center" id="home" onLayout={event => { sectionOffsets.current.home = event.nativeEvent.layout.y; }} style={{ minHeight: wh, paddingTop: isMobile ? (Platform.OS === 'web' ? 96 : 64) : 144, paddingBottom: isMobile ? 56 : 110 }}>
          <View style={{ position: 'absolute', top: 0, right: 0, width: '50%', maxWidth: 480, aspectRatio: 1, borderBottomLeftRadius: 480, backgroundColor: 'rgba(249,115,22,0.07)', pointerEvents: 'none' }} />
          <View style={{ position: 'absolute', bottom: 0, left: 0, width: '40%', maxWidth: 360, aspectRatio: 1, borderTopRightRadius: 360, backgroundColor: 'rgba(59,130,246,0.05)', pointerEvents: 'none' }} />

          <View className="w-full z-10 max-w-5xl mx-auto flex-col items-center text-center">

            {/* Centralized Hero Content */}
            <View className="w-full flex-col items-center text-center py-2 md:py-4">
              <View className="self-center flex-row items-center px-4 py-1.5 rounded-full border mb-5 sm:mb-6"
                style={{ borderColor: 'rgba(249,115,22,0.45)', backgroundColor: 'rgba(249,115,22,0.1)' }}>
                <View className="w-2 h-2 rounded-full bg-brand-orange mr-2" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs tracking-widest uppercase">Sri Lanka&apos;s #1 Construction Platform</Text>
              </View>

              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold leading-tight mb-5 sm:mb-6 text-center"
                style={[
                  { flexShrink: 1, minWidth: 0 },
                  {
                    fontSize: ww >= 1024 ? 68 : ww >= 768 ? 54 : (ww < 380 ? 34 : 42),
                    lineHeight: ww >= 1024 ? 78 : ww >= 768 ? 64 : (ww < 380 ? 42 : 50),
                    textAlign: 'center'
                  }
                ]}
              >
                Build Smarter,{'\n'}
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Deliver</Text>{' '}
                On Time.
              </Text>

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3}
                className="text-gray-300 leading-relaxed mb-8 md:mb-10 text-center text-sm sm:text-base md:text-lg lg:text-xl max-w-3xl mx-auto px-2"
              >
                Complete construction management for Sri Lankan contractors — projects, materials, labour, payroll, client portals, and AI cost estimation in LKR. Trusted by teams from Colombo to Jaffna.
              </Text>

              <View style={{
                flexDirection: isSmallPhone ? 'column' : 'row',
                flexWrap: isSmallPhone ? 'nowrap' : 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 14,
                marginBottom: isMobile ? 36 : 48,
                width: '100%'
              }}>
                <Link href="/team-login" asChild>
                  <Pressable className="flex-row items-center justify-center rounded-full"
                    style={{ backgroundColor: '#F97316', shadowColor: '#F97316', shadowOpacity: 0.45, shadowRadius: 24, elevation: 8, minHeight: 52, width: isSmallPhone ? '100%' : 'auto', maxWidth: isSmallPhone ? 320 : undefined, paddingHorizontal: 32 }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base sm:text-lg mr-2">Team Portal</Text>
                    <Ionicons name="arrow-forward" size={20} color="white" />
                  </Pressable>
                </Link>
                <Link href="/partner-login" asChild>
                  <Pressable className="items-center justify-center rounded-full"
                    style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.05)', minHeight: 52, width: isSmallPhone ? '100%' : 'auto', maxWidth: isSmallPhone ? 320 : undefined, paddingHorizontal: 32 }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base sm:text-lg">Partner Portal</Text>
                  </Pressable>
                </Link>
              </View>

              <View className="flex-row flex-wrap justify-center items-center gap-6 sm:gap-10 md:gap-14">
                {[{ val: '15+', label: 'Modules' }, { val: '6', label: 'Role Types' }, { val: 'LKR', label: 'Native Currency' }, { val: '95%', label: 'ML Accuracy' }].map(s => (
                  <View key={s.label} className="items-center text-center px-2" style={{ minWidth: isSmallPhone ? '40%' : 'auto' }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-extrabold text-2xl sm:text-3xl md:text-4xl mb-0.5 text-center">{s.val}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-[11px] sm:text-xs tracking-widest uppercase font-semibold text-center">{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

          </View>
        </View>

        {/* FEATURES */}
        <GlassSection intensity={40} className="py-24 px-6 md:px-10" id="services" onLayout={(event: any) => { sectionOffsets.current.services = event.nativeEvent.layout.y; }} style={{ backgroundColor: 'rgba(10,14,26,0.82)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}) }}>
          <View className="max-w-6xl mx-auto">
            <View className="items-center mb-14">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm tracking-widest uppercase mb-3">Platform Capabilities</Text>
              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-center" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 40, lineHeight: 50 }]}>
                Everything a Sri Lankan{'\n'}<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Contractor Needs</Text>
              </Text>
              <View className="w-20 h-1 bg-brand-orange mt-5 rounded-full" />
            </View>
            <View className="flex-row flex-wrap -mx-4">
              {features.map(f => (
                <View key={f.title} className="w-full md:w-1/3 px-4 mb-8">
                  <View className="p-8 rounded-3xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                    <View className="w-14 h-14 rounded-2xl items-center justify-center mb-5" style={{ backgroundColor: 'rgba(249,115,22,0.13)' }}>
                      {f.icon}
                    </View>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xl mb-3">{f.title}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 leading-relaxed">{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </GlassSection>

        {/* STATS STRIP */}
        <View className="py-12 px-6" style={{ backgroundColor: 'rgba(249,115,22,0.90)' }}>
          <View className="max-w-5xl mx-auto flex-row flex-wrap justify-around">
            {[{ val: '95%', label: 'Model Accuracy (R²)' }, { val: '50K+', label: 'ML Training Samples' }, { val: '6', label: 'User Roles' }, { val: '99.9%', label: 'Platform Uptime' }].map(s => (
              <View key={s.label} className="items-center px-4 mb-6">
                <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: isMobile ? 32 : 44 }]}>{s.val}</Text>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-orange-100 text-sm font-medium mt-1 tracking-wide text-center">{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* PROJECTS GALLERY */}
        <GlassSection intensity={40} className="py-24 px-6 md:px-10" id="projects" onLayout={(event: any) => { sectionOffsets.current.projects = event.nativeEvent.layout.y; }} style={{ backgroundColor: 'rgba(8,12,22,0.88)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}) }}>
          <View className="max-w-6xl mx-auto">
            <View className="items-center mb-14">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm tracking-widest uppercase mb-3">Featured Projects</Text>
              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-center" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: 40, lineHeight: 50 }]}>
                Sri Lanka&apos;s Biggest Builds,{'\n'}<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Tracked Here</Text>
              </Text>
              <View className="w-20 h-1 bg-brand-orange mt-5 rounded-full" />
            </View>
            <View className="flex-row flex-wrap -mx-4">
              {slProjects.map(proj => (
                <View key={proj.name} className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                  <View className="rounded-3xl overflow-hidden flex-col" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                    <View style={{ width: '100%', height: 220, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <Image source={typeof proj.img === 'string' ? { uri: proj.img } : proj.img} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </View>
                    <View className="p-6 flex-col justify-between">
                      <View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-semibold text-xs tracking-widest uppercase mb-1">{proj.type}</Text>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xl mb-4">{proj.name}</Text>
                      </View>
                      <View className="flex-row items-center justify-between mt-4">
                        <View className="flex-row items-center">
                          <Ionicons name="location" size={13} color="#9CA3AF" />
                          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-sm ml-1">{proj.location}</Text>
                        </View>
                        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm">{proj.budget}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </GlassSection>

        {/* ANIMATED COUNTERS */}
        <GlassSection intensity={40} className="py-24 px-6" style={{ backgroundColor: 'rgba(10,14,26,0.85)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}) }}
          onLayout={(e: any) => setCountersY(e.nativeEvent.layout.y)}>
          <View className="max-w-6xl mx-auto">
            <View className="items-center mb-14">
              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-center" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: isMobile ? 28 : 40, lineHeight: isMobile ? 36 : 50 }]}>
                Our Achievements in <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Numbers</Text>
              </Text>
            </View>
            <View className="flex-row flex-wrap justify-center">
              {[
                { icon: 'happy-outline' as const,           value: 12490, suffix: '',   label: 'Active Users' },
                { icon: 'checkmark-circle-outline' as const, value: 5230, suffix: '',   label: 'Projects Managed' },
                { icon: 'cube-outline' as const,            value: 1,     suffix: 'M+', label: 'Materials Tracked' },
                { icon: 'trophy-outline' as const,          value: 99.9,  suffix: '%',  isDecimal: true, label: 'Uptime' },
              ].map(stat => (
                <View key={stat.label} className="w-1/2 md:w-1/4 mb-12 md:mb-0 items-center px-4">
                  <View className="w-20 h-20 rounded-3xl items-center justify-center mb-5"
                    style={{ backgroundColor: 'rgba(249,115,22,0.13)', borderWidth: 1, borderColor: 'rgba(249,115,22,0.25)' }}>
                    <Ionicons name={stat.icon} size={36} color="#F97316" />
                  </View>
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} isDecimal={stat.isDecimal} triggered={countersTriggered} />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 font-medium text-sm tracking-widest uppercase">{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </GlassSection>

        {/* HOW IT WORKS */}
        <GlassSection intensity={40} className="py-24 px-6 md:px-10"
          style={{ backgroundColor: 'rgba(249,115,22,0.07)', borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.1)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}) }}>
          <View className="max-w-5xl mx-auto">
            <View className="items-center mb-14">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm tracking-widest uppercase mb-3">Simple Setup</Text>
              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-center" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: isMobile ? 32 : 40 }]}>Get Started in Minutes</Text>
            </View>
            <View className="flex-row flex-wrap -mx-4">
              {[
                { step: '01', title: 'Create Your Organisation', desc: 'Sign up and configure your firm profile with LKR billing details and your Colombo or regional office address.' },
                { step: '02', title: 'Invite Your Team',         desc: 'Send role-based invites to PMs, site managers, suppliers, and clients. Each gets a tailored Sri Lankan portal.' },
                { step: '03', title: 'Start Tracking Live',      desc: 'Add projects, assign milestones, log materials, use QR attendance, and get AI-powered LKR cost forecasts.' },
              ].map(s => (
                <View key={s.step} className="w-full md:w-1/3 px-4 mb-10 md:mb-0 items-center">
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { fontWeight: '900', fontSize: isMobile ? 56 : 72, color: 'rgba(249,115,22,0.18)', lineHeight: isMobile ? 64 : 80, marginBottom: 16 }]}>{s.step}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xl mb-3 text-center">{s.title}</Text>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 leading-relaxed text-center">{s.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        </GlassSection>

        {/* CONTACT */}
        <GlassSection intensity={40} className="py-24 px-6 md:px-10" id="contact" onLayout={(event: any) => { sectionOffsets.current.contact = event.nativeEvent.layout.y; }} style={{ backgroundColor: 'rgba(8,12,22,0.90)', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)' } : {}) }}>
          <View className="max-w-5xl mx-auto">
            <View className="items-center mb-14">
              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-center" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: isMobile ? 32 : 40, lineHeight: isMobile ? 40 : 50 }]}>
                Talk to Our <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Sri Lanka Team</Text>
              </Text>
              <View className="w-20 h-1 bg-brand-orange mt-5 rounded-full" />
            </View>
            <View className="flex-row flex-wrap -mx-4">
              <View className="w-full md:w-1/2 px-4 mb-12 md:mb-0">
                <View className="p-8 rounded-3xl" style={{ ...g }}>
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Your Name" placeholderTextColor="rgba(156,163,175,0.65)"
                    value={contactName} onChangeText={setContactName}
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Email Address" placeholderTextColor="rgba(156,163,175,0.65)"
                    value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none"
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                    
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Company / Project Name" placeholderTextColor="rgba(156,163,175,0.65)"
                    value={contactProject} onChangeText={setContactProject}
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />

                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Your message" placeholderTextColor="rgba(156,163,175,0.65)"
                    multiline textAlignVertical="top" value={contactMessage} onChangeText={setContactMessage}
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', height: 120, marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  
                  <Pressable className="w-full py-4 rounded-xl items-center" disabled={isSubmitting} onPress={handleContactSubmit}
                    style={[{ backgroundColor: isSubmitting ? '#fb923c' : '#F97316', shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 16 }, { minHeight: 44, minWidth: 44 }]}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View className="w-full md:w-1/2 px-4 justify-center">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-lg leading-relaxed mb-10">
                  Based in Colombo, serving contractors from Jaffna to Matara. Our support team speaks Sinhala, Tamil, and English — reach us any time.
                </Text>
                {[
                  { icon: 'call'     as const, label: 'Phone',  value: '+94 11 234 5678' },
                  { icon: 'mail'     as const, label: 'Email',  value: 'support@constructai.lk' },
                  { icon: 'location' as const, label: 'Office', value: 'No. 14, Galle Road, Colombo 03, Sri Lanka' },
                ].map(c => (
                  <View key={c.label} className="flex-row items-center mb-6">
                    <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: 'rgba(249,115,22,0.14)' }}>
                      <Ionicons name={c.icon} size={20} color="#F97316" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">{c.label}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">{c.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </GlassSection>

        {/* FOOTER */}
        <View style={{ backgroundColor: 'rgba(5,8,18,0.97)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
          <View className="pt-20 pb-10 px-6 md:px-10">
            <View className="max-w-6xl mx-auto flex-row flex-wrap justify-between pb-12 mb-8" style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
              <View className="w-full md:w-1/3 mb-10 md:mb-0 pr-8">
                <View className="flex-row items-center mb-5">
              <Image source={require('../../assets/images/main-logo.png')} style={{ width: 44, height: 44, borderRadius: 10 }} />
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-extrabold text-2xl tracking-tight ml-3">
                    Construct<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Ai</Text>
                  </Text>
                </View>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 leading-relaxed mb-6">
                  Sri Lanka&apos;s most advanced construction management platform. Empowering contractors and project teams with real-time insights and AI-powered estimation in LKR.
                </Text>
                <View className="flex-row gap-3">
                  {['logo-facebook', 'logo-twitter', 'logo-linkedin', 'logo-instagram'].map(icon => (
                    <View key={icon} className="w-11 h-11 rounded-full items-center justify-center"
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }}>
                      <Ionicons name={icon as any} size={18} color="#6B7280" />
                    </View>
                  ))}
                </View>
              </View>
              {[
                { title: 'Platform', links: ['Features', 'AI Estimator', 'Client Portal', 'Mobile App', 'Integrations'] },
                { title: 'Company',  links: ['About', 'Blog', 'Careers', 'Press', 'Contact'] },
                { title: 'Legal',    links: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'SLA'] },
              ].map(col => (
                <View key={col.title} className="w-full md:w-1/6 mb-8 md:mb-0">
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base mb-5">{col.title}</Text>
                  {col.links.map(link => (
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} key={link} className="text-gray-500 mb-3 text-sm hover:text-white cursor-pointer transition-colors" onPress={() => scrollTo('home')}>{link}</Text>
                  ))}
                </View>
              ))}
            </View>
            <View className="max-w-6xl mx-auto flex-row flex-wrap items-center justify-between">
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-600 text-sm">© 2025 ConstructAi (Pvt) Ltd. Registered in Sri Lanka. All rights reserved.</Text>
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-700 text-xs mt-2 md:mt-0">Built with <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>❤</Text> in Colombo, Sri Lanka</Text>
            </View>
          </View>
        </View>

      
      <Pressable 
        style={{ minHeight: 44, minWidth: 44, position: 'absolute', right: 24, bottom: 24, zIndex: 9999 }} 
        onPress={() => scrollRef.current?.scrollTo({y: 0, animated: true})} 
        className="bg-brand-orange p-3 rounded-full shadow-2xl hover:scale-110 transition-transform cursor-pointer"
      >
        <Ionicons name="arrow-up" size={24} color="white" />
      </Pressable>
      
      </ScrollView>

    </View>
  );
}
