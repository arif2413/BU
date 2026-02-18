import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import CameraScreen from './src/screens/CameraScreen';
import ResultsScreen from './src/screens/ResultsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Camera"
        screenOptions={{
          headerStyle: {backgroundColor: '#1a1a2e'},
          headerTintColor: '#fff',
          headerTitleStyle: {fontWeight: '600'},
        }}>
        <Stack.Screen name="Camera" component={CameraScreen} options={{title: 'Skin Analysis'}} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{title: 'Results'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
