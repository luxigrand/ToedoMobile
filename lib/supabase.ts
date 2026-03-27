import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const isNative = Platform.OS !== 'web';
const nativeStorage = isNative
  ? require('@react-native-async-storage/async-storage').default
  : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    ...(nativeStorage ? { storage: nativeStorage } : {}),
    autoRefreshToken: isNative,
    persistSession: isNative,
    detectSessionInUrl: false,
  },
});
