import React from 'react';
import { SupplierOrdersList } from '../../../components/supplier/SupplierOrdersList';
import { PO_STATUS } from '../../../hooks/useSupplierOrders';

export default function SupplierDeliveries() {
  return <SupplierOrdersList title="My Deliveries" defaultStatus={PO_STATUS.CONFIRMED} />;
}
