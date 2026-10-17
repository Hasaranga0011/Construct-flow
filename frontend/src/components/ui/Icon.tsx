import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Building2,
  Building,
  Box,
  Boxes,
  PackageOpen,
  HardHat,
  Banknote,
  Wallet,
  Users,
  UserCheck,
  Bot,
  Truck,
  Calculator,
  Bell,
  User,
  Settings,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  TrendingUp,
  ChartBar,
  ChartLine,
  Download,
  MessageSquare,
  FileText,
  LayoutDashboard,
  Hourglass,
  Clock,
  Layers,
  Globe,
  Grid,
  Search,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  X,
  Check,
  Plus,
  Trash2,
  LucideProps,
} from 'lucide-react-native';

export type IconName = string;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: any;
  className?: string;
  [key: string]: any;
}

// Map common names and legacy names from FontAwesome5, MaterialIcons, MaterialCommunityIcons to Lucide SVG components
const LUCIDE_ICON_MAP: Record<string, React.FC<LucideProps>> = {
  // Navigation & Buildings
  'building': Building,
  'business': Building2,
  'dashboard': LayoutDashboard,
  'grid': Grid,

  // Materials & Boxes
  'box': Box,
  'boxes': Boxes,
  'box-open': PackageOpen,
  'cube': Box,

  // Labour & Users
  'hard-hat': HardHat,
  'construct': HardHat,
  'user': User,
  'person': User,
  'users': Users,
  'user-friends': Users,
  'users-cog': UserCheck,

  // Logistics & Vehicles
  'truck': Truck,
  'truck-loading': Truck,
  'truck-delivery': Truck,
  'truck-check': Truck,

  // Finance & Estimation
  'calculator': Calculator,
  'money-check-alt': Banknote,
  'wallet': Wallet,

  // Stats & AI & Charts
  'robot': Bot,
  'chart-line': ChartLine,
  'trending-up': TrendingUp,
  'line-graph': ChartLine,
  'line-chart': ChartLine,
  'chart-bar': ChartBar,
  'bar-chart': ChartBar,
  'analytics': ChartLine,
  'insights': ChartLine,
  'reports': ChartBar,

  // Alerts & Status
  'check-circle': CheckCircle2,
  'exclamation-triangle': AlertTriangle,
  'hourglass-half': Hourglass,
  'time': Clock,

  // Files & Actions
  'folder-open': FolderOpen,
  'download': Download,
  'comment-alt': MessageSquare,
  'file-document-outline': FileText,
  'document': FileText,
  'file-alt': FileText,
  'file-invoice-dollar': Banknote,

  // General
  'layer-group': Layers,
  'globe': Globe,
  'notifications': Bell,
  'bell': Bell,
  'search': Search,
  'close': X,
  'check': Check,
  'add': Plus,
  'trash': Trash2,
};

/**
 * Unified Icon component that uses:
 * 1. lucide-react-native SVG icons by default (0 font file overhead)
 * 2. Ionicons (the single permitted @expo/vector-icons family) for icons not in Lucide map
 */
export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  color = '#4B5563',
  style,
  className,
  ...rest
}) => {
  const normalizedName = (name || '').toLowerCase().trim();
  const LucideComponent = LUCIDE_ICON_MAP[normalizedName];

  if (LucideComponent) {
    return (
      <LucideComponent
        size={size}
        color={color}
        style={style}
        className={className}
        {...rest}
      />
    );
  }

  // Fallback to Ionicons (the single vector icon family retained)
  return (
    <Ionicons
      name={name as any}
      size={size}
      color={color}
      style={style}
      className={className}
      {...rest}
    />
  );
};

export default Icon;
