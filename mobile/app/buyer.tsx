import { Redirect } from 'expo-router';

/** Compatibility: old /buyer → market tab */
export default function BuyerRedirect(): React.ReactElement {
  return <Redirect href="/(tabs)" />;
}
