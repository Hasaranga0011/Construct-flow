import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_MESSAGES = [
  { id: 1, sender: 'pm', text: 'Good morning! The foundation pour is complete. We are on schedule.', time: '09:00 AM', read: true },
  { id: 2, sender: 'client', text: 'Great news. Have the materials for the next phase arrived?', time: '09:15 AM', read: true },
  { id: 3, sender: 'pm', text: 'Yes, the steel rebar arrived this morning. Cement is expected tomorrow.', time: '09:20 AM', read: true },
  { id: 4, sender: 'client', text: 'Perfect. Let me know if there are any delays.', time: '10:00 AM', read: true },
  { id: 5, sender: 'pm', text: 'Will do. I have also uploaded the latest progress photos to the gallery.', time: '10:05 AM', read: false },
];

export const ClientChatThread = () => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState(MOCK_MESSAGES);

  const handleSend = () => {
    if (inputText.trim()) {
      setMessages([...messages, {
        id: Date.now(),
        sender: 'client',
        text: inputText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      }]);
      setInputText('');
    }
  };

  return (
    <View className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Chat Header */}
      <View className="flex-row items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
        <View className="relative">
          <View className="w-10 h-10 bg-brand-dark rounded-full items-center justify-center mr-4">
            <Text className="text-white font-bold">PM</Text>
          </View>
          <View className="absolute bottom-0 right-4 w-3 h-3 bg-brand-success rounded-full border-2 border-white" />
        </View>
        <View>
          <Text className="font-bold text-brand-text">John Doe (Project Manager)</Text>
          <Text className="text-brand-success text-xs font-semibold">Online</Text>
        </View>
      </View>

      {/* Messages Area */}
      <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
        <View className="items-center mb-6">
          <View className="bg-gray-100 px-3 py-1 rounded-full">
            <Text className="text-gray-500 text-xs">Today</Text>
          </View>
        </View>
        
        {messages.map((msg) => {
          const isClient = msg.sender === 'client';
          return (
            <View key={msg.id} className={`mb-4 flex-row ${isClient ? 'justify-end' : 'justify-start'}`}>
              {!isClient && (
                <View className="w-8 h-8 bg-brand-dark rounded-full items-center justify-center mr-2 mt-auto">
                  <Text className="text-white text-[10px] font-bold">PM</Text>
                </View>
              )}
              
              <View className={`max-w-[70%] rounded-2xl px-4 py-3 ${isClient ? 'bg-brand-orange rounded-br-sm' : 'bg-gray-100 rounded-bl-sm'}`}>
                <Text className={`text-sm leading-relaxed ${isClient ? 'text-white' : 'text-brand-text'}`}>
                  {msg.text}
                </Text>
                <View className="flex-row items-center justify-end mt-1">
                  <Text className={`text-[10px] mr-1 ${isClient ? 'text-orange-200' : 'text-gray-400'}`}>
                    {msg.time}
                  </Text>
                  {isClient && (
                    <Ionicons 
                      name={msg.read ? "checkmark-done" : "checkmark"} 
                      size={12} 
                      color={msg.read ? "#3B82F6" : "#fed7aa"} 
                    />
                  )}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input Area */}
      <View className="p-4 border-t border-gray-100 bg-white flex-row items-center">
        <Pressable className="w-10 h-10 items-center justify-center rounded-full bg-gray-50 mr-2">
          <Ionicons name="attach" size={24} color="#6B7280" />
        </Pressable>
        <TextInput 
          className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-3 text-brand-text outline-none"
          placeholder="Type a message..."
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
          style={{ outlineStyle: 'none' } as any}
        />
        {inputText.trim() ? (
          <Pressable onPress={handleSend} className="w-10 h-10 bg-brand-orange items-center justify-center rounded-full ml-2">
            <Ionicons name="send" size={18} color="white" />
          </Pressable>
        ) : (
          <Pressable className="w-10 h-10 items-center justify-center rounded-full bg-gray-50 ml-2">
            <Ionicons name="mic" size={22} color="#6B7280" />
          </Pressable>
        )}
      </View>
    </View>
  );
};
