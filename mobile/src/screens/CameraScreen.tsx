import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {launchCamera, ImagePickerResponse} from 'react-native-image-picker';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {analyzeSkin} from '../api/client';

type RootStackParamList = {
  Camera: undefined;
  Results: {metrics: Record<string, unknown>; imageBase64: string};
};

type CameraScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Camera'>;
};

export default function CameraScreen({navigation}: CameraScreenProps) {
  const [imageAsset, setImageAsset] = useState<{uri: string; type?: string; fileName?: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTakePhoto = () => {
    launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'front',
        quality: 0.9,
      },
      (response: ImagePickerResponse) => {
        if (response.didCancel) return;
        if (response.errorCode) {
          Alert.alert('Error', response.errorMessage || 'Camera error');
          return;
        }
        const asset = response.assets?.[0];
        if (asset?.uri) setImageAsset({uri: asset.uri, type: asset.type, fileName: asset.fileName});
      },
    );
  };

  const handleAnalyze = async () => {
    if (!imageAsset) return;
    setLoading(true);
    try {
      const result = await analyzeSkin(imageAsset);
      navigation.navigate('Results', {
        metrics: result.metrics,
        imageBase64: result.image_base64,
      });
    } catch (err) {
      Alert.alert(
        'Analysis Failed',
        err instanceof Error ? err.message : 'Could not connect to server. Ensure backend is running and API_BASE_URL in src/config.ts matches your computer IP.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Skin Analysis</Text>
      <Text style={styles.subtitle}>Take a selfie for analysis</Text>

      {imageAsset ? (
        <View style={styles.previewContainer}>
          <Image source={{uri: imageAsset.uri}} style={styles.preview} resizeMode="contain" />
          <TouchableOpacity
            style={[styles.button, styles.analyzeButton]}
            onPress={handleAnalyze}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Analyze</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.retakeButton]}
            onPress={() => setImageAsset(null)}
            disabled={loading}>
            <Text style={styles.buttonText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.button} onPress={handleTakePhoto}>
          <Text style={styles.buttonText}>Take Photo</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a0a0a0',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#4a90d9',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  previewContainer: {
    width: '100%',
    alignItems: 'center',
  },
  preview: {
    width: 300,
    height: 400,
    borderRadius: 12,
    marginBottom: 24,
  },
  analyzeButton: {
    marginBottom: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: '#555',
    minWidth: 200,
    alignItems: 'center',
  },
});
