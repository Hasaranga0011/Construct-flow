import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Animated,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// ─── NAV LINKS ───────────────────────────────────────────────────────────────
const NAV_LINKS = ['Home', 'About', 'Services', 'Gallery', 'Team', 'Clients', 'Contact'];

// ─── SERVICES ────────────────────────────────────────────────────────────────
const SERVICES = [
  { icon: 'explore',        label: 'Planning',       desc: 'Comprehensive project planning to ensure every phase is executed on time and within budget.' },
  { icon: 'apartment',      label: 'Architecture',   desc: 'Creative architectural designs that blend aesthetics with structural integrity.' },
  { icon: 'construction',   label: 'Construction',   desc: 'Expert construction management with strict quality control at every milestone.' },
  { icon: 'design-services',label: 'Interior',       desc: 'Premium interior design that transforms spaces into functional and beautiful environments.' },
  { icon: 'format-paint',   label: 'Painting',       desc: 'Professional painting services using high-quality materials for lasting finishes.' },
  { icon: 'bolt',           label: 'Electricity',    desc: 'Safe and reliable electrical installations handled by certified professionals.' },
];

// ─── COUNTERS ─────────────────────────────────────────────────────────────────
const COUNTERS = [
  { icon: 'sentiment-satisfied-alt', value: '3874', label: 'Happy Clients' },
  { icon: 'check-circle',            value: '3874', label: 'Projects Done' },
  { icon: 'groups',                  value: '3874', label: 'Team Members' },
  { icon: 'emoji-events',            value: '3874', label: 'Awards Won' },
];

// ─── FOOTER LINKS ─────────────────────────────────────────────────────────────
const FOOTER_COMPANY = ['Home', 'About', 'Service', 'Gallery', 'Blog'];
const FOOTER_SUPPORT  = ['Terms & Condition', 'Privacy', 'Policy', 'Legal'];
const FOOTER_SOCIALS  = ['Facebook', 'Twitter', 'Instagram', 'LinkedIn', 'Pinterest'];

// ─── COLOUR TOKENS ────────────────────────────────────────────────────────────
const C = {
  primary:  '#e8a317',   // warm amber — matches the typical arch template orange/gold
  dark:     '#1c1f26',
  darker:   '#13151a',
  card:     '#242830',
  text:     '#d1d5db',
  muted:    '#6b7280',
  white:    '#ffffff',
};

