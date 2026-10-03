import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Image, TextInput, useWindowDimensions } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { FontAwesome5, MaterialIcons, Ionicons, Entypo } from '@expo/vector-icons';
import { getDashboardForRole } from '../utils/auth';

const AnimatedCounter = ({ value, suffix = '', isDecimal = false, triggered }: { value: number, suffix?: string, isDecimal?: boolean, triggered: boolean }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!triggered) return;
    
    let start = 0;
    const end = value;
    if (start === end) return;
    
    const duration = 2000;
    const incrementTime = 30;
    const totalSteps = duration / incrementTime;
    const step = end / totalSteps;
    
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, incrementTime);
    
    return () => clearInterval(timer);
  }, [value, triggered]);

  const displayValue = isDecimal ? count.toFixed(1) : Math.floor(count).toLocaleString();
  return <Text className="text-white font-extrabold text-4xl md:text-5xl mb-2">{displayValue}{suffix}</Text>;
}

export default function LandingPage() {
  const { session, role } = useAuth();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [countersTriggered, setCountersTriggered] = useState(false);
  const [countersY, setCountersY] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  const handleCTA = () => {
    if (session) {
      const destination = role ? getDashboardForRole(role) : null;
      router.push((destination ?? '/') as any);
    } else {
      router.push('/team-register');
    }
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setIsScrolled(offsetY > 50);
    
    if (!countersTriggered && countersY > 0 && offsetY + windowHeight > countersY + 200) {
      setCountersTriggered(true);
    }
  };

  const scrollTo = (sectionId: string) => {
    if (typeof document !== 'undefined') {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
          const scrollParent = el.closest('[style*="overflow"]');
          if (scrollParent) scrollParent.scrollBy({ top: -80, behavior: 'smooth' });
        }, 400);
      }
    }
  };

  return (
    <View className="flex-1 bg-brand-light">
      
      {/* --- HEADER NAVBAR (Animated on Scroll) --- */}
      <View 
        className={`absolute top-0 w-full z-50 transition-all duration-300 ${
          isScrolled ? 'bg-brand-dark/95 shadow-lg py-3' : 'bg-transparent py-6'
        } px-8`}
      >
        <View className="max-w-7xl mx-auto w-full flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="w-11 h-11 bg-brand-orange rounded-xl items-center justify-center mr-3">
              <MaterialIcons name="precision-manufacturing" size={24} color="white" />
            </View>
            <Text className="text-white font-bold text-xl tracking-tight">Construct<Text style={{ color: '#F97316' }}>Ai</Text></Text>
          </View>
          <View className="flex-row items-center hidden md:flex">
            <Pressable className="mx-4 group cursor-pointer" onPress={() => scrollTo('home')}>
              <Text className="text-gray-300 font-semibold text-lg hover:text-white transition-colors duration-300">Home</Text>
              <View className="h-0.5 w-0 bg-brand-orange group-hover:w-full transition-all duration-300 mt-1 rounded-full" />
            </Pressable>
            <Pressable className="mx-4 group cursor-pointer" onPress={() => scrollTo('about')}>
              <Text className="text-gray-300 font-semibold text-lg hover:text-white transition-colors duration-300">About</Text>
              <View className="h-0.5 w-0 bg-brand-orange group-hover:w-full transition-all duration-300 mt-1 rounded-full" />
            </Pressable>
            <Pressable className="mx-4 group cursor-pointer" onPress={() => scrollTo('gallery')}>
              <Text className="text-gray-300 font-semibold text-lg hover:text-white transition-colors duration-300">Services</Text>
              <View className="h-0.5 w-0 bg-brand-orange group-hover:w-full transition-all duration-300 mt-1 rounded-full" />
            </Pressable>
            <Pressable className="mx-4 group cursor-pointer" onPress={() => scrollTo('contact')}>
              <Text className="text-gray-300 font-semibold text-lg hover:text-white transition-colors duration-300">Contact</Text>
              <View className="h-0.5 w-0 bg-brand-orange group-hover:w-full transition-all duration-300 mt-1 rounded-full" />
            </Pressable>
          </View>
          <View>
            {session ? (
              <Link href={(role ? getDashboardForRole(role) : '/') as any} asChild>
                <Pressable className="bg-brand-orange px-6 py-2 rounded-full hover:bg-orange-600 transition-colors">
                  <Text className="text-white font-bold">Go to Dashboard</Text>
                </Pressable>
              </Link>
            ) : (
              <View className="flex-row items-center">
                <Link href="/partner-login" asChild>
                  <Pressable className="mr-6">
                    <Text className="text-gray-300 font-bold hover:text-white">Partner Portal</Text>
                  </Pressable>
                </Link>
                <Link href="/team-login" asChild>
                  <Pressable className="bg-brand-orange px-6 py-2 rounded-full hover:bg-orange-600 transition-colors">
                    <Text className="text-white font-bold">Team Portal</Text>
                  </Pressable>
                </Link>
              </View>
            )}
          </View>
        </View>
      </View>

      <ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* --- HERO SECTION --- */}
        <View className="bg-brand-dark pt-40 pb-24 px-8 relative overflow-hidden" id="home">
          {/* Abstract subtle background element */}
          <View className="absolute top-10 right-0 opacity-5">
             <Ionicons name="layers" size={600} color="#F97316" />
          </View>
          
          <View className="max-w-7xl mx-auto w-full flex-row flex-wrap items-center z-10">
            {/* Left Column */}
            <View className="w-full lg:w-1/2 pr-0 lg:pr-12 mb-16 lg:mb-0">
              <View className="self-start px-4 py-1.5 rounded-full border border-brand-orange mb-6 flex-row items-center">
                <View className="w-2 h-2 rounded-full bg-brand-orange mr-2" />
                <Text className="text-brand-orange font-bold text-xs tracking-widest uppercase">Construction Management Platform</Text>
              </View>
              
              <Text className="text-white font-extrabold text-5xl md:text-7xl leading-tight mb-6">
                Build Smarter,{'\n'}
                <Text className="text-brand-orange">Deliver</Text>{'\n'}
                On Time.
              </Text>
              
              <Text className="text-gray-400 text-lg md:text-xl leading-relaxed mb-10 max-w-lg">
                Complete construction management for Sri Lankan companies — projects, materials, labour, payroll, client portals, and AI-powered cost estimation in one platform.
              </Text>
              
              <View className="flex-row flex-wrap items-center mb-16">
                <Link href="/team-login" asChild>
                  <Pressable className="bg-brand-orange px-8 py-4 rounded-full shadow-lg hover:bg-orange-600 transition-colors mr-4 mb-4 flex-row items-center">
                    <Text className="text-white font-bold text-lg mr-2">Team Portal</Text>
                    <Ionicons name="arrow-forward" size={20} color="white" />
                  </Pressable>
                </Link>
                
                <Link href="/partner-login" asChild>
                  <Pressable className="bg-transparent px-8 py-4 rounded-full border border-gray-500 hover:border-white transition-colors mb-4">
                    <Text className="text-white font-bold text-lg">Partner Portal</Text>
                  </Pressable>
                </Link>
              </View>
              
              <View className="flex-row items-center">
                <View className="mr-12">
                  <Text className="text-brand-orange font-extrabold text-2xl md:text-3xl mb-1">15+</Text>
                  <Text className="text-gray-500 text-xs tracking-widest uppercase font-semibold">Modules</Text>
                </View>
                <View className="mr-12">
                  <Text className="text-brand-orange font-extrabold text-2xl md:text-3xl mb-1">6</Text>
                  <Text className="text-gray-500 text-xs tracking-widest uppercase font-semibold">Role Types</Text>
                </View>
                <View>
                  <Text className="text-brand-orange font-extrabold text-2xl md:text-3xl mb-1">LKR</Text>
                  <Text className="text-gray-500 text-xs tracking-widest uppercase font-semibold">Native Currency</Text>
                </View>
              </View>
            </View>
            
            {/* Right Column: Dashboard preview */}
            <View className="w-full lg:w-1/2">
              <View className="bg-[#1F2937] rounded-3xl p-6 md:p-8 border border-gray-700 shadow-2xl relative overflow-hidden opacity-95">
                {/* Background glow effect for card */}
                <View className="absolute top-0 right-0 w-64 h-64 bg-brand-orange/10 rounded-full blur-3xl -z-10" />

                {/* Preview header */}
                <View className="flex-row items-center border-b border-gray-700 pb-4 mb-6">
                  <View className="flex-row mr-4">
                    <View className="w-3 h-3 rounded-full bg-gray-500 mr-2" />
                    <View className="w-3 h-3 rounded-full bg-gray-500 mr-2" />
                    <View className="w-3 h-3 rounded-full bg-gray-500" />
                  </View>
                  <Text className="text-gray-400 font-medium text-sm">ConstructAi Dashboard</Text>
                </View>
                
                {/* 4 Cards Grid */}
                <View className="flex-row flex-wrap -mx-2 mb-4">
                  <View className="w-1/2 px-2 mb-4">
                    <View className="bg-[#111827]/80 p-4 md:p-5 rounded-2xl border border-gray-700 hover:border-brand-orange/50 transition-colors">
                      <Text className="text-gray-400 text-xs tracking-widest font-semibold mb-2">ACTIVE PROJECTS</Text>
                      <Text className="text-white font-extrabold text-3xl">12</Text>
                    </View>
                  </View>
                  <View className="w-1/2 px-2 mb-4">
                    <View className="bg-[#111827]/80 p-4 md:p-5 rounded-2xl border border-gray-700 hover:border-brand-orange/50 transition-colors">
                      <Text className="text-gray-400 text-xs tracking-widest font-semibold mb-2">WORKERS ON-SITE</Text>
                      <Text className="text-white font-extrabold text-3xl">48</Text>
                    </View>
                  </View>
                  <View className="w-1/2 px-2">
                    <View className="bg-[#111827]/80 p-4 md:p-5 rounded-2xl border border-gray-700 hover:border-brand-orange/50 transition-colors">
                      <Text className="text-gray-400 text-xs tracking-widest font-semibold mb-2">MATERIALS VALUE</Text>
                      <Text className="text-brand-orange font-extrabold text-2xl">LKR 4.2M</Text>
                    </View>
                  </View>
                  <View className="w-1/2 px-2">
                    <View className="bg-[#111827]/80 p-4 md:p-5 rounded-2xl border border-gray-700 hover:border-brand-orange/50 transition-colors">
                      <Text className="text-gray-400 text-xs tracking-widest font-semibold mb-2">PENDING PAYROLL</Text>
                      <Text className="text-white font-extrabold text-3xl">3</Text>
                    </View>
                  </View>
                </View>
                
                {/* Progress Section */}
                <View className="bg-[#111827]/80 p-5 md:p-6 rounded-2xl border border-gray-700">
                  <Text className="text-gray-400 text-xs tracking-widest font-semibold mb-5">PROJECT PROGRESS</Text>
                  
                  <View className="mb-5">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-gray-300 text-sm">Colombo Tower Complex</Text>
                      <Text className="text-gray-400 text-sm">72%</Text>
                    </View>
                    <View className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                      <View className="bg-brand-orange h-full w-[72%]" />
                    </View>
                  </View>

                  <View className="mb-5">
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-gray-300 text-sm">Kandy Bridge Restoration</Text>
                      <Text className="text-gray-400 text-sm">45%</Text>
                    </View>
                    <View className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                      <View className="bg-orange-300 h-full w-[45%]" />
                    </View>
                  </View>

                  <View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-gray-300 text-sm">Galle Road Widening</Text>
                      <Text className="text-gray-400 text-sm">88%</Text>
                    </View>
                    <View className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
                      <View className="bg-orange-500 h-full w-[88%]" />
                    </View>
                  </View>
                </View>
                
              </View>
            </View>
          </View>
        </View>


        {/* --- SERVICES SECTION --- */}
        <View className="py-24 px-8 bg-brand-light" id="services">
          <View className="max-w-6xl mx-auto">
            <View className="items-center mb-16">
              <Text className="text-brand-text font-extrabold text-4xl text-center">Comprehensive Project Control</Text>
              <View className="w-16 h-1 bg-brand-orange mt-4 rounded-full" />
            </View>
            
            <View className="flex-row flex-wrap -mx-4 justify-center">
              
              <View className="w-full md:w-1/3 px-4 mb-8">
                <View className="bg-gray-50 p-8 rounded-2xl items-center text-center border border-gray-100 hover:shadow-md transition-shadow">
                  <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
                    <Ionicons name="people" size={28} color="#F97316" />
                  </View>
                  <Text className="text-brand-text font-bold text-xl mb-3">Role-Based Access</Text>
                  <Text className="text-gray-500 text-center leading-relaxed">
                    Secure your data with distinct Admin, Manager, and Client roles. Ensure everyone sees only what they need to see.
                  </Text>
                </View>
              </View>
              
              <View className="w-full md:w-1/3 px-4 mb-8">
                <View className="bg-gray-50 p-8 rounded-2xl items-center text-center border border-gray-100 hover:shadow-md transition-shadow">
                  <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
                    <FontAwesome5 name="layer-group" size={28} color="#F97316" />
                  </View>
                  <Text className="text-brand-text font-bold text-xl mb-3">Live Inventory</Text>
                  <Text className="text-gray-500 text-center leading-relaxed">
                    Track raw materials across all your active projects in real-time. Get instant alerts when stock is running low.
                  </Text>
                </View>
              </View>

              <View className="w-full md:w-1/3 px-4 mb-8">
                <View className="bg-gray-50 p-8 rounded-2xl items-center text-center border border-gray-100 hover:shadow-md transition-shadow">
                  <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
                    <Ionicons name="hammer" size={28} color="#F97316" />
                  </View>
                  <Text className="text-brand-text font-bold text-xl mb-3">Labour Tracking</Text>
                  <Text className="text-gray-500 text-center leading-relaxed">
                    Monitor worker attendance, calculate logged hours, and oversee workforce distribution instantly from your phone.
                  </Text>
                </View>
              </View>

              <View className="w-full md:w-1/3 px-4 mb-8">
                <View className="bg-gray-50 p-8 rounded-2xl items-center text-center border border-gray-100 hover:shadow-md transition-shadow">
                  <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
                    <Ionicons name="pie-chart" size={28} color="#F97316" />
                  </View>
                  <Text className="text-brand-text font-bold text-xl mb-3">Automated Estimations</Text>
                  <Text className="text-gray-500 text-center leading-relaxed">
                    Generate accurate cost estimations for new contracts based on historical data and real-time material pricing.
                  </Text>
                </View>
              </View>

              <View className="w-full md:w-1/3 px-4 mb-8">
                <View className="bg-gray-50 p-8 rounded-2xl items-center text-center border border-gray-100 hover:shadow-md transition-shadow">
                  <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
                    <Entypo name="globe" size={28} color="#F97316" />
                  </View>
                  <Text className="text-brand-text font-bold text-xl mb-3">Client Portal</Text>
                  <Text className="text-gray-500 text-center leading-relaxed">
                    Provide a transparent view for stakeholders to see project milestones, budget consumption, and daily reports.
                  </Text>
                </View>
              </View>

              <View className="w-full md:w-1/3 px-4 mb-8">
                <View className="bg-gray-50 p-8 rounded-2xl items-center text-center border border-gray-100 hover:shadow-md transition-shadow">
                  <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-6">
                    <Ionicons name="notifications" size={28} color="#F97316" />
                  </View>
                  <Text className="text-brand-text font-bold text-xl mb-3">Push Notifications</Text>
                  <Text className="text-gray-500 text-center leading-relaxed">
                    Stay updated on delayed shipments, absent workers, or pending invoice approvals immediately on your device.
                  </Text>
                </View>
              </View>

            </View>
          </View>
        </View>

        {/* --- ABOUT SECTION --- */}
        <View className="py-24 px-8 bg-white" id="about">
          <View className="max-w-6xl mx-auto flex-row flex-wrap items-center">
            <View className="w-full md:w-1/2 pr-0 md:pr-12 mb-12 md:mb-0">
               <View className="bg-gray-300 rounded-3xl w-full h-96 items-center justify-center overflow-hidden relative shadow-lg">
                  <Image 
                    source={{ uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=800' }} 
                    className="w-full h-full absolute"
                    resizeMode="cover"
                  />
               </View>
            </View>
            <View className="w-full md:w-1/2">
              <Text className="text-brand-orange font-bold text-xl mb-2">Modernizing Construction</Text>
              <Text className="text-brand-text font-extrabold text-4xl leading-tight mb-6">
                Built for builders, designed for efficiency.
              </Text>
              <Text className="text-gray-600 text-lg leading-relaxed mb-4">
                ConstructAi was developed to bridge the gap between the chaotic reality of a construction site and the precise tracking required in the back office. No more lost spreadsheets, delayed communication, or mismanaged inventory.
              </Text>
              <Text className="text-gray-600 text-lg leading-relaxed mb-8">
                Powered by a robust FastAPI backend and real-time database syncing, we give project managers the confidence they need to deliver on time and under budget. 
              </Text>
              <Pressable onPress={handleCTA} className="bg-brand-dark px-8 py-4 rounded-full self-start hover:opacity-90 transition-opacity">
                <Text className="text-white font-bold">Join the Platform</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* --- PROJECT INFORMATIONS / GALLERY SECTION --- */}
        <View className="py-24 px-8 bg-brand-light" id="gallery">
          <View className="max-w-6xl mx-auto">
            <View className="items-center mb-16">
              <Text className="text-brand-text font-extrabold text-4xl text-center">Featured Deployments</Text>
              <View className="w-16 h-1 bg-brand-orange mt-4 rounded-full" />
              <Text className="text-gray-500 mt-6 text-center max-w-2xl text-lg">
                Explore real-world projects that are currently being actively tracked and managed using the ConstructAi ecosystem.
              </Text>
            </View>

            <View className="flex-row flex-wrap justify-center -mx-4 items-stretch">
              <View className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                <View className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group mx-auto w-full max-w-[320px] h-full flex-col">
                  <View className="overflow-hidden">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?q=80&w=600' }} className="w-full h-72 group-hover:scale-110 transition-transform duration-700" />
                  </View>
                  <View className="p-8 bg-white flex-1">
                    <Text className="text-brand-orange font-semibold text-sm mb-2">Commercial Skyscraper</Text>
                    <Text className="text-brand-text font-extrabold text-2xl group-hover:text-brand-orange transition-colors duration-300">Marina Tower</Text>
                  </View>
                </View>
              </View>

              <View className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                <View className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group mx-auto w-full max-w-[320px] h-full flex-col">
                  <View className="overflow-hidden">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1517581177682-a085bb7ffb15?q=80&w=600' }} className="w-full h-72 group-hover:scale-110 transition-transform duration-700" />
                  </View>
                  <View className="p-8 bg-white flex-1">
                    <Text className="text-brand-orange font-semibold text-sm mb-2">Retail Complex</Text>
                    <Text className="text-brand-text font-extrabold text-2xl group-hover:text-brand-orange transition-colors duration-300">City Mall Phase 2</Text>
                  </View>
                </View>
              </View>

              <View className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                <View className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group mx-auto w-full max-w-[320px] h-full flex-col">
                  <View className="overflow-hidden">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=600' }} className="w-full h-72 group-hover:scale-110 transition-transform duration-700" />
                  </View>
                  <View className="p-8 bg-white flex-1">
                    <Text className="text-brand-orange font-semibold text-sm mb-2">Residential Development</Text>
                    <Text className="text-brand-text font-extrabold text-2xl group-hover:text-brand-orange transition-colors duration-300">Green Villas</Text>
                  </View>
                </View>
              </View>

              <View className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                <View className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group mx-auto w-full max-w-[320px] h-full flex-col">
                  <View className="overflow-hidden">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?q=80&w=600' }} className="w-full h-72 group-hover:scale-110 transition-transform duration-700" />
                  </View>
                  <View className="p-8 bg-white flex-1">
                    <Text className="text-brand-orange font-semibold text-sm mb-2">Government Infrastructure</Text>
                    <Text className="text-brand-text font-extrabold text-2xl group-hover:text-brand-orange transition-colors duration-300">Highway Expansion</Text>
                  </View>
                </View>
              </View>

              <View className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                <View className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group mx-auto w-full max-w-[320px] h-full flex-col">
                  <View className="overflow-hidden">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=600' }} className="w-full h-72 group-hover:scale-110 transition-transform duration-700" />
                  </View>
                  <View className="p-8 bg-white flex-1">
                    <Text className="text-brand-orange font-semibold text-sm mb-2">Industrial Plant</Text>
                    <Text className="text-brand-text font-extrabold text-2xl group-hover:text-brand-orange transition-colors duration-300">Northern Power Station</Text>
                  </View>
                </View>
              </View>

              <View className="w-full sm:w-1/2 md:w-1/3 px-4 mb-8">
                <View className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group mx-auto w-full max-w-[320px] h-full flex-col">
                  <View className="overflow-hidden">
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1551882547-ff40c0d129df?q=80&w=600' }} className="w-full h-72 group-hover:scale-110 transition-transform duration-700" />
                  </View>
                  <View className="p-8 bg-white flex-1">
                    <Text className="text-brand-orange font-semibold text-sm mb-2">Luxury Hotel</Text>
                    <Text className="text-brand-text font-extrabold text-2xl group-hover:text-brand-orange transition-colors duration-300">Azure Coastal Resort</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* --- COUNTERS SECTION --- */}
        <View 
          className="px-4 py-12 bg-white"
          onLayout={(e) => setCountersY(e.nativeEvent.layout.y)}
        >
          <View className="relative overflow-hidden shadow-2xl" style={{ borderTopLeftRadius: 100, borderBottomRightRadius: 100, borderTopRightRadius: 16, borderBottomLeftRadius: 16 }}>
            {/* Background Image */}
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1541888086925-ebbc14b62db4?q=80&w=1200' }} 
              className="absolute w-full h-full"
              resizeMode="cover"
            />
            {/* Dark Overlay */}
            <View className="absolute w-full h-full bg-[#111827]/80" />
            
            <View className="py-20 px-8">
              <View className="items-center mb-16">
                <Text className="text-white font-extrabold text-4xl md:text-5xl text-center leading-tight">
                  Our Achievements{'\n'}in Numbers
                </Text>
              </View>

              <View className="max-w-6xl mx-auto flex-row flex-wrap justify-center items-center text-center">
                <View className="w-1/2 md:w-1/4 mb-12 md:mb-0 items-center px-4 md:px-12">
                  <View className="mb-4">
                    <Ionicons name="happy-outline" size={48} color="white" />
                  </View>
                  <AnimatedCounter value={12490} triggered={countersTriggered} />
                  <Text className="text-gray-300 font-medium text-sm tracking-widest uppercase">Active Users</Text>
                </View>

                <View className="w-1/2 md:w-1/4 mb-12 md:mb-0 items-center px-4 md:px-12">
                  <View className="mb-4">
                    <Ionicons name="checkmark-circle-outline" size={48} color="white" />
                  </View>
                  <AnimatedCounter value={5230} triggered={countersTriggered} />
                  <Text className="text-gray-300 font-medium text-sm tracking-widest uppercase">Projects Managed</Text>
                </View>

                <View className="w-1/2 md:w-1/4 mb-12 md:mb-0 items-center px-4 md:px-12">
                  <View className="mb-4">
                    <Ionicons name="people-outline" size={48} color="white" />
                  </View>
                  <AnimatedCounter value={1} suffix="M+" triggered={countersTriggered} />
                  <Text className="text-gray-300 font-medium text-sm tracking-widest uppercase">Materials Tracked</Text>
                </View>

                <View className="w-1/2 md:w-1/4 items-center px-4 md:px-12">
                  <View className="mb-4">
                    <Ionicons name="trophy-outline" size={48} color="white" />
                  </View>
                  <AnimatedCounter value={99.9} suffix="%" isDecimal triggered={countersTriggered} />
                  <Text className="text-gray-300 font-medium text-sm tracking-widest uppercase">Uptime</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* --- CONTACT SECTION --- */}
        <View className="py-24 px-8 bg-white" id="contact">
          <View className="max-w-6xl mx-auto">
            <View className="items-center mb-16">
              <Text className="text-brand-text font-extrabold text-4xl text-center">Get In Touch</Text>
              <View className="w-16 h-1 bg-brand-orange mt-4 rounded-full" />
            </View>
            
            <View className="flex-row flex-wrap -mx-4">
              {/* Form */}
              <View className="w-full md:w-1/2 px-4 mb-12 md:mb-0">
                 <View className="bg-gray-50 p-8 rounded-2xl border border-gray-100 shadow-sm">
                    <TextInput className="w-full bg-white border border-gray-200 rounded-lg p-4 mb-4 text-brand-text" placeholder="Your Name" />
                    <TextInput className="w-full bg-white border border-gray-200 rounded-lg p-4 mb-4 text-brand-text" placeholder="Email Address" keyboardType="email-address" />
                    <TextInput className="w-full bg-white border border-gray-200 rounded-lg p-4 mb-4 text-brand-text" placeholder="Subject" />
                    <TextInput className="w-full bg-white border border-gray-200 rounded-lg p-4 mb-4 text-brand-text h-32" placeholder="Message" multiline textAlignVertical="top" />
                    <Pressable className="bg-brand-orange w-full py-4 rounded-lg items-center mt-2 shadow-sm hover:bg-orange-600 transition-colors">
                      <Text className="text-white font-bold text-lg">Send Message</Text>
                    </Pressable>
                 </View>
              </View>

              {/* Info */}
              <View className="w-full md:w-1/2 px-4 justify-center">
                 <Text className="text-gray-500 text-lg leading-relaxed mb-8">
                   Have questions about our enterprise plans? Need help setting up your first project? Our dedicated support team is available 24/7 to assist you.
                 </Text>
                 
                 <View className="flex-row items-center mb-6">
                   <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4">
                     <Ionicons name="call" size={20} color="#F97316" />
                   </View>
                   <View>
                     <Text className="text-brand-text font-bold">Phone</Text>
                     <Text className="text-gray-500">+1 (800) 123-4567</Text>
                   </View>
                 </View>

                 <View className="flex-row items-center mb-6">
                   <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4">
                     <Ionicons name="mail" size={20} color="#F97316" />
                   </View>
                   <View>
                     <Text className="text-brand-text font-bold">Email</Text>
                     <Text className="text-gray-500">support@constructai.com</Text>
                   </View>
                 </View>

                 <View className="flex-row items-center">
                   <View className="w-12 h-12 bg-orange-50 rounded-full items-center justify-center mr-4">
                     <Ionicons name="location" size={20} color="#F97316" />
                   </View>
                   <View>
                     <Text className="text-brand-text font-bold">Office</Text>
                     <Text className="text-gray-500">One World Trade Center, New York</Text>
                   </View>
                 </View>
              </View>
            </View>
          </View>
        </View>

        {/* --- FOOTER --- */}
        <View className="bg-transparent mt-12">
          <View className="bg-brand-dark pt-24 pb-12 px-8 shadow-2xl" style={{ borderTopLeftRadius: 100 }}>
            <View className="max-w-6xl mx-auto flex-row flex-wrap justify-between border-b border-gray-700 pb-12 mb-8">
              <View className="w-full md:w-1/3 mb-10 md:mb-0 pr-8">
                <View className="flex-row items-center mb-6">
                  <MaterialIcons name="precision-manufacturing" size={32} color="#F97316" />
                  <Text className="text-white font-extrabold text-3xl tracking-tight ml-3">Construct<Text style={{ color: '#F97316' }}>Ai</Text></Text>
                </View>
                <Text className="text-gray-400 leading-relaxed text-lg">
                  Lorem ipsum dolor sit consetetur sadipscing elitr, sed diamnonumy eirmod tempor inidunt ut labore et dolore. Lorem ipsum dolor sit consetetur sadipscing elitr, sed diamnonumy eirmod tempor inidunt ut labore et dolore.
                </Text>
              </View>
              
              <View className="w-full md:w-1/5 mb-8 md:mb-0">
                <Text className="text-white font-bold text-xl mb-6">Company</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Home</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">About</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Service</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Gallery</Text>
                <Text className="text-gray-400 hover:text-white cursor-pointer transition-colors text-lg">Blog</Text>
              </View>

              <View className="w-full md:w-1/5 mb-8 md:mb-0">
                <Text className="text-white font-bold text-xl mb-6">Support</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Terms & Condition</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Privacy</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Policy</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Legal</Text>
              </View>

              <View className="w-full md:w-1/5">
                <Text className="text-white font-bold text-xl mb-6">Socials</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Facebook</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Twitter</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">Instagram</Text>
                <Text className="text-gray-400 mb-4 hover:text-white cursor-pointer transition-colors text-lg">LinkedIn</Text>
                <Text className="text-gray-400 hover:text-white cursor-pointer transition-colors text-lg">Pinterest</Text>
              </View>
            </View>
            
            <View className="max-w-6xl mx-auto items-center">
               <Text className="text-gray-500">Designed and Developed by <Text className="text-blue-400 font-medium cursor-pointer hover:text-blue-300">ConstructAi Team</Text></Text>
            </View>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}
