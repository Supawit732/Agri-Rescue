import { ActivityIndicator, View } from 'react-native';
import { C } from '../src/theme';

// Routing is handled by AuthGate in _layout; this is just the initial placeholder.
export default function Index(): React.ReactElement {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator size="large" color={C.leaf} />
    </View>
  );
}
