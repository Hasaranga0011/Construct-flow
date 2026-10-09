import React from 'react';
import { View, Text } from 'react-native';
import { useResponsive } from '../../hooks/useResponsive';

type OrderItemRowProps = {
  itemName: string;
  quantity: string | number;
  unitPrice: number | null;
  totalPrice: number | null;
  status: string;
  priceNode?: React.ReactNode;
};

export const OrderItemRow = ({ itemName, quantity, unitPrice, totalPrice, status, priceNode }: OrderItemRowProps) => {
  const { isMobile } = useResponsive();

  const isUnpriced = (!unitPrice || unitPrice === 0) && (!totalPrice || totalPrice === 0) && (status === 'Pending' || status === 'Suggested');

  if (isMobile) {
    return (
      <>
        <View className="py-3 border-b border-gray-200 mb-2 flex-col">
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium w-full mb-2">
            {itemName}
          </Text>
          <View className="flex-row justify-between items-center w-full">
            <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500">Qty: {quantity}</Text>
            {priceNode ? priceNode : isUnpriced ? (
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm">Awaiting supplier price</Text>
            ) : (
              <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-bold">Rs. {(unitPrice || 0).toLocaleString()}</Text>
            )}
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <View className="flex-row gap-3 justify-between items-center py-3 border-b border-gray-200 mb-2">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-medium flex-1 min-w-0">{itemName}</Text>
        <Text style={{ flexShrink: 0, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 w-24 text-right">Qty: {quantity}</Text>
        {priceNode ? priceNode : isUnpriced ? (
          <Text style={{ flexShrink: 0, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic w-40 text-right text-sm">Awaiting supplier price</Text>
        ) : (
          <Text style={{ flexShrink: 0, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-800 font-bold w-32 text-right">Rs. {(unitPrice || 0).toLocaleString()}</Text>
        )}
      </View>
      
      <View className="flex-row justify-between items-center pt-2">
        <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-500 font-bold">Total</Text>
        {isUnpriced ? (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-gray-400 italic text-sm">Awaiting supplier price</Text>
        ) : (
          <Text style={{ flexShrink: 1, minWidth: 0 }} maxFontSizeMultiplier={1.3} className="text-brand-orange font-bold text-lg">Rs. {(totalPrice || 0).toLocaleString()}</Text>
        )}
      </View>
    </>
  );
};
