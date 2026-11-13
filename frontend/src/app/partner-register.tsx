import { Redirect } from 'expo-router';

export default function PartnerRegisterRedirect() {
  return <Redirect href="/register?portal=partner" />;
}
