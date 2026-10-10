import { useLocalSearchParams } from 'expo-router';
import StaffMessagesThread from '../../../components/chat/StaffMessagesThread';
export default function WorkerThread() {
  const { threadId } = useLocalSearchParams();
  return <StaffMessagesThread threadId={threadId as string} />;
}