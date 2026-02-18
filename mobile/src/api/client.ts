import {API_BASE_URL} from '../config';

export interface AnalyzeResponse {
  metrics: Record<string, unknown>;
  image_base64: string;
}

export interface ImageAsset {
  uri: string;
  type?: string;
  fileName?: string;
}

export async function analyzeSkin(asset: ImageAsset): Promise<AnalyzeResponse> {
  const {uri, type = 'image/jpeg', fileName = 'image.jpg'} = asset;
  const formData = new FormData();
  formData.append('image', {
    uri,
    type: type || 'image/jpeg',
    name: fileName || 'image.jpg',
  } as unknown as Blob);

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    body: formData,
    // Do not set Content-Type - fetch sets it with boundary for FormData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }

  return response.json();
}
