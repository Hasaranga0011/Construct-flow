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
import {
  View, Text, ScrollView, Pressable, Image,
  TextInput, useWindowDimensions, Platform, Animated,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { FontAwesome5, MaterialIcons, Ionicons, Entypo } from '@expo/vector-icons';
import { getDashboardForRole } from '../utils/auth';


// ─── Tuneable constants (adjust here — no other file needs changing) ──────────
const BLUR: string   = '3px';   // CSS blur on the video layer
const DIM: string    = '0.45';   // dark overlay opacity 0=none 1=black
const SCROLL_LENGTH  = '600vh';  // scroll distance for one full video pass
const LERP_FACTOR    = 0.10;    // easing factor (lower=smoother/more lag)
// ─────────────────────────────────────────────────────────────────────────────

// Resolve the bundled asset URL using Metro's require
const videoAsset = require('../../images/homepage_scroll.mp4');
const VIDEO_SRC = typeof videoAsset === 'string' ? videoAsset : Image.resolveAssetSource(videoAsset).uri;


function injectVideoBackground(): () => void {
  if (typeof document === 'undefined') return () => {};

  // CSS
  if (!document.getElementById('cf-vbg-style')) {
    const s = document.createElement('style');
    s.id = 'cf-vbg-style';
    s.textContent = `
      :root{--vblur:${BLUR};--vdim:${DIM};}
      #cf-vbg{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;z-index:0;overflow:hidden;
        background:linear-gradient(135deg,#0f172a 0%,#1e293b 55%,#0c1a2e 100%);}
      #cf-vbg video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center center;
        transform:scale(1.1);filter:blur(var(--vblur)) brightness(0.65);
        opacity:0;transition:opacity 1s ease;}
      #cf-vbg.rdy video{opacity:1;}
      #cf-vbg video.rdy{opacity:1;}
      #cf-vbg .dim{position:absolute;inset:0;z-index:1;
        background:linear-gradient(to bottom,
          rgba(0,0,0,calc(var(--vdim)*.5)) 0%,
          rgba(0,0,0,var(--vdim)) 50%,
          rgba(0,0,0,calc(var(--vdim)*1.5)) 100%);}
      body{margin:0;overflow-x:hidden;}
      body>[data-rnwstyle],body>#root{position:relative;z-index:1;}
    `;
    document.head.appendChild(s);
  }

  // Container
  let c = document.getElementById('cf-vbg');
  if (!c) {
    c = document.createElement('div'); c.id = 'cf-vbg';
    const d = document.createElement('div'); d.className = 'dim';
    c.appendChild(d);
    document.body.insertBefore(c, document.body.firstChild);
  }

  // Video
  let v = c.querySelector('video') as HTMLVideoElement | null;
  if (!v) {
    v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    v.preload = 'auto'; v.autoplay = false;
    v.loop = false; v.src = VIDEO_SRC;
    c.appendChild(v);
    v.addEventListener('loadedmetadata', () => v!.classList.add('rdy'));
    v.load(); // iOS/Safari seek unlock
  }

  // rAF scroll scrubber
  let raf = 0;
  let cur = 0;
  let tgt = 0;

  const progress = () => {
    return (window as any).__cfScrollProgress || 0;
  };

  const tick = () => {
    const vid = c!.querySelector('video') as HTMLVideoElement | null;
    if (vid && vid.readyState >= 1 && vid.duration > 0) {
      tgt = progress() * vid.duration;
      cur += (tgt - cur) * LERP_FACTOR;
      if (Math.abs(vid.currentTime - cur) > 0.008) vid.currentTime = cur;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

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
    <View className="flex-row items-center p-1 rounded-full w-[240px] sm:w-[280px]">
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

export default function LandingPage() {
  const { session, role } = useAuth();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [countersTriggered, setCountersTriggered] = useState(false);
  const [countersY, setCountersY] = useState(0);
  const { height: wh, width: ww } = useWindowDimensions();
  const isMobile = ww < 768;
  const isTablet = ww >= 768 && ww < 1024;
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
    backdropFilter: 'blur(20px)',
  };

  const slProjects = [
    { img: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?q=80&w=600', type: 'Commercial Tower',   name: 'WTC Colombo Expansion',          location: 'Colombo 01',           budget: 'LKR 4.2Bn' },
    { img: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=600', type: 'Luxury Residential', name: 'Cinnamon Life Residencies',      location: 'Beira Lake, Colombo',  budget: 'LKR 2.8Bn' },
    { img: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?q=80&w=600', type: 'Infrastructure',    name: 'Colombo\u2013Kandy Expressway Ph.3', location: 'Kadugannawa, Kandy',   budget: 'LKR 18Bn'  },
    { img: 'https://images.unsplash.com/photo-1551882547-ff40c0d129df?q=80&w=600', type: 'Hospitality',       name: 'Jetwing Galle Fort Hotel',       location: 'Galle Fort',           budget: 'LKR 650M'  },
    { img: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?q=80&w=600', type: 'Retail Complex',    name: 'One Galle Face Mall Ph.2',       location: 'Colombo 03',           budget: 'LKR 3.1Bn' },
    { img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=600', type: 'Industrial',        name: 'Hambantota Port Dry Zone',       location: 'Hambantota',           budget: 'LKR 9.4Bn' },
  ];

  const features = [
    { icon: <Ionicons name="people" size={28} color="#F97316" />,          title: 'Role-Based Portals',  desc: 'Separate dashboards for Admin, PM, Site Manager, Supplier, Client and Worker \u2014 each scoped to their data with live Supabase sync.' },
    { icon: <FontAwesome5 name="layer-group" size={24} color="#F97316" />, title: 'Live Inventory',      desc: 'Track Portland Cement, River Sand, Steel Rebar and 200+ materials across all sites with instant low-stock alerts to your phone.' },
    { icon: <Ionicons name="hammer" size={28} color="#F97316" />,          title: 'QR Attendance',       desc: 'Workers scan site-specific QR codes to check in. Masons, carpenters, plumbers \u2014 all tracked with hours worked and daily snapshots.' },
    { icon: <Ionicons name="pie-chart" size={28} color="#F97316" />,       title: 'AI Cost Estimator',   desc: 'RandomForest ML trained on 50,000 Sri Lankan data points. Get LKR-accurate predictions with R\u00b2 = 0.95 confidence in seconds.' },
    { icon: <Entypo name="globe" size={28} color="#F97316" />,             title: 'Client Portal',       desc: 'Give clients real-time milestone visibility, LKR budget charts, and direct in-app messaging \u2014 no more phone calls for updates.' },
    { icon: <Ionicons name="notifications" size={28} color="#F97316" />,  title: 'Push Notifications',  desc: 'Instant alerts for delayed deliveries, absent workers, pending approvals, and budget overruns on web and native iOS/Android.' },
  ];

  return (
    <View className="flex-1" style={{ backgroundColor: 'transparent' }}>

      {/* NAVBAR */}
      <View
        className="absolute top-0 w-full z-50 px-6 md:px-10"
        style={{
          paddingTop: isScrolled ? 12 : 24,
          paddingBottom: isScrolled ? 12 : 24,
          backgroundColor: isScrolled ? 'rgba(10,15,30,0.92)' : 'transparent',
          backdropFilter: isScrolled ? 'blur(24px)' : 'none',
          borderBottomWidth: isScrolled ? 1 : 0,
          borderBottomColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <View className="max-w-7xl mx-auto w-full flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="w-9 h-9 sm:w-11 sm:h-11 bg-brand-orange rounded-xl items-center justify-center mr-3"
              style={{ shadowColor: '#F97316', shadowOpacity: 0.45, shadowRadius: 14 }}>
              <MaterialIcons name="precision-manufacturing" size={isMobile ? 20 : 24} color="white" />
            </View>
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-base sm:text-xl tracking-tight">
              Construct<Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Ai</Text>
            </Text>
          </View>

          <View className="flex-row items-center hidden xl:flex">
            {[{ label: 'Home', id: 'home' }, { label: 'Services', id: 'services' }, { label: 'Gallery', id: 'projects' }, { label: 'Contact', id: 'contact' }].map(item => (
              <Pressable style={{ minHeight: 44, minWidth: 44 }} key={item.id} className="mx-4 cursor-pointer" onPress={() => scrollTo(item.id)}>
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 font-semibold text-base hover:text-white transition-colors">{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <View>
            {session ? (
              <Link href={(role ? getDashboardForRole(role) : '/') as any} asChild>
                <Pressable className="bg-brand-orange px-3 sm:px-6 py-2.5 rounded-full"
                  style={{ shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 10, minHeight: 44, minWidth: 44 }}>
                  <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xs sm:text-base">Go to Dashboard</Text>
                </Pressable>
              </Link>
            ) : (
              <PortalToggle />
            )}
          </View>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" ref={scrollRef} className="flex-1" showsVerticalScrollIndicator={false} onScroll={handleScroll} scrollEventThrottle={16}>

        {/* HERO */}
        <View className="pt-36 pb-32 px-6 md:px-12 relative" id="home" onLayout={event => { sectionOffsets.current.home = event.nativeEvent.layout.y; }} style={{ minHeight: wh }}>
          <View style={{ position: 'absolute', top: -80, right: -80, width: 480, height: 480, borderRadius: 240, backgroundColor: 'rgba(249,115,22,0.07)', pointerEvents: 'none' }} />
          <View style={{ position: 'absolute', bottom: 80, left: -100, width: 360, height: 360, borderRadius: 180, backgroundColor: 'rgba(59,130,246,0.05)', pointerEvents: 'none' }} />

          <View className="max-w-7xl mx-auto w-full flex-row flex-wrap items-center z-10">

            {/* Left */}
            <View className="w-full lg:w-1/2 pr-0 lg:pr-16 mb-16 lg:mb-0">
              <View className="self-start flex-row items-center px-4 py-1.5 rounded-full border mb-6"
                style={{ borderColor: 'rgba(249,115,22,0.45)', backgroundColor: 'rgba(249,115,22,0.1)' }}>
                <View className="w-2 h-2 rounded-full bg-brand-orange mr-2" />
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-xs tracking-widest uppercase">Sri Lanka&apos;s #1 Construction Platform</Text>
              </View>

              <Text maxFontSizeMultiplier={1.3} className="text-white font-extrabold leading-tight mb-6" style={[{ flexShrink: 1, minWidth: 0 }, { fontSize: isMobile ? 40 : 52, lineHeight: isMobile ? 48 : 60 }]}>
                Build Smarter,{'\n'}
                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: '#F97316' }]}>Deliver</Text>{'\n'}
                On Time.
              </Text>

              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-300 text-lg leading-relaxed mb-10 max-w-xl">
                Complete construction management for Sri Lankan contractors — projects, materials, labour, payroll, client portals, and AI cost estimation in LKR. Trusted by teams from Colombo to Jaffna.
              </Text>

              <View className="flex-row flex-wrap items-center mb-12">
                <Link href="/team-login" asChild>
                  <Pressable className="flex-row items-center px-8 py-4 rounded-full mr-4 mb-4"
                    style={{ backgroundColor: '#F97316', shadowColor: '#F97316', shadowOpacity: 0.45, shadowRadius: 24, elevation: 8, minHeight: 44, minWidth: 44 }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg mr-2">Team Portal</Text>
                    <Ionicons name="arrow-forward" size={20} color="white" />
                  </Pressable>
                </Link>
                <Link href="/partner-login" asChild>
                  <Pressable className="px-8 py-4 rounded-full mb-4"
                    style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.05)', minHeight: 44, minWidth: 44 }}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Partner Portal</Text>
                  </Pressable>
                </Link>
              </View>

              <View className="flex-row flex-wrap gap-8">
                {[{ val: '15+', label: 'Modules' }, { val: '6', label: 'Role Types' }, { val: 'LKR', label: 'Native Currency' }, { val: '95%', label: 'ML Accuracy' }].map(s => (
                  <View key={s.label}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-extrabold text-3xl mb-0.5">{s.val}</Text>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs tracking-widest uppercase font-semibold">{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Right — glass dashboard card */}
            <View className="w-full lg:w-1/2">
              <View className="rounded-3xl p-6 md:p-8 relative overflow-hidden"
                style={{ ...g, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 48, elevation: 16 }}>
                <View style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(249,115,22,0.13)' }} />

                <View className="flex-row items-center pb-4 mb-5" style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                  <View className="flex-row mr-3">
                    {['#EF4444', '#F59E0B', '#22C55E'].map(c => (
                      <View key={c} className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: c }} />
                    ))}
                  </View>
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(156,163,175,0.8)', fontSize: 12, fontWeight: '500' }]}>ConstructAi — Nimal Fernando (PM)</Text>
                </View>

                <View className={isMobile ? "flex-col mb-4" : "flex-row flex-wrap -mx-1.5 mb-4"}>
                  {[
                    { label: 'ACTIVE PROJECTS', value: '15',        color: '#F97316' },
                    { label: 'WORKERS ON-SITE',  value: '142',       color: '#22C55E' },
                    { label: 'MATERIALS VALUE',  value: 'LKR 12.4M', color: '#3B82F6' },
                    { label: 'PENDING PAYROLL',  value: '7',          color: '#A855F7' },
                  ].map(card => (
                    <View key={card.label} className={isMobile ? "w-full mb-3" : "w-1/2 px-1.5 mb-3"}>
                      <View className="p-4 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(156,163,175,0.9)', fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: 6 }]}>{card.label}</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: card.color, fontWeight: '800', fontSize: isMobile ? 18 : 22 }]}>{card.value}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View className="p-5 rounded-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' }}>
                  <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(156,163,175,0.9)', fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: 16 }]}>ACTIVE PROJECT PROGRESS</Text>
                  {[
                    { name: 'WTC Colombo Expansion',   pct: 72, color: '#F97316' },
                    { name: 'Kandy Expressway Ph.3',    pct: 45, color: '#3B82F6' },
                    { name: 'Hambantota Port Zone',     pct: 88, color: '#22C55E' },
                  ].map(proj => (
                    <View key={proj.name} className="mb-4">
                      <View className="flex-row justify-between mb-1.5">
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(209,213,219,0.9)', fontSize: 13 }]}>{proj.name}</Text>
                        <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { color: 'rgba(156,163,175,0.8)', fontSize: 13 }]}>{proj.pct}%</Text>
                      </View>
                      <View className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'rgba(75,85,99,0.5)' }}>
                        <View className="h-full rounded-full" style={{ width: `${proj.pct}%`, backgroundColor: proj.color }} />
                      </View>
                    </View>
                  ))}
                </View>

                <Text maxFontSizeMultiplier={1.3} style={[{ flexShrink: 1, minWidth: 0 }, { textAlign: 'center', color: 'rgba(107,114,128,0.8)', fontSize: 11, letterSpacing: 2, marginTop: 16 }]}>
                  ↓  SCROLL TO ORBIT THE SITE  ↓
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* FEATURES */}
        <View className="py-24 px-6 md:px-10" id="services" onLayout={event => { sectionOffsets.current.services = event.nativeEvent.layout.y; }} style={{ backgroundColor: 'rgba(10,14,26,0.82)', backdropFilter: 'blur(8px)' }}>
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
        </View>

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
        <View className="py-24 px-6 md:px-10" id="projects" onLayout={event => { sectionOffsets.current.projects = event.nativeEvent.layout.y; }} style={{ backgroundColor: 'rgba(8,12,22,0.88)', backdropFilter: 'blur(8px)' }}>
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
                  <View className="rounded-3xl overflow-hidden" style={{ ...g }}>
                    <View style={{ height: 200, overflow: 'hidden' }}>
                      <Image source={{ uri: proj.img }} className="w-full h-full" resizeMode="cover" />
                    </View>
                    <View className="p-6">
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-semibold text-xs tracking-widest uppercase mb-1">{proj.type}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-xl mb-2">{proj.name}</Text>
                      <View className="flex-row items-center justify-between">
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
        </View>

        {/* ANIMATED COUNTERS */}
        <View className="py-24 px-6" style={{ backgroundColor: 'rgba(10,14,26,0.85)', backdropFilter: 'blur(8px)' }}
          onLayout={e => setCountersY(e.nativeEvent.layout.y)}>
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
        </View>

        {/* HOW IT WORKS */}
        <View className="py-24 px-6 md:px-10"
          style={{ backgroundColor: 'rgba(249,115,22,0.07)', backdropFilter: 'blur(8px)', borderTopWidth: 1, borderTopColor: 'rgba(249,115,22,0.1)' }}>
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
        </View>

        {/* CONTACT */}
        <View className="py-24 px-6 md:px-10" id="contact" onLayout={event => { sectionOffsets.current.contact = event.nativeEvent.layout.y; }} style={{ backgroundColor: 'rgba(8,12,22,0.90)', backdropFilter: 'blur(8px)' }}>
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
                  {['Your Name', 'Email Address', 'Company / Project Name'].map(ph => (
                    <TextInput maxFontSizeMultiplier={1.3} key={ph} placeholder={ph} placeholderTextColor="rgba(156,163,175,0.65)"
                      style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  ))}
                  <TextInput maxFontSizeMultiplier={1.3} placeholder="Your message" placeholderTextColor="rgba(156,163,175,0.65)"
                    multiline textAlignVertical="top"
                    style={[{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 16, color: '#fff', height: 120, marginBottom: 14 }, { minHeight: 44, minWidth: 44 }]} />
                  <Pressable className="w-full py-4 rounded-xl items-center"
                    style={[{ backgroundColor: '#F97316', shadowColor: '#F97316', shadowOpacity: 0.4, shadowRadius: 16 }, { minHeight: 44, minWidth: 44 }]}>
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-lg">Send Message</Text>
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
                    <View>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold">{c.label}</Text>
                      <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">{c.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <View style={{ backgroundColor: 'rgba(5,8,18,0.97)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
          <View className="pt-20 pb-10 px-6 md:px-10">
            <View className="max-w-6xl mx-auto flex-row flex-wrap justify-between pb-12 mb-8" style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
              <View className="w-full md:w-1/3 mb-10 md:mb-0 pr-8">
                <View className="flex-row items-center mb-5">
                  <MaterialIcons name="precision-manufacturing" size={30} color="#F97316" />
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
                    <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} key={link} className="text-gray-500 mb-3 text-sm hover:text-white cursor-pointer transition-colors">{link}</Text>
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

      </ScrollView>
    </View>
  );
}
