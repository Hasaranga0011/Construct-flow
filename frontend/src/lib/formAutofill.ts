import { Platform } from 'react-native';

/**
 * Autofill props for registration / user-creation forms. Each field gets a
 * unique id (prefixed, e.g. "reg_email") that never matches the login form's
 * field names, so browsers and OS password managers don't inject saved logins.
 */
type Kind = 'text' | 'email' | 'new-password';

export function noAutofill(id: string, kind: Kind = 'text'): Record<string, any> {
  const isPassword = kind === 'new-password';
  const props: Record<string, any> = {
    id,
    nativeID: id,
    autoComplete: isPassword ? 'new-password' : 'off',
    autoCorrect: false,
    importantForAutofill: 'no',
    textContentType: isPassword && Platform.OS === 'ios' ? 'newPassword' : 'none',
  };
  if (kind === 'email') props.autoCapitalize = 'none';
  if (Platform.OS === 'web') props.name = id;
  return props;
}

/** Login-form autofill: let password managers work normally. */
export const loginEmailAutofill = {
  autoComplete: 'username' as const,
  textContentType: 'username' as const,
  autoCapitalize: 'none' as const,
  autoCorrect: false,
};
export const loginPasswordAutofill = {
  autoComplete: 'current-password' as const,
  textContentType: 'password' as const,
};
