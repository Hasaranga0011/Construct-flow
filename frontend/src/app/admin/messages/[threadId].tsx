import StaffMessagesThread from '../../../components/chat/StaffMessagesThread';
import { useLocalSearchParams } from 'expo-router';
export default function AdminThread() { const { threadId } = useLocalSearchParams<{threadId: string}>(); return <StaffMessagesThread threadId={threadId} />; }
