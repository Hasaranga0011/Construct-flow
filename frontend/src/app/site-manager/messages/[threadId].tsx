import StaffMessagesThread from '../../../components/chat/StaffMessagesThread';
import { useLocalSearchParams } from 'expo-router';
export default function SMThread() { const { threadId } = useLocalSearchParams<{threadId: string}>(); return <StaffMessagesThread threadId={threadId} />; }
