import { Redirect } from 'expo-router';

/** Compatibility: old /farmer → sell tab */
export default function FarmerRedirect(): React.ReactElement {
  return <Redirect href="/(tabs)/sell" />;
}
