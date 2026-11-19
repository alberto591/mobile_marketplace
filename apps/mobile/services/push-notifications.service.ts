import { Platform } from 'react-native';

export type PushRegistrationStatus =
  | 'REGISTERED'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'FAILED';

export interface RegisterPushTokenRpcOptions {
  readonly baseUrl?: string;
  readonly anonKey?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Registers an Expo Push Token against an order using the guest order's `access_token`.
 */
export async function registerOrderPushTokenRpc(
  params: {
    readonly accessToken: string;
    readonly expoPushToken: string;
    readonly platform: 'ios' | 'android' | 'web';
  },
  options: RegisterPushTokenRpcOptions = {}
): Promise<boolean> {
  const baseUrl = (
    options.baseUrl ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    'http://127.0.0.1:54321'
  ).replace(/\/+$/, '');
  const anonKey =
    options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'mock-anon-key-local';
  const fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));

  const response = await fetchFn(`${baseUrl}/rest/v1/rpc/register_order_push_token`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      p_access_token: params.accessToken,
      p_expo_push_token: params.expoPushToken,
      p_platform: params.platform,
    }),
  });

  if (!response.ok) return false;
  const data = await response.json().catch(() => null);
  return Boolean(data?.ok);
}

/**
 * Requests push permission (if needed), obtains an Expo Push Token, and attaches it to
 * the given order so the buyer is notified when the CAT marks the order as shipped.
 *
 * Safely degrades to UNSUPPORTED_ENVIRONMENT on web or in Expo Go without an EAS projectId.
 */
export async function enableShipmentPushForOrder(
  accessToken: string,
  options: RegisterPushTokenRpcOptions = {}
): Promise<PushRegistrationStatus> {
  if (Platform.OS === 'web') {
    return 'UNSUPPORTED_ENVIRONMENT';
  }

  try {
    // Dynamic imports keep vitest / headless Node environments and Expo Go safe.
    const { default: Constants } = await import('expo-constants');
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    if (!projectId) {
      // Running in Expo Go without an EAS projectId: skip cleanly without throwing.
      return 'UNSUPPORTED_ENVIRONMENT';
    }

    const Notifications = await import('expo-notifications');

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('order-updates', {
        name: 'Actualizaciones de pedidos',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return 'PERMISSION_DENIED';
    }

    const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenRes?.data;
    if (!expoPushToken) {
      return 'FAILED';
    }

    const ok = await registerOrderPushTokenRpc(
      {
        accessToken,
        expoPushToken,
        platform: Platform.OS === 'android' ? 'android' : 'ios',
      },
      options
    );
    return ok ? 'REGISTERED' : 'FAILED';
  } catch {
    return 'FAILED';
  }
}