// ─── SECTION TITLE ────────────────────────────────────────────────────────────
function SectionTitle({ title, light = false }: { title: string; light?: boolean }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 28 }}>
      <Text style={{ color: light ? C.white : C.dark, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
        {title}
      </Text>
      <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: C.primary, marginTop: 8 }} />
    </View>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const sectionRefs = useRef<{ [key: string]: number }>({});

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const [form, setForm] = useState({ name: '', email: '', subject: '', number: '', message: '' });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]).start();
  }, []);

  const scrollTo = (section: string) => {
    setMenuOpen(false);
    if (isWeb && typeof document !== 'undefined') {
      const el = document.getElementById(`section-${section}`);
      if (el) {
        // scrollIntoView with nearest scrollable ancestor (the RN ScrollView div)
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Nudge up by the fixed navbar height so content isn't hidden behind it
        setTimeout(() => {
          const scrollParent = el.closest('[style*="overflow"]');
          if (scrollParent) scrollParent.scrollBy({ top: -68, behavior: 'smooth' });
        }, 400);
      }
    } else {
      const y = sectionRefs.current[section] ?? 0;
      scrollRef.current?.scrollTo({ y, animated: true });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      {/* ════════════════════ STICKY NAVBAR ════════════════════ */}
      <View
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
          backgroundColor: C.darker,
          paddingTop: isWeb ? 0 : 42, paddingBottom: 0,
          paddingHorizontal: isWeb ? 40 : 20,
          height: isWeb ? 64 : 80,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 10,
        }}
      >
        {/* Logo */}
        <Pressable onPress={() => scrollTo('home')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="precision-manufacturing" size={19} color="#fff" />
          </View>
          <Text style={{ color: C.white, fontSize: 17, fontWeight: '900', letterSpacing: 0.5 }}>
            Construct<Text style={{ color: C.primary }}>Ai</Text>
          </Text>
        </Pressable>

        {/* ── Desktop: inline nav links ── */}
        {isWeb ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {NAV_LINKS.map((link) => (
              <Pressable
                key={link}
                onPress={() => scrollTo(link.toLowerCase())}
                style={({ pressed, hovered }: any) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: pressed || hovered ? 'rgba(232,163,23,0.12)' : 'transparent',
                })}
              >
                <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 }}>
                  {link}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => router.push('/login')}
              style={({ pressed }: any) => ({
                marginLeft: 12,
                backgroundColor: C.primary,
                borderRadius: 8,
                paddingHorizontal: 20,
                paddingVertical: 9,
                opacity: pressed ? 0.85 : 1,
                shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 8,
              })}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Sign In</Text>
            </Pressable>
          </View>
        ) : (
          /* ── Mobile: hamburger ── */
          <Pressable onPress={() => setMenuOpen(!menuOpen)} style={{ padding: 4 }}>
            <MaterialIcons name={menuOpen ? 'close' : 'menu'} size={26} color={C.white} />
          </Pressable>
        )}
      </View>

      {/* ─── Mobile Dropdown Menu ─── */}
      {!isWeb && menuOpen && (
        <View
          style={{
            position: 'absolute', top: 80, left: 0, right: 0, zIndex: 99,
            backgroundColor: C.dark,
            paddingVertical: 12, paddingHorizontal: 20,
            shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 12, elevation: 20,
          }}
        >
          {NAV_LINKS.map((link) => (
            <Pressable
              key={link}
              onPress={() => scrollTo(link.toLowerCase())}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}
            >
              <Text style={{ color: C.white, fontSize: 14, fontWeight: '600' }}>{link}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => { setMenuOpen(false); router.push('/login'); }}
            style={{
              marginTop: 12, backgroundColor: C.primary,
              borderRadius: 8, paddingVertical: 11, alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Sign In</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: isWeb ? 64 : 80 }}
      >
        {/* ════════════════════ HERO / SLIDER ════════════════════ */}
        <View
          nativeID="section-home"
          onLayout={(e) => { sectionRefs.current['home'] = e.nativeEvent.layout.y; }}
        >
          <LinearGradient
            colors={['#13151a', '#1c1f26', '#2a2d38']}
            style={{ paddingVertical: 70, paddingHorizontal: 24, minHeight: 420, justifyContent: 'center' }}
          >
            {/* Decorative circles */}
            <View style={{ position: 'absolute', top: 40, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(232,163,23,0.07)' }} />
            <View style={{ position: 'absolute', bottom: 20, left: -60, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(232,163,23,0.05)' }} />

            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
              {/* Badge */}
              <View style={{
                alignSelf: 'flex-start',
                borderWidth: 1, borderColor: 'rgba(232,163,23,0.5)',
                borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
                backgroundColor: 'rgba(232,163,23,0.1)', marginBottom: 20,
              }}>
                <Text style={{ color: C.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
                  🤖  AI-POWERED CONSTRUCTION MANAGEMENT
                </Text>
              </View>

              <Text style={{ color: C.white, fontSize: 34, fontWeight: '900', lineHeight: 42, marginBottom: 16 }}>
                SMART{'\n'}
                <Text style={{ color: C.primary }}>CONSTRUCTION</Text>{'\n'}
                PLATFORM
              </Text>

              <Text style={{ color: C.text, fontSize: 14, lineHeight: 22, marginBottom: 32, maxWidth: 340 }}>
                ConstructAi is a complete construction management system that unifies your entire team — from planning to delivery — in one seamless platform.
              </Text>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => router.push('/login')}
                  style={({ pressed }) => ({
                    backgroundColor: C.primary, borderRadius: 10,
                    paddingVertical: 14, paddingHorizontal: 28,
                    opacity: pressed ? 0.85 : 1,
                    shadowColor: C.primary, shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
                  })}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Get Started</Text>
                </Pressable>

                <Pressable
                  onPress={() => scrollTo('about')}
                  style={({ pressed }) => ({
                    borderWidth: 1.5, borderColor: C.primary, borderRadius: 10,
                    paddingVertical: 14, paddingHorizontal: 28,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: C.primary, fontSize: 14, fontWeight: '700' }}>Learn More</Text>
                </Pressable>
              </View>
            </Animated.View>
          </LinearGradient>
        </View>

        {/* ════════════════════ FEATURES (3 cards) ════════════════════ */}
        <View style={{ backgroundColor: '#f5f7fa', paddingVertical: 56, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {[
              { icon: 'assignment', title: 'Project Planning', color: '#3B82F6' },
              { icon: 'architecture', title: 'Architecture', color: C.primary },
              { icon: 'build', title: 'Construction', color: '#10B981' },
            ].map((f, i) => (
              <View
                key={i}
                style={{
                  flex: 1, backgroundColor: C.white, borderRadius: 14,
                  padding: 18, alignItems: 'center',
                  shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
                }}
              >
                <View style={{
                  width: 56, height: 56, borderRadius: 28,
                  backgroundColor: f.color + '18', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 14,
                }}>
                  <MaterialIcons name={f.icon as any} size={28} color={f.color} />
                </View>
                <Text style={{ color: C.dark, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                  {f.title}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ════════════════════ ABOUT ════════════════════ */}
        <View
          nativeID="section-about"
          onLayout={(e) => { sectionRefs.current['about'] = e.nativeEvent.layout.y - 90; }}
          style={{ backgroundColor: C.white, paddingVertical: 56, paddingHorizontal: 24 }}
        >
          {/* Accent block */}
          <View style={{
            backgroundColor: C.primary + '15', borderLeftWidth: 4,
            borderLeftColor: C.primary, borderRadius: 10,
            padding: 20, marginBottom: 28,
          }}>
            <Text style={{ color: C.primary, fontSize: 22, fontWeight: '900' }}>15</Text>
            <Text style={{ color: C.dark, fontSize: 14, fontWeight: '600' }}>Years of Experience</Text>
          </View>

          <Text style={{ color: C.dark, fontSize: 20, fontWeight: '800', marginBottom: 14 }}>
            Providing the best quality service
          </Text>

          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 24, marginBottom: 24 }}>
            Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua. At vero eos et accusam et justo duo dolores et ea rebum.{'\n\n'}Stet clita kasd gubergren, no sea takimata sanctus est Lorem ipsum dolor sit amet. Sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.
          </Text>

          <Pressable
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              backgroundColor: C.primary, borderRadius: 10,
              paddingVertical: 12, paddingHorizontal: 24,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Read More</Text>
          </Pressable>
        </View>

        {/* ════════════════════ SERVICES ════════════════════ */}
        <View
          nativeID="section-services"
          onLayout={(e) => { sectionRefs.current['services'] = e.nativeEvent.layout.y - 90; }}
          style={{ backgroundColor: '#f5f7fa', paddingVertical: 56, paddingHorizontal: 20 }}
        >
          <SectionTitle title="Awesome Services in Meaningful Way" />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {SERVICES.map((s, i) => (
              <View
                key={i}
                style={{
                  width: (width - 52) / 2,
                  backgroundColor: C.white, borderRadius: 14,
                  padding: 18,
                  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
                }}
              >
                <View style={{
                  width: 46, height: 46, borderRadius: 12,
                  backgroundColor: C.primary + '18', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12,
                }}>
                  <MaterialIcons name={s.icon as any} size={24} color={C.primary} />
                </View>
                <Text style={{ color: C.dark, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>
                  {s.label}
                </Text>
                <Text style={{ color: C.muted, fontSize: 11, lineHeight: 17 }}>
                  {s.desc}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ════════════════════ COUNTER / ACHIEVEMENTS ════════════════════ */}
        <LinearGradient
          colors={['#13151a', '#1c2535']}
          style={{ paddingVertical: 56, paddingHorizontal: 20 }}
        >
          <SectionTitle title={'Our Achievements\nin Numbers'} light />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {COUNTERS.map((c, i) => (
              <View
                key={i}
                style={{
                  width: (width - 52) / 2,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
                  borderRadius: 14, padding: 20, alignItems: 'center',
                }}
              >
                <MaterialIcons name={c.icon as any} size={30} color={C.primary} style={{ marginBottom: 10 }} />
                <Text style={{ color: C.white, fontSize: 28, fontWeight: '900' }}>{c.value}</Text>
                <Text style={{ color: C.text, fontSize: 12, marginTop: 4 }}>{c.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        {/* ════════════════════ GALLERY (screenshots) ════════════════════ */}
        <View
          nativeID="section-gallery"
          onLayout={(e) => { sectionRefs.current['gallery'] = e.nativeEvent.layout.y - 90; }}
          style={{ backgroundColor: C.white, paddingVertical: 56, paddingHorizontal: 20 }}
        >
          <SectionTitle title="App Gallery" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {[
              require('../../assets/images/dashboard.png'),
              require('../../assets/images/labour.png'),
              require('../../assets/images/materials.png'),
              require('../../assets/images/notifications.png'),
              require('../../assets/images/ml-insights.png'),
              require('../../assets/images/client-portal.png'),
            ].map((src, i) => (
              <View
                key={i}
                style={{
                  width: 200, height: 130, borderRadius: 12, overflow: 'hidden',
                  shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
                }}
              >
                <Image source={src} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ════════════════════ TEAM ════════════════════ */}
        <View
          nativeID="section-team"
          onLayout={(e) => { sectionRefs.current['team'] = e.nativeEvent.layout.y - 90; }}
          style={{ backgroundColor: '#f5f7fa', paddingVertical: 56, paddingHorizontal: 20 }}
        >
          <SectionTitle title="Meet Our Expert Team" />
          <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { name: 'Ahmad Raza',    role: 'Lead Architect',      icon: 'person', color: '#3B82F6' },
              { name: 'Sara Khan',     role: 'Project Manager',     icon: 'manage-accounts', color: C.primary },
              { name: 'Ali Hassan',    role: 'Site Engineer',       icon: 'engineering', color: '#10B981' },
              { name: 'Fatima Malik', role: 'Interior Designer',   icon: 'design-services', color: '#8B5CF6' },
            ].map((m, i) => (
              <View
                key={i}
                style={{
                  width: (width - 52) / 2,
                  backgroundColor: C.white, borderRadius: 14,
                  padding: 20, alignItems: 'center',
                  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
                }}
              >
                <View style={{
                  width: 64, height: 64, borderRadius: 32,
                  backgroundColor: m.color + '20', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 12, borderWidth: 2, borderColor: m.color + '40',
                }}>
                  <MaterialIcons name={m.icon as any} size={30} color={m.color} />
                </View>
                <Text style={{ color: C.dark, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{m.name}</Text>
                <Text style={{ color: C.muted, fontSize: 11, marginTop: 4, textAlign: 'center' }}>{m.role}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ════════════════════ TESTIMONIAL / CLIENTS ════════════════════ */}
        <View
          nativeID="section-clients"
          onLayout={(e) => { sectionRefs.current['clients'] = e.nativeEvent.layout.y - 90; }}
          style={{ backgroundColor: C.white, paddingVertical: 56, paddingHorizontal: 20 }}
        >
          <SectionTitle title="What Our Clients Say" />
          {[
            { name: 'James Carter',   org: 'Carter Builders Ltd',    text: 'ConstructAi completely transformed how we manage our sites. The real-time dashboards saved us hours every week.' },
            { name: 'Maria Gonzalez', org: 'Elite Architecture',      text: 'An outstanding platform for coordinating between architects, managers, and workers. Highly recommended.' },
          ].map((t, i) => (
            <View
              key={i}
              style={{
                backgroundColor: '#f9fafb', borderRadius: 14,
                padding: 20, marginBottom: 14,
                borderLeftWidth: 4, borderLeftColor: C.primary,
                shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
              }}
            >
                <Text style={{ color: C.muted, fontSize: 22, marginBottom: 8 }}>&quot;</Text>
              <Text style={{ color: C.dark, fontSize: 13, lineHeight: 21, marginBottom: 12 }}>{t.text}</Text>
              <Text style={{ color: C.dark, fontSize: 13, fontWeight: '700' }}>{t.name}</Text>
              <Text style={{ color: C.muted, fontSize: 11 }}>{t.org}</Text>
            </View>
          ))}
        </View>

        {/* ════════════════════ CONTACT ════════════════════ */}
        <View
          nativeID="section-contact"
          onLayout={(e) => { sectionRefs.current['contact'] = e.nativeEvent.layout.y - 90; }}
          style={{ backgroundColor: '#f5f7fa', paddingVertical: 56, paddingHorizontal: 20 }}
        >
          {/* Form */}
          <Text style={{ color: C.dark, fontSize: 20, fontWeight: '800', marginBottom: 20 }}>Get In Touch</Text>
          {(['name', 'email', 'subject', 'number'] as const).map((field) => (
            <TextInput
              key={field}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              placeholderTextColor={C.muted}
              value={form[field]}
              onChangeText={(v) => setForm({ ...form, [field]: v })}
              style={{
                backgroundColor: C.white, borderRadius: 10,
                borderWidth: 1, borderColor: '#e5e7eb',
                paddingHorizontal: 16, paddingVertical: 13,
                fontSize: 14, color: C.dark, marginBottom: 12,
              }}
            />
          ))}
          <TextInput
            placeholder="Message"
            placeholderTextColor={C.muted}
            multiline
            numberOfLines={5}
            value={form.message}
            onChangeText={(v) => setForm({ ...form, message: v })}
            style={{
              backgroundColor: C.white, borderRadius: 10,
              borderWidth: 1, borderColor: '#e5e7eb',
              paddingHorizontal: 16, paddingVertical: 13,
              fontSize: 14, color: C.dark, marginBottom: 16,
              minHeight: 110, textAlignVertical: 'top',
            }}
          />
          <Pressable
            style={({ pressed }) => ({
              backgroundColor: C.primary, borderRadius: 10,
              paddingVertical: 14, alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 1 }}>SEND MESSAGE</Text>
          </Pressable>

          {/* Contact Info */}
          <View style={{ marginTop: 36 }}>
            <Text style={{ color: C.dark, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>Contact Us</Text>
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 21, marginBottom: 20 }}>
              Lorem ipsum dolor sit consetetur sadipscing elitr, sed diam nonumy eirmod tempor inidunt ut labore et dolore.
            </Text>
            {[
              { icon: 'phone',     val: '+12345678987654' },
              { icon: 'email',     val: 'architecture@gmail.com' },
              { icon: 'language',  val: 'www.architectandconstruction.com' },
              { icon: 'location-on', val: 'London Plaza 38/3, New York\nUnited States of America' },
            ].map((info, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 }}>
                <View style={{
                  width: 38, height: 38, borderRadius: 10,
                  backgroundColor: C.primary + '18', alignItems: 'center', justifyContent: 'center',
                  marginRight: 12, marginTop: 2,
                }}>
                  <MaterialIcons name={info.icon as any} size={18} color={C.primary} />
                </View>
                <Text style={{ color: C.dark, fontSize: 13, lineHeight: 20, flex: 1 }}>{info.val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ════════════════════ FOOTER ════════════════════ */}
        <LinearGradient
          colors={['#13151a', '#1c1f26']}
          style={{ paddingTop: 48, paddingBottom: 24, paddingHorizontal: 20 }}
        >
          {/* Brand */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="precision-manufacturing" size={17} color="#fff" />
            </View>
            <Text style={{ color: C.white, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 }}>
              Construct<Text style={{ color: C.primary }}>Ai</Text>
            </Text>
          </View>
          <Text style={{ color: C.text, fontSize: 12, lineHeight: 20, marginBottom: 28, maxWidth: 300 }}>
            Lorem ipsum dolor sit consetetur sadipscing elitr, sed diam nonumy eirmod tempor inidunt ut labore et dolore.
          </Text>

          <View style={{ flexDirection: 'row', gap: 32, flexWrap: 'wrap', marginBottom: 32 }}>
            {[
              { title: 'Company', links: FOOTER_COMPANY },
              { title: 'Support',  links: FOOTER_SUPPORT },
              { title: 'Socials',  links: FOOTER_SOCIALS },
            ].map((col, i) => (
              <View key={i}>
                <Text style={{ color: C.white, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>{col.title}</Text>
                {col.links.map((link) => (
                  <Text key={link} style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>{link}</Text>
                ))}
              </View>
            ))}
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 16, alignItems: 'center' }}>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              Designed and Developed by{' '}
              <Text style={{ color: C.primary }}>Muhammad SamiUllah</Text>
            </Text>
          </View>
        </LinearGradient>
      </ScrollView>
    </View>
  );
}
