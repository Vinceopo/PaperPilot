import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme";
import UploadScreen from "../screens/UploadScreen";
import ManuscriptsScreen from "../screens/ManuscriptsScreen";
import ScanResultScreen from "../screens/ScanResultScreen";
import AccountScreen from "../screens/AccountScreen";
import SubscriptionScreen from "../screens/SubscriptionScreen";
import DocumentReferenceScreen from "../screens/DocumentReferenceScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        animation: "fade",
        sceneStyle: { backgroundColor: colors.pageBg },
      }}
    >
      <Tab.Screen name="Upload" component={UploadScreen} />
      <Tab.Screen
        name="Library"
        component={ManuscriptsScreen}
        options={{ title: "Library" }}
      />
      <Tab.Screen
        name="Results"
        component={ScanResultScreen}
        options={{ title: "Results" }}
      />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          headerBackTitle: "Back",
          contentStyle: { backgroundColor: colors.pageBg },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Subscription"
          component={SubscriptionScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="DocumentReference"
          component={DocumentReferenceScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
