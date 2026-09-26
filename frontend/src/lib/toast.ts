import { Alert } from 'react-native';

export const toast = {
  success: (msg: string) => Alert.alert('Success', msg),
  error: (msg: string) => Alert.alert('Error', msg)
};
