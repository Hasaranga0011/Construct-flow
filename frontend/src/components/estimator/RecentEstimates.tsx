import { getApiUrl } from '../../lib/apiUrl';
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, Platform, Alert, useWindowDimensions } from 'react-native';
import { supabase } from '../../lib/supabase';
import { sendSystemNotification } from '../../utils/notifications';
import { StatusBadge } from '../common/StatusBadge';

const EstimateRow = ({ 
  id,
  projectName, 
  date, 
  cost, 
  status,
  onApprove,
  onReject
}: { 
  id: string,
  projectName: string, 
  date: string, 
  cost: string, 
  status: 'Approved' | 'Draft' | 'Pending' | 'Rejected',
  onApprove: (id: string) => void,
  onReject: (id: string) => void
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 1024;

  let title = projectName;
  let inputs: any = null;
  try {
    const parsed = JSON.parse(projectName);
    if (parsed.title) {
      title = parsed.title;
      inputs = parsed.inputs;
    }
  } catch (e) {
    // legacy format, keep as is
  }

  const subline = inputs ? `${inputs.type || 'Building'} · ${inputs.sq_ft || 0} sq ft` : '';

  if (isMobile) {
    return (
      <View className="bg-white rounded-xl p-4 mb-3 border border-gray-100 shadow-sm">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-base mb-2">{title}</Text>
        <View className="flex-row justify-between items-center mb-2">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-sm">{date}</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm" numberOfLines={1}>{cost}</Text>
        </View>
        <View className="mb-3">
          <StatusBadge status={status} />
        </View>
        
        {subline ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 text-xs mb-3">{subline}</Text>
        ) : null}

        <View className="flex-row gap-2 mt-2" style={{ flexWrap: width < 400 ? 'wrap' : 'nowrap' }}>
          <Pressable 
            style={{ minHeight: 44, flex: 1, minWidth: width < 400 ? '100%' : 'auto' }} 
            onPress={async () => {
              try {
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData?.session?.access_token;
                if (!token) {
                  Platform.OS === 'web' ? window.alert('Please log in to view PDF') : Alert.alert('Estimate PDF', 'Please log in to view PDF');
                  return;
                }
                const response = await fetch(`${getApiUrl()}/documents/estimation/${id}/pdf`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) {
                  Platform.OS === 'web' ? window.alert('Failed to generate PDF') : Alert.alert('Estimate PDF', 'Failed to generate PDF');
                  return;
                }
                if (Platform.OS === 'web') {
                  const url = URL.createObjectURL(await response.blob());
                  const link = document.createElement('a');
                  link.href = url; link.download = `Estimate_${id.substring(0, 8)}.pdf`;
                  document.body.appendChild(link); link.click(); link.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                } else {
                  const { File, Paths } = await import('expo-file-system');
                  const Sharing = await import('expo-sharing');
                  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable.');
                  const file = new File(Paths.cache, `Estimate_${id.substring(0, 8)}.pdf`);
                  file.write(new Uint8Array(await response.arrayBuffer()));
                  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
                }
              } catch (err) {
                console.error(err);
                Platform.OS === 'web' ? window.alert('An error occurred while generating the PDF.') : Alert.alert('Estimate PDF', 'An error occurred while generating the PDF.');
              }
            }} 
            className="bg-gray-100 items-center justify-center rounded-lg px-4 py-2"
          >
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-sm">View PDF</Text>
          </Pressable>
          
          {status === 'Pending' && (
            <>
              <Pressable 
                style={{ minHeight: 44, flex: 1, minWidth: width < 400 ? '100%' : 'auto' }} 
                onPress={() => onApprove(id)} 
                className="bg-brand-success items-center justify-center rounded-lg px-4 py-2"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white font-bold text-sm">Approve</Text>
              </Pressable>
              <Pressable 
                style={{ minHeight: 44, flex: 1, minWidth: width < 400 ? '100%' : 'auto' }} 
                onPress={() => onReject(id)} 
                className="border border-red-500 bg-white items-center justify-center rounded-lg px-4 py-2"
              >
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 font-bold text-sm">Reject</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-col py-4 border-b border-gray-50">
      <View className="flex-row items-center w-full">
        <View className="flex-1 min-w-0 pr-2">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm">{title}</Text>
        </View>
        <View className="w-24 px-2">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 text-xs">{date}</Text>
        </View>
        <View className="w-28 px-2" style={{ flexShrink: 0 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-text font-bold text-sm" numberOfLines={1}>{cost}</Text>
        </View>
        <View className="w-28 px-2" style={{ flexShrink: 0 }}>
          <StatusBadge status={status} />
        </View>
        <View className="w-48 items-center flex-row justify-end gap-2">
          {status === 'Pending' && (
            <>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => onApprove(id)} className="bg-brand-success px-3 py-2 rounded justify-center">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-white text-xs font-bold">Approve</Text>
              </Pressable>
              <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={() => onReject(id)} className="border border-red-500 px-3 py-2 rounded justify-center bg-white">
                <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-red-500 text-xs font-bold">Reject</Text>
              </Pressable>
            </>
          )}
          <Pressable style={{ minHeight: 44, minWidth: 44 }} onPress={async () => {
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData?.session?.access_token;
              if (!token) {
                Platform.OS === 'web' ? window.alert('Please log in to view PDF') : Alert.alert('Estimate PDF', 'Please log in to view PDF');
                return;
              }
              const response = await fetch(`${getApiUrl()}/documents/estimation/${id}/pdf`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (!response.ok) {
                Platform.OS === 'web' ? window.alert('Failed to generate PDF') : Alert.alert('Estimate PDF', 'Failed to generate PDF');
                return;
              }
              if (Platform.OS === 'web') {
                const url = URL.createObjectURL(await response.blob());
                const link = document.createElement('a');
                link.href = url; link.download = `Estimate_${id.substring(0, 8)}.pdf`;
                document.body.appendChild(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              } else {
                const { File, Paths } = await import('expo-file-system');
                const Sharing = await import('expo-sharing');
                if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable.');
                const file = new File(Paths.cache, `Estimate_${id.substring(0, 8)}.pdf`);
                file.write(new Uint8Array(await response.arrayBuffer()));
                await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
              }
            } catch (err) {
              console.error(err);
              Platform.OS === 'web' ? window.alert('An error occurred while generating the PDF.') : Alert.alert('Estimate PDF', 'An error occurred while generating the PDF.');
            }
          }} className="justify-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-xs font-bold pl-2">View PDF</Text>
          </Pressable>
        </View>
      </View>
      {inputs && (
        <View className="flex-row mt-2 items-center">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-400 font-medium">Context: </Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-[10px] text-gray-500">
            {subline} • {inputs.floors} floors • {inputs.site} • {inputs.timeline} Schedule
          </Text>
        </View>
      )}
    </View>
  );
};

export const RecentEstimates = ({ refreshTrigger = 0 }: { refreshTrigger?: number }) => {
  const [estimations, setEstimations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadEstimates = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          if (isMounted) setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('estimations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;
        
        if (isMounted) setEstimations(data || []);
      } catch (error) {
        console.warn('Failed to load estimates:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadEstimates();
    
    return () => { isMounted = false; };
  }, [refreshTrigger]);

  const handleApprove = async (id: string) => {
    try {
      setLoading(true);
      
      const estToApprove = estimations.find(e => e.id === id);
      if (!estToApprove) return;

      const { error } = await supabase.from('estimations').update({ status: 'Approved' }).eq('id', id);
      if (error) throw error;
      
      setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Approved' } : e));
      
      let title = estToApprove.project_name;
      try { title = JSON.parse(estToApprove.project_name).title || title; } catch(e) {}
      
      const { data: projData, error: projError } = await supabase.from('projects').insert({
        name: title,
        total_budget: estToApprove.estimated_cost,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0]
      });
      if (projError) console.warn('Failed to seed project from estimation', projError);
      
      await sendSystemNotification(
        'Estimate Approved',
        `The estimate for ${title} was approved and a project baseline was created.`,
        'Admin'
      );
      
      if (Platform.OS === 'web') {
        window.alert('Estimate Approved successfully.');
      } else {
        Alert.alert('Success', 'Estimate Approved successfully.');
      }
    } catch (err: any) {
      console.warn('Failed to approve', err);
      if (Platform.OS === 'web') {
        window.alert(`Error: ${err.message || 'Failed to approve estimate.'}`);
      } else {
        Alert.alert('Error', err.message || 'Failed to approve estimate.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    const estToReject = estimations.find(e => e.id === id);
    if (!estToReject) return;
    
    let title = estToReject.project_name;
    try { title = JSON.parse(estToReject.project_name).title || title; } catch(e) {}

    const confirmReject = () => {
      setLoading(true);
      supabase.from('estimations').update({ status: 'Rejected' }).eq('id', id)
        .then(({ error }) => {
          if (error) throw error;
          setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Rejected' } : e));
          return sendSystemNotification(
            'Estimate Rejected',
            `The estimate for ${title} was rejected.`,
            'Admin'
          );
        })
        .then(() => {
          if (Platform.OS === 'web') {
            window.alert('Estimate Rejected successfully.');
          } else {
            Alert.alert('Success', 'Estimate Rejected successfully.');
          }
        })
        .catch(err => {
          console.warn('Failed to reject', err);
          if (Platform.OS === 'web') {
            window.alert(`Error: ${err.message || 'Failed to reject estimate.'}`);
          } else {
            Alert.alert('Error', err.message || 'Failed to reject estimate.');
          }
        })
        .finally(() => {
          setLoading(false);
        });
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to reject the estimate for ${title}?`)) {
        confirmReject();
      }
    } else {
      Alert.alert('Reject Estimate', `Are you sure you want to reject the estimate for ${title}?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: confirmReject }
      ]);
    }
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Rs. 0';
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  const { width } = useWindowDimensions();
  const isMobile = width < 1024;

  return (
    <View className={`bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 min-h-[300px] ${isMobile ? '' : 'ml-6'}`}>
      <View className="flex-row justify-between items-center mb-4">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-lg font-bold text-brand-text">Recent Estimates</Text>
        <Pressable style={{ minHeight: 44, minWidth: 44 }}>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange text-sm font-semibold">View all {'>'}</Text>
        </Pressable>
      </View>

      {!isMobile && (
        <View className="flex-row py-2 border-b border-gray-100 mb-2">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="flex-1 pr-2 text-xs font-semibold text-gray-400 uppercase">Project Name</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-24 px-2 text-xs font-semibold text-gray-400 uppercase">Date</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-28 px-2 text-xs font-semibold text-gray-400 uppercase" style={{ flexShrink: 0 }}>Estimated Cost</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-28 px-2 text-xs font-semibold text-gray-400 uppercase" style={{ flexShrink: 0 }}>Status</Text>
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="w-48 text-xs font-semibold text-gray-400 uppercase text-right"></Text>
        </View>
      )}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : estimations.length === 0 ? (
          <View className="py-10 items-center">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400">No estimations generated yet.</Text>
          </View>
        ) : (
          estimations.map((est) => (
            <EstimateRow 
              key={est.id}
              id={est.id}
              projectName={est.project_name || `Estimation #${est.id.toString().substring(0, 4)}`} 
              date={new Date(est.created_at).toLocaleDateString()} 
              cost={formatCurrency(est.estimated_cost)} 
              status={est.status || 'Pending'} 
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
};
