import { Redirect } from 'expo-router';

export default function TeamRegisterRedirect() {
  return <Redirect href="/register?portal=team" />;
}
