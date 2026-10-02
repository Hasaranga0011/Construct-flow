import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { supabase } from '../../lib/supabase';
import { sendSystemNotification } from '../../utils/notifications';

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
  let statusBadgeColor = '';
  let statusTextColor = '';

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

  switch (status) {
    case 'Approved':
      statusBadgeColor = 'bg-[#DCFCE7]';
      statusTextColor = 'text-brand-success';
      break;
    case 'Rejected':
      statusBadgeColor = 'bg-red-100';
      statusTextColor = 'text-red-700';
      break;
    case 'Draft':
      statusBadgeColor = 'bg-gray-100';
      statusTextColor = 'text-gray-600';
      break;
    case 'Pending':
      statusBadgeColor = 'bg-orange-100';
      statusTextColor = 'text-brand-orange';
      break;
  }

  return (
    <View className="flex-col py-4 border-b border-gray-50">
      <View className="flex-row items-center w-full">
        <View className="w-1/4">
          <Text className="text-brand-text font-bold text-sm">{title}</Text>
        </View>
        <View className="w-1/4">
          <Text className="text-gray-500 text-xs">{date}</Text>
        </View>
        <View className="w-1/5">
          <Text className="text-brand-text font-bold text-sm">{cost}</Text>
        </View>
        <View className="w-1/5">
          <View className={`px-2 py-1 rounded self-start ${statusBadgeColor}`}>
            <Text className={`text-[10px] font-bold uppercase ${statusTextColor}`}>{status}</Text>
          </View>
        </View>
        <View className="flex-1 items-end flex-row justify-end gap-2">
          {status === 'Pending' && (
            <>
              <Pressable onPress={() => onApprove(id)} className="bg-brand-success px-2 py-1 rounded">
                <Text className="text-white text-xs font-semibold">Approve</Text>
              </Pressable>
              <Pressable onPress={() => onReject(id)} className="bg-red-500 px-2 py-1 rounded">
                <Text className="text-white text-xs font-semibold">Reject</Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={async () => {
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData?.session?.access_token;
              if (!token) {
                alert('Please log in to view PDF');
                return;
              }
              const response = await fetch(`http://localhost:8000/api/documents/estimation/${id}/pdf`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              if (!response.ok) {
                alert('Failed to generate PDF');
                return;
              }
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Estimate_${id.substring(0, 8)}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              window.URL.revokeObjectURL(url);
            } catch (err) {
              console.error(err);
              alert('An error occurred while generating the PDF.');
            }
          }}>
            <Text className="text-brand-orange text-xs font-semibold pl-2">View PDF</Text>
          </Pressable>
        </View>
      </View>
      {inputs && (
        <View className="flex-row mt-2 items-center">
          <Text className="text-[10px] text-gray-400 font-medium">Context: </Text>
          <Text className="text-[10px] text-gray-500">
            {inputs.sq_ft} sq.ft • {inputs.floors} floors • {inputs.site} • {inputs.timeline} Schedule
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
      
      // Get the estimation
      const estToApprove = estimations.find(e => e.id === id);
      if (!estToApprove) return;

      const { error } = await supabase.from('estimations').update({ status: 'Approved' }).eq('id', id);
      if (error) throw error;
      
      // Update UI
      setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Approved' } : e));
      
      // Now automatically create a project budget record based on this estimation!
      let title = estToApprove.project_name;
      try {
        title = JSON.parse(estToApprove.project_name).title || title;
      } catch(e) {}
      
      const { data: projData, error: projError } = await supabase.from('projects').insert({
        name: title,
        total_budget: estToApprove.estimated_cost,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0]
      });
      if (projError) console.warn('Failed to seed project from estimation', projError);
      
      // Real-time Notification Dispatch
      await sendSystemNotification(
        'Estimate Approved',
        `The estimate for ${title} was approved and a project baseline was created.`,
        'Admin'
      );
      
    } catch (err) {
      console.warn('Failed to approve', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('estimations').update({ status: 'Rejected' }).eq('id', id);
      if (error) throw error;
      setEstimations(prev => prev.map(e => e.id === id ? { ...e, status: 'Rejected' } : e));
      
      const estToReject = estimations.find(e => e.id === id);
      if (estToReject) {
        let title = estToReject.project_name;
        try { title = JSON.parse(estToReject.project_name).title || title; } catch(e) {}
        await sendSystemNotification(
          'Estimate Rejected',
          `The estimate for ${title} was rejected.`,
          'Admin'
        );
      }
    } catch (err) {
      console.warn('Failed to reject', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return 'Rs. 0';
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(1)}K`;
    return `Rs. ${amount}`;
  };

  return (
    <View className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex-1 ml-6 min-h-[300px]">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-bold text-brand-text">Recent Estimates</Text>
        <Pressable>
          <Text className="text-brand-orange text-sm font-semibold">View all {'>'}</Text>
        </Pressable>
      </View>

      <View className="flex-row py-2 border-b border-gray-100 mb-2">
        <Text className="w-1/4 text-xs font-semibold text-gray-400 uppercase">Project Name</Text>
        <Text className="w-1/4 text-xs font-semibold text-gray-400 uppercase">Date</Text>
        <Text className="w-1/5 text-xs font-semibold text-gray-400 uppercase">Estimated Cost</Text>
        <Text className="w-1/5 text-xs font-semibold text-gray-400 uppercase">Status</Text>
        <Text className="flex-1 text-xs font-semibold text-gray-400 uppercase text-right"></Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <View className="py-10 items-center">
            <ActivityIndicator color="#F97316" />
          </View>
        ) : estimations.length === 0 ? (
          <View className="py-10 items-center">
            <Text className="text-gray-400">No estimations generated yet.</Text>
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
